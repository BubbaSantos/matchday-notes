import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { execFileSync } from 'child_process'
import { readFileSync as fsReadFileSync, existsSync as fsExistsSync } from 'fs'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

interface TableRow {
  team: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

const tableCache = new Map<string, { data: TableRow[]; expiry: number }>()

async function computeLeagueTable(cutoff: string, inclusive: boolean): Promise<TableRow[]> {
  const cacheKey = `${cutoff}:${inclusive}`
  const hit = tableCache.get(cacheKey)
  if (hit && hit.expiry > Date.now()) return hit.data

  const [y, mo] = cutoff.split('-').map(Number)
  const yr = mo >= 7 ? y : y - 1
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard` +
    `?limit=500&dates=${yr}0701-${yr + 1}0630&seasontype=2`

  const resp = await fetch(url)
  const json = (await resp.json()) as { events?: unknown[] }

  const teams: Record<string, Omit<TableRow, 'position' | 'goalDifference'>> = {}
  const ensure = (name: string) => {
    if (!teams[name]) teams[name] = { team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
    return teams[name]
  }

  for (const event of (json.events ?? []) as Record<string, unknown>[]) {
    const comps = (event.competitions as Record<string, unknown>[])?.[0]
    if (!comps) continue
    const status = (comps.status as Record<string, Record<string, unknown>>)?.type
    if (!status?.completed) continue

    // event.date is UTC ISO string, extract YYYY-MM-DD
    const eventDate = (event.date as string).slice(0, 10)
    if (inclusive ? eventDate > cutoff : eventDate >= cutoff) continue

    const competitors = comps.competitors as Record<string, unknown>[]
    const home = competitors?.find((c) => c.homeAway === 'home')
    const away = competitors?.find((c) => c.homeAway === 'away')
    if (!home || !away) continue

    const hs = parseInt(home.score as string)
    const as_ = parseInt(away.score as string)
    if (isNaN(hs) || isNaN(as_)) continue

    const hn = (home.team as Record<string, string>).displayName
    const an = (away.team as Record<string, string>).displayName

    const h = ensure(hn)
    const a = ensure(an)
    h.played++; a.played++
    h.goalsFor += hs; h.goalsAgainst += as_
    a.goalsFor += as_; a.goalsAgainst += hs
    if (hs > as_) { h.won++; h.points += 3; a.lost++ }
    else if (hs < as_) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; h.points++; a.drawn++; a.points++ }
  }

  const sorted = Object.values(teams)
    .map((t, i) => ({ ...t, goalDifference: t.goalsFor - t.goalsAgainst, position: i + 1 }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
    .map((t, i) => ({ ...t, position: i + 1 }))

  tableCache.set(cacheKey, { data: sorted, expiry: Date.now() + 10 * 60 * 1000 })
  return sorted
}

async function handleTableRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const cutoff = url.searchParams.get('cutoff') ?? new Date().toLocaleDateString('en-CA')
    const inclusive = url.searchParams.get('inclusive') !== 'false'
    const table = await computeLeagueTable(cutoff, inclusive)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(table))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

// ── Sofascore match data (incidents, lineups, stats with xG) ─────────────────
// Note: Sofascore blocks Node.js's built-in fetch (403). Use curl via execFileSync.

const SS_CURL_HEADERS = [
  '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
  '-H', 'Referer: https://www.sofascore.com/',
  '-H', 'Accept: application/json',
  '-H', 'Accept-Language: en-GB,en;q=0.5',
  '--compressed',
  '--silent',
]

const CELTIC_SS_ID = 2352

function ssFetch(url: string): unknown {
  try {
    const buf = execFileSync('curl', [...SS_CURL_HEADERS, url], { maxBuffer: 4 * 1024 * 1024 })
    return JSON.parse(buf.toString())
  } catch {
    return null
  }
}

// ── Shared Sofascore page cache ───────────────────────────────────────────────
// Fetches all Celtic team event pages once, populates both the date→id map
// (for match events) and the fixture list (for historical fixtures).

const ssDateMap = new Map<string, number>()           // date → sofascore event id
let ssPageCacheExpiry = 0
const SS_PAGES = 15                                    // ~450 events ≈ 10+ seasons

function ensureSofascorePages() {
  if (Date.now() < ssPageCacheExpiry) return           // still warm

  ssDateMap.clear()
  const fixtures: SSFixture[] = []

  for (let page = 0; page <= SS_PAGES; page++) {
    const data = ssFetch(
      `https://api.sofascore.com/api/v1/team/${CELTIC_SS_ID}/events/last/${page}`
    ) as { events?: Record<string, unknown>[] } | null
    if (!data?.events?.length) break

