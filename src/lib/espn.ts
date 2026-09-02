import { cacheGet, cacheSet } from './cache'
import type { MatchEntry, Competition, MatchStat } from '../types'

// Raw shape from the spfl-fixtures Python script (enhanced by Vite middleware)
interface RawFixture {
  date: string       // "2026-08-03"
  kickoff: string    // "19:30"
  home: string
  away: string
  comp: 'League' | 'League Cup' | 'Scottish Cup' | 'Europa League' | 'Champions League' | 'Conference League'
  homeScore: number | null
  awayScore: number | null
  state: 'pre' | 'in' | 'post'
  postponed: boolean
  aggHome?: number
  aggAway?: number
  stadiumName?: string
  round?: string
}

interface ScriptOutput {
  season: string
  fixtures: RawFixture[]
  fetchedAt: number
  stale: boolean
}

const COMP_MAP: Record<string, Competition> = {
  'League':            'Scottish Premiership',
  'League Cup':        'League Cup',
  'Scottish Cup':      'Scottish Cup',
  'Europa League':     'Europa League',
  'Conference League': 'Europa Conference League',
  'Champions League':  'Champions League',
}

interface SSHistoricalFixture {
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

function rawToEntry(f: RawFixture | SSHistoricalFixture, i: number, prefix: string, now: Date): MatchEntry {
  const isHome = f.home === 'Celtic'
  const opponent = isHome ? f.away : f.home
  const kickoffISO = `${f.date}T${f.kickoff}:00`
  const kickoffDate = new Date(kickoffISO)

  const postponed = 'postponed' in f ? f.postponed : false
  const stateRaw = f.state === 'post' ? 'post' : f.state === 'in' ? 'live' : 'pre'
  const phaseFromState: MatchEntry['phase'] = postponed ? 'pre' : stateRaw as MatchEntry['phase']
  const phase: MatchEntry['phase'] = phaseFromState === 'pre' && kickoffDate < now ? 'post' : phaseFromState

  const entry: MatchEntry = {
    id: `${prefix}-${f.date}-${i}`,
    competition: COMP_MAP[f.comp] ?? 'Friendly',
    opponent,
    venue: postponed ? 'H' : isHome ? 'H' : 'A',
    kickoff: kickoffISO,
    phase,
    stadiumName: f.stadiumName,
    round: 'round' in f ? f.round : undefined,
  }

  if (phase === 'post' && f.homeScore !== null && f.awayScore !== null) {
    entry.celticScore = isHome ? f.homeScore : f.awayScore
    entry.opponentScore = isHome ? f.awayScore : f.homeScore
  }

  return entry
}

export async function fetchCelticFixtures(): Promise<MatchEntry[]> {
  const cacheKey = 'espn_celtic_fixtures_v4'
  const cached = cacheGet<MatchEntry[]>(cacheKey)
  if (cached) return cached

  const now = new Date()

  // Fetch current season + historical in parallel
  const [currentRes, historicalRes] = await Promise.all([
    fetch('/api/fixtures'),
    fetch('/api/historical-fixtures'),
  ])
  if (!currentRes.ok) throw new Error(`Fixtures API: ${currentRes.status}`)

  const data: ScriptOutput = await currentRes.json()
  const historical: SSHistoricalFixture[] = historicalRes.ok ? await historicalRes.json() : []

  // Current season Celtic fixtures (rich data — has rounds, ICS stadiums etc.)
  const currentCeltic = data.fixtures.filter((f) => f.home === 'Celtic' || f.away === 'Celtic')
  const currentDates = new Set(currentCeltic.map((f) => f.date))

  const currentEntries = currentCeltic.map((f, i) => rawToEntry(f, i, 'espn', now))

  // Historical: skip any dates already covered by current season
  const historicalCeltic = historical.filter(
    (f) => (f.home === 'Celtic' || f.away === 'Celtic') && !currentDates.has(f.date)
  )
  const historicalEntries = historicalCeltic.map((f, i) => rawToEntry(f, i, 'ss', now))

  const entries = [...currentEntries, ...historicalEntries].sort(
    (a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()
  )

  cacheSet(cacheKey, entries, 10 * 60) // 10 min
  return entries
}

// Standings still come from Sportmonks (free plan covers this)
export { fetchCelticStanding, fetchMatchStats, fetchOpponentId } from './sportmonks'

// ESPN match stats — built from the fixture data we already have
// (ESPN doesn't expose per-match stats on this endpoint; Sportmonks still used for stats)
export function buildMatchStats(_fixture: RawFixture): MatchStat[] {
  return []
}
