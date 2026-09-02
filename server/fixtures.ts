// Enriches the raw SPFL fixture list with stadium names / round labels pulled
// from the bundled cup ICS files, and backfills any missing cup scores from
// ESPN's global scoreboard. Ported from the fixtures-api Vite middleware so it
// can run identically from a Vercel serverless function.
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchSpflFixtures, abbrev, type RawFixture, type ScriptOutput } from './spflFixtures.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEAGUE_CUP_ICS = path.resolve(__dirname, '../data/league-cup.ics')
const SCOTTISH_CUP_ICS = path.resolve(__dirname, '../data/scottish-cup.ics')

const STADIUM_MAP: Record<string, string> = {
  'Celtic': 'Celtic Park',
  'Rangers': 'Ibrox Stadium',
  'Hearts': 'Tynecastle Park',
  'Heart of Midlothian': 'Tynecastle Park',
  'Hibernian': 'Easter Road',
  'Hibs': 'Easter Road',
  'Aberdeen': 'Pittodrie Stadium',
  'Kilmarnock': 'Rugby Park',
  'Motherwell': 'Fir Park',
  'St Mirren': 'SMiSA Stadium',
  'St Johnstone': 'McDiarmid Park',
  'Dundee Utd': 'Tannadice Park',
  'Dundee United': 'Tannadice Park',
  'Dundee': 'Dens Park',
  'Ross Co': 'Global Energy Stadium',
  'Ross County': 'Global Energy Stadium',
  'Falkirk': 'Falkirk Stadium',
  'Livi': 'Almondvale Stadium',
  'Livingston': 'Almondvale Stadium',
  'Partick': 'Firhill Stadium',
  'Partick Thistle': 'Firhill Stadium',
  'Inverness CT': 'Caledonian Stadium',
  'Inverness Caledonian Thistle': 'Caledonian Stadium',
  'St Mirren FC': 'SMiSA Stadium',
  'Dunfermline': 'East End Park',
  'Dunfermline Athletic': 'East End Park',
  'Ayr United': 'Somerset Park',
}

export function normalizeRound(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (s === 'final') return 'Final'
  if (['1/2', 'semi-final', 'semi-finals', 'semifinals'].includes(s)) return 'Semi-final'
  if (['1/4', 'quarter-final', 'quarter-finals', 'quarterfinals'].includes(s)) return 'Quarter-final'
  if (['1/8', 'round of 16', 'last 16'].includes(s)) return 'Last 16'
  if (s === '1/16') return 'Last 32'
  if (s.startsWith('round ')) return 'Round ' + s.slice(6).trim()
  if (s === 'group stage') return 'Group Stage'
  if (s === 'league phase') return 'League Phase'
  if (s === 'knockout round play-offs') return 'Playoff'
  return raw.trim()
}

// Keyed by date + home + away, not just date — cup rounds routinely have
// several ties on the same day, so a date-only key silently let one
// fixture's location/round overwrite another's (e.g. a Celtic tie ending up
// with a different same-day tie's venue).
function parseICSByDateAndTeams(filePath: string): Map<string, { location?: string; round?: string }> {
  const result = new Map<string, { location?: string; round?: string }>()
  if (!existsSync(filePath)) return result

  const text = readFileSync(filePath, 'utf8')
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let inEvent = false
  let dtstart = '', location = '', description = '', summary = ''

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; dtstart = location = description = summary = ''; continue }
    if (line === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const raw = dtstart.trim()
        const formatted = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z')
        const dt = new Date(formatted)
        const cleanedSummary = summary.replace(/^[^\w-]+/, '').trim()
        const teamsMatch = cleanedSummary.match(/^(.+?)\s+-\s+(.+?)(?:\s+\(\d+-\d+\))?$/)
        if (!isNaN(dt.getTime()) && teamsMatch) {
          const dateLocal = dt.toLocaleDateString('en-CA')
          const home = abbrev(teamsMatch[1].trim())
          const away = abbrev(teamsMatch[2].trim())
          const descParts = description.replace(/\\n/g, '\n').split('\n')
          const roundRaw = descParts[2]?.trim() || ''
          const round = roundRaw ? normalizeRound(roundRaw) : undefined
          result.set(`${dateLocal}|${home.toLowerCase()}|${away.toLowerCase()}`, { location: location || undefined, round })
        }
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (line.startsWith('DTSTART:')) dtstart = line.slice(8)
    if (line.startsWith('LOCATION:')) location = line.slice(9).trim()
    if (line.startsWith('DESCRIPTION:')) description = line.slice(12)
    if (line.startsWith('SUMMARY:')) summary = line.slice(8)
  }
  return result
}

interface ESPNCupMatch {
  home: number
  away: number
  penaltyHome?: number
  penaltyAway?: number
  venue?: string
}

const espnCupScoreCache = new Map<string, { data: Map<string, ESPNCupMatch>; expiry: number }>()