    for (const e of data.events) {
      const id = e.id as number
      const ts = e.startTimestamp as number
      const dt = new Date(ts * 1000)
      const date = dt.toLocaleDateString('en-CA')

      // Populate date→id map for match events lookups
      ssDateMap.set(date, id)

      // Build historical fixture entry
      const comp = (e.tournament as Record<string, string>)?.name ?? ''
      const mappedComp = SS_COMP_MAP[comp]
      if (mappedComp == null) continue               // null = skip; undefined = unknown

      const homeName = (e.homeTeam as Record<string, string>)?.name
      const awayName = (e.awayTeam as Record<string, string>)?.name
      if (!homeName || !awayName) continue

      const kickoff = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      const status = (e.status as Record<string, unknown>)?.type as string
      const isFinished = status === 'finished'
      const homeScore = (e.homeScore as Record<string, unknown>)?.current as number | undefined
      const awayScore = (e.awayScore as Record<string, unknown>)?.current as number | undefined

      fixtures.push({
        date,
        kickoff,
        home: homeName,
        away: awayName,
        comp: mappedComp,
        homeScore: isFinished && homeScore != null ? homeScore : null,
        awayScore: isFinished && awayScore != null ? awayScore : null,
        state: isFinished ? 'post' : 'pre',
      })
    }
  }

  ssPageCacheExpiry = Date.now() + 6 * 60 * 60 * 1000  // 6 hours
  historicalFixturesCache = fixtures
}

async function getSofascoreId(date: string): Promise<number | null> {
  ensureSofascorePages()
  return ssDateMap.get(date) ?? null
}

type SSPlayer = {
  name: string
  shortName: string
  position: string
  jerseyNumber: string
  starter: boolean      // substitute=false
  used: boolean         // played any minutes
  minutesPlayed?: number
  rating?: string
  captain?: boolean
  subbedInAt?: number
  subbedInAddedTime?: number
  replacedPlayer?: string
  replacedBy?: string
  replacedByAt?: number
  replacedByAddedTime?: number
  statistics?: Record<string, number>
}

type SSIncident = {
  type: 'goal' | 'card' | 'substitution' | 'penaltyShootout' | 'varDecision' | 'period'
  minute: number
  addedTime?: number
  isHome: boolean
  player?: string
  assist?: string
  incidentClass?: string
  scoringType?: string
  playerIn?: string
  playerOut?: string
}

type SSData = {
  incidents: SSIncident[]
  homeLineup: { formation: string; players: SSPlayer[] }
  awayLineup:  { formation: string; players: SSPlayer[] }
  homeTeamName: string
  awayTeamName: string
  homeManager?: string
  awayManager?: string
  stats: Array<{ name: string; home: string; away: string }>
  xG: { home: number; away: number } | null
  confirmed: boolean
}

