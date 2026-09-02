// Sofascore match data (incidents, lineups, stats with xG) + historical fixtures.
// Sofascore's API blocks Node's plain `fetch` (403 — TLS/JA3 fingerprinting) and,
// worse, blocks Vercel's datacenter IP ranges outright — got-scraping's browser
// fingerprint spoofing alone only got through ~20-30% of the time locally, and
// 0% from Vercel. So requests go through ScraperAPI's API-endpoint integration
// (proxy-port mode is gated to paid plans; the API endpoint works on the free
// trial), which handles both the IP reputation and fingerprinting problems.
// Falls back to unproxied got-scraping (works some of the time locally) if
// SCRAPERAPI_KEY isn't configured.
import { gotScraping } from 'got-scraping'
import { normalizeRound } from './fixtures.js'

const CELTIC_SS_ID = 2352
const SS_FETCH_ATTEMPTS = 4

function scraperApiUrl(target: string): string | undefined {
  const key = process.env.SCRAPERAPI_KEY
  return key ? `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(target)}` : undefined
}

async function ssFetch<T>(url: string): Promise<T | null> {
  const viaScraperApi = scraperApiUrl(url)
  for (let attempt = 0; attempt < SS_FETCH_ATTEMPTS; attempt++) {
    try {
      if (viaScraperApi) {
        const resp = await fetch(viaScraperApi, { signal: AbortSignal.timeout(30_000) })
        if (resp.ok) return (await resp.json()) as T
      } else {
        const resp = await gotScraping(url, {
          headers: { Referer: 'https://www.sofascore.com/' },
          timeout: { request: 20_000 },
        })
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          return JSON.parse(resp.body) as T
        }
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
  penaltyHome?: number
  penaltyAway?: number
  state: 'pre' | 'post'
  stadiumName?: string
  round?: string
}

// Sofascore's tournament.name carries a stage suffix that varies a lot —
// "UEFA Europa League, Group G", ", Knockout stage", ", Qualification",
// ", League Phase", and (inconsistently, across seasons) "UEFA Conference
// League" vs "UEFA Europa Conference League" for the same competition. An
// exact-match lookup table silently drops anything not spelled exactly
// right — which was quietly losing most of Celtic's European history
// (everything except the exact current-season strings). Match by prefix
// instead, so any stage/group-letter suffix maps correctly.
const SS_COMP_PREFIXES: [string, string][] = [
  ['Scottish Premiership', 'League'],
  ['Scottish Cup', 'Scottish Cup'],
  ['Scottish League Cup', 'League Cup'],
  ['UEFA Champions League', 'Champions League'],
  ['UEFA Europa Conference League', 'Conference League'],
  ['UEFA Conference League', 'Conference League'],
  ['UEFA Europa League', 'Europa League'],
]

function mapSSComp(tournamentName: string): string | null {
  for (const [prefix, mapped] of SS_COMP_PREFIXES) {
    if (tournamentName.startsWith(prefix)) return mapped
  }
  return null // friendlies and anything else we don't track
}

const ssDateMap = new Map<string, number>()
let ssPageCacheExpiry = 0
let historicalFixturesCache: SSFixture[] = []
const SS_PAGES = 15
const SS_PAGE_BATCH_SIZE = 5 // fetch pages concurrently in batches — this loop used to run one
                              // page at a time through ScraperAPI, which alone was the biggest
                              // contributor to slow cold-start loads (up to 16 sequential round
                              // trips); batching cuts that by roughly the batch size.

type SSEventPage = { events?: Record<string, unknown>[] } | null

async function ensureSofascorePages(): Promise<void> {
  if (Date.now() < ssPageCacheExpiry) return

  ssDateMap.clear()
  const fixtures: SSFixture[] = []
  let firstPageFailed = false

  batches:
  for (let batchStart = 0; batchStart <= SS_PAGES; batchStart += SS_PAGE_BATCH_SIZE) {
    const pages: number[] = []
    for (let p = batchStart; p <= Math.min(batchStart + SS_PAGE_BATCH_SIZE - 1, SS_PAGES); p++) pages.push(p)

    const results: SSEventPage[] = await Promise.all(
      pages.map((page) =>
        ssFetch<{ events?: Record<string, unknown>[] }>(
          `https://api.sofascore.com/api/v1/team/${CELTIC_SS_ID}/events/last/${page}`
        )
      )
    )

    for (let i = 0; i < results.length; i++) {
      const page = pages[i]
      const data = results[i]

      // Page 0 failing outright (all retries exhausted) means Sofascore is
      // fully blocking us right now — don't cache that as "no fixtures" for
      // 6 hours, just leave the cache stale so the next call retries.
      if (page === 0 && data == null) { firstPageFailed = true; break batches }
      if (!data?.events?.length) break batches

      for (const e of data.events) {
        const id = e.id as number
        const ts = e.startTimestamp as number
        const dt = new Date(ts * 1000)
        const date = dt.toLocaleDateString('en-CA')

        ssDateMap.set(date, id)

        const comp = ((e.tournament as Record<string, string>)?.name) ?? ''
        const mappedComp = mapSSComp(comp)
        if (mappedComp == null) continue

        const homeName = (e.homeTeam as Record<string, string>)?.name
        const awayName = (e.awayTeam as Record<string, string>)?.name
        if (!homeName || !awayName) continue

        const kickoff = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        const status = (e.status as Record<string, unknown>)?.type as string
        const isFinished = status === 'finished'

        // This list endpoint's "current" field is NOT the match score for a
        // penalty shootout — it's normaltime + penalties summed together
        // (e.g. a 3-3 draw settled 5-4 on pens shows current: 8). The real
        // score is normaltime + any extra-time goals; penalties is separate.
        const homeScoreRaw = e.homeScore as Record<string, number> | undefined
        const awayScoreRaw = e.awayScore as Record<string, number> | undefined
        const homeScore = homeScoreRaw
          ? (homeScoreRaw.normaltime ?? 0) + (homeScoreRaw.extra1 ?? 0) + (homeScoreRaw.extra2 ?? 0)
          : undefined
        const awayScore = awayScoreRaw
          ? (awayScoreRaw.normaltime ?? 0) + (awayScoreRaw.extra1 ?? 0) + (awayScoreRaw.extra2 ?? 0)
          : undefined
        // Sofascore includes a `penalties` field (often 0) even on matches
        // decided outright in normal/extra time — only treat it as a real
        // shootout when the actual score was level (penalties only ever
        // happen after a draw).
        const wentToPenalties = homeScore != null && awayScore != null && homeScore === awayScore
          && (homeScoreRaw?.penalties != null || awayScoreRaw?.penalties != null)
        const penaltyHome = wentToPenalties ? homeScoreRaw?.penalties : undefined
        const penaltyAway = wentToPenalties ? awayScoreRaw?.penalties : undefined

        // Cup/UEFA round (e.g. "Final", "Quarter-final") — not shown for
        // league fixtures, where "round" isn't a meaningful concept here.
        const roundName = (e.roundInfo as Record<string, unknown> | undefined)?.name as string | undefined
        const round = mappedComp !== 'League' && roundName ? normalizeRound(roundName) : undefined

        fixtures.push({
          date,
          kickoff,
          home: homeName,
          away: awayName,
          comp: mappedComp,
          homeScore: isFinished && homeScore != null ? homeScore : null,
          awayScore: isFinished && awayScore != null ? awayScore : null,
          penaltyHome: isFinished ? penaltyHome : undefined,
          penaltyAway: isFinished ? penaltyAway : undefined,
          state: isFinished ? 'post' : 'pre',
          round,
        })
      }
    }
  }

  if (firstPageFailed) return

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

// Match data for any date strictly before today is final and will never
// change again — safe to cache hard at Vercel's edge. A date of today (or,
// defensively, later) might still be mid-polling-window pre-kickoff or live,
// so keep that cache short enough not to fight the 5-minute client-side
// lineup poll.
export function matchEventsCacheControl(date: string): string {
  const today = new Date().toLocaleDateString('en-CA')
  return date < today
    ? 'public, s-maxage=86400, stale-while-revalidate=604800'
    : 'public, s-maxage=60, stale-while-revalidate=300'
}

export async function fetchSofascoreData(date: string): Promise<SSData | null> {
  const eventId = await getSofascoreId(date)
  if (!eventId) return null

  const base = `https://api.sofascore.com/api/v1/event/${eventId}`

  const [evJson, incJson, luJson, stJson, mgrJson] = await Promise.all([
    ssFetch<Record<string, unknown>>(base),
    ssFetch<Record<string, unknown>>(`${base}/incidents`),
    ssFetch<Record<string, unknown>>(`${base}/lineups`),
    ssFetch<Record<string, unknown>>(`${base}/statistics`),
    ssFetch<Record<string, unknown>>(`${base}/managers`),
  ])

  if (!incJson && !luJson && !stJson) return null

  const evData = (evJson?.event as Record<string, Record<string, unknown>>) ?? {}
  const homeTeamName = (evData.homeTeam?.name as string) ?? 'Home'
  const awayTeamName = (evData.awayTeam?.name as string) ?? 'Away'
  // /managers is the point-in-time manager for this specific match; the
  // manager embedded in the main event payload (evData.homeTeam.manager) is
  // each club's *current* manager regardless of when the match was played,
  // so prefer /managers and only fall back to that if it's unavailable.
  const homeManager =
    ((mgrJson?.homeManager as Record<string, string>)?.name) ??
    ((evData.homeTeam?.manager as Record<string, string>)?.name) ??
    undefined
  const awayManager =
    ((mgrJson?.awayManager as Record<string, string>)?.name) ??
    ((evData.awayTeam?.manager as Record<string, string>)?.name) ??
    undefined

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
