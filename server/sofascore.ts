// Sofascore match data (incidents, lineups, stats with xG) + historical fixtures.
// Sofascore's API blocks Node's plain `fetch` (403 — TLS/JA3 fingerprinting), so
// requests go through got-scraping, which mimics a real browser's TLS/HTTP2
// fingerprint. This works from both the local Vite dev server and Vercel's
// Node serverless runtime.
import { gotScraping } from 'got-scraping'

const CELTIC_SS_ID = 2352

// got-scraping's browser-fingerprint spoofing beats Sofascore's bot detection
// only some of the time (empirically ~20-30% success per attempt, not a hard
// pass/fail) — so retry a handful of times before giving up.
const SS_FETCH_ATTEMPTS = 6

async function ssFetch<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < SS_FETCH_ATTEMPTS; attempt++) {
    try {
      const resp = await gotScraping(url, {
        headers: { Referer: 'https://www.sofascore.com/' },
        timeout: { request: 15_000 },
      })
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return JSON.parse(resp.body) as T
      }
    } catch { /* fall through to retry */ }
  }
  return null
}

export type SSPlayer = {
  name: string
  shortName: string
  position: string
  jerseyNumber: string
  starter: boolean
  used: boolean
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

export type SSIncident = {
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

export type SSData = {
  incidents: SSIncident[]
  homeLineup: { formation: string; players: SSPlayer[] }
  awayLineup: { formation: string; players: SSPlayer[] }
  homeTeamName: string
  awayTeamName: string
  homeManager?: string
  awayManager?: string
  stats: Array<{ name: string; home: string; away: string }>
  xG: { home: number; away: number } | null
  confirmed: boolean
}

export type SSFixture = {
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

const SS_COMP_MAP: Record<string, string | null> = {
  'Scottish Premiership': 'League',
  'Scottish Premiership, Champion': 'League',
  'Scottish Premiership, Relegation': 'League',
  'Scottish Cup': 'Scottish Cup',
  'Scottish League Cup': 'League Cup',
  'UEFA Champions League': 'Champions League',
  'UEFA Champions League, League Phase': 'Champions League',
  'UEFA Champions League, Playoff': 'Champions League',
  'UEFA Champions League, Knockout Round Playoffs': 'Champions League',
  'UEFA Champions League, Group E': 'Champions League',
  'UEFA Champions League, Group F': 'Champions League',
  'UEFA Champions League, Group G': 'Champions League',
  'UEFA Champions League, Group H': 'Champions League',
  'UEFA Europa League': 'Europa League',
  'UEFA Europa League, League Phase': 'Europa League',
  'UEFA Europa League, Group Stage': 'Europa League',
  'UEFA Europa Conference League': 'Conference League',
  'UEFA Europa Conference League, League Phase': 'Conference League',
  'UEFA Europa Conference League, Group Stage': 'Conference League',
  'Club Friendly Games': null,
  'Friendly International': null,
  'Friendlies': null,
}

const ssDateMap = new Map<string, number>()
let ssPageCacheExpiry = 0
let historicalFixturesCache: SSFixture[] = []
const SS_PAGES = 15

async function ensureSofascorePages(): Promise<void> {
  if (Date.now() < ssPageCacheExpiry) return

  ssDateMap.clear()
  const fixtures: SSFixture[] = []

  for (let page = 0; page <= SS_PAGES; page++) {
    const data = await ssFetch<{ events?: Record<string, unknown>[] }>(
      `https://api.sofascore.com/api/v1/team/${CELTIC_SS_ID}/events/last/${page}`
    )
    // Page 0 failing outright (all retries exhausted) means Sofascore is
    // fully blocking us right now — don't cache that as "no fixtures" for
    // 6 hours, just leave the cache stale so the next call retries.
    if (page === 0 && data == null) return
    if (!data?.events?.length) break

    for (const e of data.events) {
      const id = e.id as number
      const ts = e.startTimestamp as number
      const dt = new Date(ts * 1000)
      const date = dt.toLocaleDateString('en-CA')

      ssDateMap.set(date, id)

      const comp = ((e.tournament as Record<string, string>)?.name) ?? ''
      const mappedComp = SS_COMP_MAP[comp]
      if (mappedComp == null) continue

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

  ssPageCacheExpiry = Date.now() + 6 * 60 * 60 * 1000
  historicalFixturesCache = fixtures
}

export async function getHistoricalFixtures(): Promise<SSFixture[]> {
  await ensureSofascorePages()
  return historicalFixturesCache
}

async function getSofascoreId(date: string): Promise<number | null> {
  await ensureSofascorePages()
  return ssDateMap.get(date) ?? null
}

export async function fetchSofascoreData(date: string): Promise<SSData | null> {
  const eventId = await getSofascoreId(date)
  if (!eventId) return null

  const base = `https://api.sofascore.com/api/v1/event/${eventId}`

  const [evJson, incJson, luJson, stJson] = await Promise.all([
    ssFetch<Record<string, unknown>>(base),
    ssFetch<Record<string, unknown>>(`${base}/incidents`),
    ssFetch<Record<string, unknown>>(`${base}/lineups`),
    ssFetch<Record<string, unknown>>(`${base}/statistics`),
  ])

  if (!incJson && !luJson && !stJson) return null

  const evData = (evJson?.event as Record<string, Record<string, unknown>>) ?? {}
  const homeTeamName = (evData.homeTeam?.name as string) ?? 'Home'
  const awayTeamName = (evData.awayTeam?.name as string) ?? 'Away'
  const homeManager = ((evData.homeTeam?.manager as Record<string, string>)?.name) ?? undefined
  const awayManager = ((evData.awayTeam?.manager as Record<string, string>)?.name) ?? undefined

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

  const luData = luJson ?? {}
  const confirmed = (luData.confirmed as boolean) ?? false

  type SubInfo = { inAt: number; addedTime?: number; replacedPlayer: string }
  const subMap = new Map<string, SubInfo>()
  for (const inc of incidents) {
    if (inc.type === 'substitution' && inc.playerIn && inc.playerOut) {
      subMap.set(inc.playerIn, { inAt: inc.minute, addedTime: inc.addedTime, replacedPlayer: inc.playerOut })
    }
  }
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
    players.sort((a, b) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1
      if (a.used !== b.used) return a.used ? -1 : 1
      return 0
    })
    return { formation, players }
  }

  const homeRaw = (luData.home as Record<string, unknown>) ?? {}
  const awayRaw = (luData.away as Record<string, unknown>) ?? {}

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
  const seen = new Set<string>()
  const stats = statItems.filter((s) => { if (seen.has(s.name)) return false; seen.add(s.name); return true })

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