async function fetchSofascoreData(date: string): Promise<SSData | null> {
  const eventId = await getSofascoreId(date)
  if (!eventId) return null

  const base = `https://api.sofascore.com/api/v1/event/${eventId}`

  const [evJson, incJson, luJson, stJson] = await Promise.all([
    Promise.resolve(ssFetch(base) as Record<string, unknown> | null),
    Promise.resolve(ssFetch(`${base}/incidents`) as Record<string, unknown> | null),
    Promise.resolve(ssFetch(`${base}/lineups`)   as Record<string, unknown> | null),
    Promise.resolve(ssFetch(`${base}/statistics`) as Record<string, unknown> | null),
  ])

  if (!incJson && !luJson && !stJson) return null

  const evData = (evJson?.event as Record<string, Record<string, unknown>>) ?? {}
  const homeTeamName = (evData.homeTeam?.name as string) ?? 'Home'
  const awayTeamName = (evData.awayTeam?.name as string) ?? 'Away'
  const homeManager = ((evData.homeTeam?.manager as Record<string, string>)?.name) ?? undefined
  const awayManager = ((evData.awayTeam?.manager as Record<string, string>)?.name) ?? undefined

  // ── Incidents ──
  const incidents: SSIncident[] = []
  for (const inc of ((incJson?.incidents) as Record<string, unknown>[]) ?? []) {
    const t = inc.incidentType as string
    if (!['goal', 'card', 'substitution'].includes(t)) continue
    incidents.push({
      type: t as SSIncident['type'],
      minute: (inc.time as number) ?? 0,
      addedTime: (inc.addedTime as number) || undefined,
      isHome: (inc.isHome as boolean) ?? false,
      player: (inc.player as Record<string, string>)?.shortName,
      assist: (inc.assist1 as Record<string, string>)?.shortName || undefined,
      incidentClass: (inc.incidentClass as string) || undefined,
      scoringType: (inc.scoringType as string) || undefined,
      playerIn: (inc.playerIn as Record<string, string>)?.shortName,
      playerOut: (inc.playerOut as Record<string, string>)?.shortName,
    })
  }

  // ── Lineups + build sub map ──
  const luData = luJson ?? {}
  const confirmed = (luData.confirmed as boolean) ?? false

  // Build a player→{inAt, replacedPlayer} map from substitution incidents
  type SubInfo = { inAt: number; addedTime?: number; replacedPlayer: string }
  const subMap = new Map<string, SubInfo>() // shortName of playerIn → info
  for (const inc of incidents) {
    if (inc.type === 'substitution' && inc.playerIn && inc.playerOut) {
      subMap.set(inc.playerIn, { inAt: inc.minute, addedTime: inc.addedTime, replacedPlayer: inc.playerOut })
    }
  }
  // Build replacedBy map: playerOut → { playerIn, inAt, addedTime }
  type ReplacedByInfo = { playerIn: string; inAt: number; addedTime?: number }
  const replacedByMap = new Map<string, ReplacedByInfo>()
  for (const [playerIn, info] of subMap.entries()) {
    replacedByMap.set(info.replacedPlayer, { playerIn, inAt: info.inAt, addedTime: info.addedTime })
  }

  function parseSide(side: Record<string, unknown>): { formation: string; players: SSPlayer[] } {
    const formation = (side.formation as string) ?? ''
    const players: SSPlayer[] = []
    for (const p of (side.players as Record<string, unknown>[]) ?? []) {
      const player = p.player as Record<string, unknown>
      const shortName = player.shortName as string
      const isStarter = !(p.substitute as boolean)
      const stats = (p.statistics as Record<string, unknown>) ?? {}
      const mins = stats.minutesPlayed as number | undefined
      const used = typeof mins === 'number' && mins > 0
      const subInfo = subMap.get(shortName)
      players.push({
        name: player.name as string,
        shortName,
        position: (p.position ?? player.position) as string,
        jerseyNumber: (p.jerseyNumber ?? player.jerseyNumber) as string,
        starter: isStarter,
        used,
        minutesPlayed: mins,
        rating: (stats.rating as number)?.toFixed(1) ?? undefined,
        captain: (p.captain as boolean) || undefined,
        subbedInAt: subInfo?.inAt,
        subbedInAddedTime: subInfo?.addedTime,
        replacedPlayer: subInfo?.replacedPlayer,
        replacedBy: isStarter ? replacedByMap.get(shortName)?.playerIn : undefined,
        replacedByAt: isStarter ? replacedByMap.get(shortName)?.inAt : undefined,
        replacedByAddedTime: isStarter ? replacedByMap.get(shortName)?.addedTime : undefined,
        statistics: Object.fromEntries(
          Object.entries(stats).filter(([, v]) => typeof v === 'number')
        ) as Record<string, number>,
      })
    }
    // Sort: starters first (by position order), then subs used, then unused
    players.sort((a, b) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1
      if (a.used !== b.used) return a.used ? -1 : 1
      return 0
    })
    return { formation, players }
  }

  const homeRaw = (luData.home as Record<string, unknown>) ?? {}
  const awayRaw = (luData.away as Record<string, unknown>) ?? {}

  // ── Statistics ──
  const stData = stJson ?? {}
  const allPeriod = (stData.statistics as Record<string, unknown>[])?.find((g: Record<string, unknown>) => g.period === 'ALL')
  const statItems: Array<{ name: string; home: string; away: string }> = []
  let xG: { home: number; away: number } | null = null

  for (const group of (allPeriod?.groups as Record<string, unknown>[]) ?? []) {
    for (const item of (group.statisticsItems as Record<string, string>[]) ?? []) {
      statItems.push({ name: item.name, home: item.home, away: item.away })
      if (item.name === 'Expected goals') {
        xG = { home: parseFloat(item.home), away: parseFloat(item.away) }
      }
    }
  }
  // Deduplicate stat names (some appear in multiple groups)
  const seen = new Set<string>()
  const stats = statItems.filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true })

  return {
    incidents,
    homeLineup: parseSide(homeRaw),
    awayLineup: parseSide(awayRaw),
    homeTeamName,
    awayTeamName,
    homeManager,
    awayManager,
    stats,
    xG,
    confirmed,
  }
}