// ESPN is the authoritative source here — it's the only one of our sources
// that distinguishes a penalty-shootout result (status STATUS_FINAL_PEN,
// with a separate `shootoutScore` per competitor) from the actual match
// score. The bundled cup ICS files, sourced from fotmob, write a shootout
// result in the exact same "(H-A)" bracket as a normal score with nothing
// to tell them apart — e.g. a 0-0 draw settled 4-2 on penalties shows up as
// literally "(2-4)" (home-away shootout score) with no regulation score at
// all. So this both backfills missing scores AND overrides any (possibly
// penalty-mislabeled) score/venue already present, for every past cup
// fixture — not just ones missing a score.
async function fetchESPNCupScoresForDate(date: string): Promise<Map<string, ESPNCupMatch>> {
  const hit = espnCupScoreCache.get(date)
  if (hit && hit.expiry > Date.now()) return hit.data

  const dateCompact = date.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateCompact}-${dateCompact}&limit=100`
  const scoreMap = new Map<string, ESPNCupMatch>()

  try {
    const resp = await fetch(url)
    if (resp.ok) {
      const json = await resp.json() as { events?: Record<string, unknown>[] }
      for (const ev of json.events ?? []) {
        const comp = (ev.competitions as Record<string, unknown>[])?.[0]
        if (!comp) continue
        const statusType = (comp.status as Record<string, Record<string, unknown>>)?.type
        if (!statusType?.completed) continue
        const competitors = comp.competitors as Record<string, unknown>[] | undefined
        if (!competitors || competitors.length < 2) continue
        const home = competitors.find((c) => c.homeAway === 'home')
        const away = competitors.find((c) => c.homeAway === 'away')
        if (!home || !away) continue
        const homeName = (home.team as Record<string, string>)?.displayName ?? ''
        const awayName = (away.team as Record<string, string>)?.displayName ?? ''
        const homeScore = parseInt(home.score as string, 10)
        const awayScore = parseInt(away.score as string, 10)
        if (isNaN(homeScore) || isNaN(awayScore)) continue

        const isPenalties = statusType.name === 'STATUS_FINAL_PEN'
        const penaltyHome = isPenalties ? (home.shootoutScore as number | undefined) : undefined
        const penaltyAway = isPenalties ? (away.shootoutScore as number | undefined) : undefined
        const venue = (comp.venue as Record<string, string>)?.fullName

        scoreMap.set(`${homeName}|${awayName}`, { home: homeScore, away: awayScore, penaltyHome, penaltyAway, venue })
      }
    }
  } catch { /* ignore */ }

  espnCupScoreCache.set(date, { data: scoreMap, expiry: Date.now() + 30 * 60 * 1000 })
  return scoreMap
}

const TEAM_NAME_MAP: Record<string, string> = {
  'Celtic': 'Celtic',
  'Rangers': 'Rangers',
  'Dundee Utd': 'Dundee United',
  'St Mirren': 'St. Mirren',
  'St Johnstone': 'St. Johnstone',
  'Dundee': 'Dundee FC',
  'Ross County': 'Ross County',
  'Kilmarnock': 'Kilmarnock',
  'Aberdeen': 'Aberdeen',
  'Hibs': 'Hibernian',
  'Hearts': 'Heart of Midlothian',
  'Motherwell': 'Motherwell',
  'Livingston': 'Livingston',
  'Livi': 'Livingston',
  'Partick': 'Partick Thistle',
  'Hamilton': 'Hamilton Academical',
  'Falkirk': 'Falkirk',
  'Dunfermline': 'Dunfermline Athletic',
  'Auchinleck Talbot': 'Auchinleck Talbot',
}

function toESPNName(name: string): string {
  return TEAM_NAME_MAP[name] ?? name
}

export async function getEnrichedFixtures(): Promise<ScriptOutput> {
  const data = await fetchSpflFixtures()

  const leagueCupMap = parseICSByDateAndTeams(LEAGUE_CUP_ICS)
  const scottishCupMap = parseICSByDateAndTeams(SCOTTISH_CUP_ICS)
  const today = new Date().toLocaleDateString('en-CA')

  // Query ESPN for every past cup/UEFA date, not just ones missing a score —
  // it's also the only way to catch a penalty-shootout result that the ICS
  // data mislabeled as a normal score (see fetchESPNCupScoresForDate).
  const NON_LEAGUE_COMPS = new Set(['League Cup', 'Scottish Cup', 'Champions League', 'Europa League', 'Europa Conference League'])
  const pastCupDates = new Set<string>()
  for (const f of data.fixtures) {
    if (NON_LEAGUE_COMPS.has(f.comp) && f.date <= today) pastCupDates.add(f.date)
  }

  const espnScores = new Map<string, Map<string, ESPNCupMatch>>()
  await Promise.all(
    [...pastCupDates].map(async (date) => {
      espnScores.set(date, await fetchESPNCupScoresForDate(date))
    })
  )

  const enriched: (RawFixture & { stadiumName?: string; round?: string; penaltyHome?: number; penaltyAway?: number })[] =
    data.fixtures.map((f: RawFixture) => {
      let stadiumName: string | undefined = STADIUM_MAP[f.home]
      let round: string | undefined
      let homeScore = f.homeScore
      let awayScore = f.awayScore
      let state = f.state
      let penaltyHome: number | undefined
      let penaltyAway: number | undefined

      const icsKey = `${f.date}|${f.home.toLowerCase()}|${f.away.toLowerCase()}`
      if (f.comp === 'League Cup') {
        const d = leagueCupMap.get(icsKey)
        if (d?.location) stadiumName = d.location
        if (d?.round) round = d.round
      } else if (f.comp === 'Scottish Cup') {
        const d = scottishCupMap.get(icsKey)
        if (d?.location) stadiumName = d.location
        if (d?.round) round = d.round
      }

      const dateScores = espnScores.get(f.date)
      const espnMatch = dateScores?.get(`${toESPNName(f.home)}|${toESPNName(f.away)}`)
      if (espnMatch) {
        homeScore = espnMatch.home
        awayScore = espnMatch.away
        state = 'post'
        penaltyHome = espnMatch.penaltyHome
        penaltyAway = espnMatch.penaltyAway
        if (espnMatch.venue) stadiumName = espnMatch.venue
      }

      return { ...f, stadiumName, round, homeScore, awayScore, state, penaltyHome, penaltyAway }
    })

  return { ...data, fixtures: enriched }
}
