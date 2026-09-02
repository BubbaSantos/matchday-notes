// Enriches the raw SPFL fixture list with stadium names / round labels pulled
// from the bundled cup ICS files, and backfills any missing cup scores from
// ESPN's global scoreboard. Ported from the fixtures-api Vite middleware so it
// can run identically from a Vercel serverless function.
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchSpflFixtures, type RawFixture, type ScriptOutput } from './spflFixtures.js'

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

function normalizeRound(raw: string): string {
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

function parseICSByDate(filePath: string): Map<string, { location?: string; round?: string }> {
  const result = new Map<string, { location?: string; round?: string }>()
  if (!existsSync(filePath)) return result

  const text = readFileSync(filePath, 'utf8')
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let inEvent = false
  let dtstart = '', location = '', description = ''

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; dtstart = location = description = ''; continue }
    if (line === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const raw = dtstart.trim()
        const formatted = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z')
        const dt = new Date(formatted)
        if (!isNaN(dt.getTime())) {
          const dateLocal = dt.toLocaleDateString('en-CA')
          const descParts = description.replace(/\\n/g, '\n').split('\n')
          const roundRaw = descParts[2]?.trim() || ''
          const round = roundRaw ? normalizeRound(roundRaw) : undefined
          result.set(dateLocal, { location: location || undefined, round })
        }
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (line.startsWith('DTSTART:')) dtstart = line.slice(8)
    if (line.startsWith('LOCATION:')) location = line.slice(9).trim()
    if (line.startsWith('DESCRIPTION:')) description = line.slice(12)
  }
  return result
}

const espnCupScoreCache = new Map<string, { data: Map<string, { home: number; away: number }>; expiry: number }>()

async function fetchESPNCupScoresForDate(date: string): Promise<Map<string, { home: number; away: number }>> {
  const hit = espnCupScoreCache.get(date)
  if (hit && hit.expiry > Date.now()) return hit.data

  const dateCompact = date.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateCompact}-${dateCompact}&limit=100`
  const scoreMap = new Map<string, { home: number; away: number }>()

  try {
    const resp = await fetch(url)
    if (resp.ok) {
      const json = await resp.json() as { events?: Record<string, unknown>[] }
      for (const ev of json.events ?? []) {
        const comp = (ev.competitions as Record<string, unknown>[])?.[0]
        if (!comp) continue
        const completed = (comp.status as Record<string, Record<string, unknown>>)?.type?.completed
        if (!completed) continue
        const competitors = comp.competitors as Record<string, unknown>[] | undefined
        if (!competitors || competitors.length < 2) continue
        const home = competitors.find((c) => c.homeAway === 'home')
        const away = competitors.find((c) => c.homeAway === 'away')
        if (!home || !away) continue
        const homeName = (home.team as Record<string, string>)?.displayName ?? ''
        const awayName = (away.team as Record<string, string>)?.displayName ?? ''
        const homeScore = parseInt(home.score as string, 10)
        const awayScore = parseInt(away.score as string, 10)
        if (!isNaN(homeScore) && !isNaN(awayScore)) {
          scoreMap.set(`${homeName}|${awayName}`, { home: homeScore, away: awayScore })
        }
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

  const leagueCupMap = parseICSByDate(LEAGUE_CUP_ICS)
  const scottishCupMap = parseICSByDate(SCOTTISH_CUP_ICS)
  const today = new Date().toLocaleDateString('en-CA')

  const NON_LEAGUE_COMPS = new Set(['League Cup', 'Scottish Cup', 'Champions League', 'Europa League', 'Europa Conference League'])
  const missingScoreDates = new Set<string>()
  for (const f of data.fixtures) {
    const isCup = NON_LEAGUE_COMPS.has(f.comp)
    const isPast = f.date <= today
    const missingScore = f.homeScore == null || f.awayScore == null
    if (isCup && isPast && missingScore) missingScoreDates.add(f.date)
  }

  const espnScores = new Map<string, Map<string, { home: number; away: number }>>()
  await Promise.all(
    [...missingScoreDates].map(async (date) => {
      espnScores.set(date, await fetchESPNCupScoresForDate(date))
    })
  )

  const enriched: (RawFixture & { stadiumName?: string; round?: string })[] = data.fixtures.map((f: RawFixture) => {
    let stadiumName: string | undefined = STADIUM_MAP[f.home]
    let round: string | undefined
    let homeScore = f.homeScore
    let awayScore = f.awayScore
    let state = f.state

    if (f.comp === 'League Cup') {
      const d = leagueCupMap.get(f.date)
      if (d?.location) stadiumName = d.location
      if (d?.round) round = d.round
    } else if (f.comp === 'Scottish Cup') {
      const d = scottishCupMap.get(f.date)
      if (d?.location) stadiumName = d.location
      if (d?.round) round = d.round
    }

    if ((homeScore == null || awayScore == null) && espnScores.has(f.date)) {
      const dateScores = espnScores.get(f.date)!
      const homeESPN = toESPNName(f.home)
      const awayESPN = toESPNName(f.away)
      const match = dateScores.get(`${homeESPN}|${awayESPN}`)
      if (match) {
        homeScore = match.home
        awayScore = match.away
        state = 'post'
      }
    }

    return { ...f, stadiumName, round, homeScore, awayScore, state }
  })

  return { ...data, fixtures: enriched }
}