async function handleMatchEventsRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const date = url.searchParams.get('date') ?? ''
    if (!date) { res.statusCode = 400; res.end('{"error":"date required"}'); return }
    const data = await fetchSofascoreData(date)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

// ── Historical fixtures from Sofascore ───────────────────────────────────────

const SS_COMP_MAP: Record<string, string | null> = {
  'Scottish Premiership':                         'League',
  'Scottish Premiership, Champion':               'League',
  'Scottish Premiership, Relegation':             'League',
  'Scottish Cup':                                 'Scottish Cup',
  'Scottish League Cup':                          'League Cup',
  'UEFA Champions League':                        'Champions League',
  'UEFA Champions League, League Phase':          'Champions League',
  'UEFA Champions League, Playoff':               'Champions League',
  'UEFA Champions League, Knockout Round Playoffs': 'Champions League',
  'UEFA Champions League, Group E':               'Champions League',
  'UEFA Champions League, Group F':               'Champions League',
  'UEFA Champions League, Group G':               'Champions League',
  'UEFA Champions League, Group H':               'Champions League',
  'UEFA Europa League':                           'Europa League',
  'UEFA Europa League, League Phase':             'Europa League',
  'UEFA Europa League, Group Stage':              'Europa League',
  'UEFA Europa Conference League':                'Conference League',
  'UEFA Europa Conference League, League Phase':  'Conference League',
  'UEFA Europa Conference League, Group Stage':   'Conference League',
  'Club Friendly Games':                          null, // skip
  'Friendly International':                       null,
  'Friendlies':                                   null,
}

type SSFixture = {
  date: string
  kickoff: string
  home: string
  away: string
  comp: string
  homeScore: number | null
  awayScore: number | null
  state: 'pre' | 'post'
  stadiumName?: string
}

// Populated by ensureSofascorePages() — do not write to directly
let historicalFixturesCache: SSFixture[] = []

async function handleHistoricalFixturesRequest(_req: IncomingMessage, res: ServerResponse) {
  try {
    ensureSofascorePages()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(historicalFixturesCache))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

const SPFL_SCRIPT = path.resolve(
  process.env.HOME!,
  'repos/quickshell-config/scripts/spfl-fixtures'
)
const LEAGUE_CUP_ICS = path.resolve(process.env.HOME!, 'Sync/quickshell/league-cup.ics')
const SCOTTISH_CUP_ICS = path.resolve(process.env.HOME!, 'Sync/quickshell/scottish-cup.ics')

const STADIUM_MAP: Record<string, string> = {
  'Celtic':                    'Celtic Park',
  'Rangers':                   'Ibrox Stadium',
  'Hearts':                    'Tynecastle Park',
  'Heart of Midlothian':       'Tynecastle Park',
  'Hibernian':                 'Easter Road',
  'Hibs':                      'Easter Road',
  'Aberdeen':                  'Pittodrie Stadium',
  'Kilmarnock':                'Rugby Park',
  'Motherwell':                'Fir Park',
  'St Mirren':                 'SMiSA Stadium',
  'St Johnstone':              'McDiarmid Park',
  'Dundee Utd':                'Tannadice Park',
  'Dundee United':             'Tannadice Park',
  'Dundee':                    'Dens Park',
  'Ross Co':                   'Global Energy Stadium',
  'Ross County':               'Global Energy Stadium',
  'Falkirk':                   'Falkirk Stadium',
  'Livi':                      'Almondvale Stadium',
  'Livingston':                'Almondvale Stadium',
  'Partick':                   'Firhill Stadium',
  'Partick Thistle':           'Firhill Stadium',
  'Inverness CT':              'Caledonian Stadium',
  'Inverness Caledonian Thistle': 'Caledonian Stadium',
  'St Mirren FC':              'SMiSA Stadium',
  'Dunfermline':               'East End Park',
  'Dunfermline Athletic':      'East End Park',
  'Ayr United':                'Somerset Park',
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

// Parse an ICS file and return enrichments keyed by local date string (YYYY-MM-DD).
// Since Celtic plays at most one cup match per day, date is a unique enough key.
function parseICSByDate(filePath: string): Map<string, { location?: string; round?: string }> {
  const result = new Map<string, { location?: string; round?: string }>()
  if (!fsExistsSync(filePath)) return result

  const text = fsReadFileSync(filePath, 'utf8')
  // Unfold ICS continuation lines (next line starts with space/tab)
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let inEvent = false
  let dtstart = '', location = '', description = ''

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; dtstart = location = description = ''; continue }
    if (line === 'END:VEVENT') {
      if (inEvent && dtstart) {
        // Parse UTC timestamp to local date
        const raw = dtstart.trim()
        const formatted = raw.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
          '$1-$2-$3T$4:$5:$6Z'
        )
        const dt = new Date(formatted)
        if (!isNaN(dt.getTime())) {
          // en-CA gives YYYY-MM-DD in the local timezone
          const dateLocal = dt.toLocaleDateString('en-CA')

          // Parse round: DESCRIPTION is "url\nComp 2026\nRound X" (literal \n)
          const descParts = description.replace(/\\n/g, '\n').split('\n')
          const roundRaw = descParts[2]?.trim() || ''
          const round = roundRaw ? normalizeRound(roundRaw) : undefined

          result.set(dateLocal, {
            location: location || undefined,
            round: round || undefined,
          })
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

// ── ESPN cup score backfill ───────────────────────────────────────────────────

// Cache: date → map of "homeTeamName|awayTeamName" → { homeScore, awayScore }
const espnCupScoreCache = new Map<string, { data: Map<string, { home: number; away: number }>; expiry: number }>()

async function fetchESPNCupScoresForDate(date: string): Promise<Map<string, { home: number; away: number }>> {
  const hit = espnCupScoreCache.get(date)
  if (hit && hit.expiry > Date.now()) return hit.data

  const dateCompact = date.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateCompact}-${dateCompact}&limit=100`
  const scoreMap = new Map<string, { home: number; away: number }>()

  try {
    const resp = await fetch(url)
    if (!resp.ok) return scoreMap
    const json = await resp.json() as { events?: Record<string, unknown>[] }
    for (const ev of json.events ?? []) {
      const comp = (ev.competitions as Record<string, unknown>[])?.[0]
      if (!comp) continue
      const status = (comp.status as Record<string, Record<string, unknown>>)?.type?.completed
      if (!status) continue
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
  } catch { /* ignore */ }

  espnCupScoreCache.set(date, { data: scoreMap, expiry: Date.now() + 30 * 60 * 1000 })
  return scoreMap
}

// Name variations the Python script uses vs ESPN display names
const TEAM_NAME_MAP: Record<string, string> = {
  'Celtic':           'Celtic',
  'Rangers':          'Rangers',
  'Dundee Utd':       'Dundee United',
  'St Mirren':        'St. Mirren',
  'St Johnstone':     'St. Johnstone',
  'Dundee':           'Dundee FC',
  'Ross County':      'Ross County',
  'Kilmarnock':       'Kilmarnock',
  'Aberdeen':         'Aberdeen',
  'Hibs':             'Hibernian',
  'Hearts':           'Heart of Midlothian',
  'Motherwell':       'Motherwell',
  'Livingston':       'Livingston',
  'Livi':             'Livingston',
  'Partick':          'Partick Thistle',
  'Hamilton':         'Hamilton Academical',
  'Falkirk':          'Falkirk',
  'Dunfermline':      'Dunfermline Athletic',
  'Auchinleck Talbot':'Auchinleck Talbot',
}

function toESPNName(name: string): string {
  return TEAM_NAME_MAP[name] ?? name
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fixtures-api',
      configureServer(server) {
        server.middlewares.use('/api/table', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleTableRequest(req, res)
        })

        server.middlewares.use('/api/match-events', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleMatchEventsRequest(req, res)
        })

        server.middlewares.use('/api/historical-fixtures', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleHistoricalFixturesRequest(req, res)
        })

        server.middlewares.use('/api/fixtures', (_req, res) => {
          ;(async () => {
            try {
              const raw = execFileSync('python3', [SPFL_SCRIPT], {
                timeout: 30_000,
                encoding: 'utf8',
              })
              const data = JSON.parse(raw)

              const leagueCupMap = parseICSByDate(LEAGUE_CUP_ICS)
              const scottishCupMap = parseICSByDate(SCOTTISH_CUP_ICS)
              const today = new Date().toLocaleDateString('en-CA')

              // Find Celtic non-league fixtures that are in the past but have no score
              const NON_LEAGUE_COMPS = new Set(['League Cup', 'Scottish Cup', 'Champions League', 'Europa League', 'Europa Conference League'])
              const missingScoreDates = new Set<string>()
              for (const f of data.fixtures as Record<string, unknown>[]) {
                const isCup = NON_LEAGUE_COMPS.has(f.comp as string)
                const isCeltic = f.home === 'Celtic' || f.away === 'Celtic'
                const isPast = (f.date as string) <= today
                const missingScore = f.homeScore == null || f.awayScore == null
                if (isCup && isCeltic && isPast && missingScore) {
                  missingScoreDates.add(f.date as string)
                }
              }

              // Fetch ESPN scores for those dates
              const espnScores = new Map<string, Map<string, { home: number; away: number }>>()
              await Promise.all(
                [...missingScoreDates].map(async (date) => {
                  espnScores.set(date, await fetchESPNCupScoresForDate(date))
                })
              )

              const enriched = (data.fixtures as Record<string, unknown>[]).map((f) => {
                let stadiumName: string | undefined = STADIUM_MAP[f.home as string]
                let round: string | undefined
                let homeScore = f.homeScore
                let awayScore = f.awayScore
                let state = f.state

                if (f.comp === 'League Cup') {
                  const d = leagueCupMap.get(f.date as string)
                  if (d?.location) stadiumName = d.location
                  if (d?.round) round = d.round
                } else if (f.comp === 'Scottish Cup') {
                  const d = scottishCupMap.get(f.date as string)
                  if (d?.location) stadiumName = d.location
                  if (d?.round) round = d.round
                }

                // Backfill missing cup scores from ESPN
                if ((homeScore == null || awayScore == null) && espnScores.has(f.date as string)) {
                  const dateScores = espnScores.get(f.date as string)!
                  const homeESPN = toESPNName(f.home as string)
                  const awayESPN = toESPNName(f.away as string)
                  const match = dateScores.get(`${homeESPN}|${awayESPN}`)
                  if (match) {
                    homeScore = match.home
                    awayScore = match.away
                    state = 'post'
                  }
                }

                return { ...f, stadiumName, round, homeScore, awayScore, state }
              })

              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Cache-Control', 'no-cache')
              res.end(JSON.stringify({ ...data, fixtures: enriched }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })()
        })
      },
    },
  ],
  server: {
    proxy: {
      '/api/sportmonks': {
        target: 'https://api.sportmonks.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/sportmonks/, ''),
      },
    },
  },
})
