import { cacheGet, cacheSet } from './cache'
import type { MatchEntry, Competition } from '../types'

// Raw shape from server/fixtures.ts (SPFL fixtures + ICS/ESPN enrichment)
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
  penaltyHome?: number
  penaltyAway?: number
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

// ESPN's feed only ever shows a fixture's current (rescheduled) date — postponements
// that get a new date entirely vanish from the data. Track known ones by hand so the
// diary can still note them.
const KNOWN_RESCHEDULES: { opponent: string; date: string; from: string; reason: string }[] = [
  {
    opponent: 'St Johnstone',
    date: '2026-09-09',
    from: '2026-08-22',
    reason: "Celtic's Champions League play-off",
  },
]

// Historical feed spells some club names slightly differently ("St. Johnstone" vs "St Johnstone")
function normalizeOpponent(name: string): string {
  return name.replace(/\./g, '').trim().toLowerCase()
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

  if ('penaltyHome' in f && f.penaltyHome != null && f.penaltyAway != null) {
    entry.penalties = {
      celtic: isHome ? f.penaltyHome : f.penaltyAway,
      opponent: isHome ? f.penaltyAway : f.penaltyHome,
    }
  }

  const reschedule = KNOWN_RESCHEDULES.find(
    (r) => normalizeOpponent(r.opponent) === normalizeOpponent(opponent) && r.date === f.date
  )
  if (reschedule) {
    entry.rescheduledFrom = { date: reschedule.from, reason: reschedule.reason }
  }

  return entry
}

export async function fetchCelticFixtures(): Promise<MatchEntry[]> {
  const cacheKey = 'espn_celtic_fixtures_v6'
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

  // Historical: skip any dates already covered by current season, and skip fixtures
  // that were postponed to a new date — the historical feed still lists them under
  // their original (never-played) date, which would otherwise show up as a phantom
  // "played" match with no score once that date is in the past.
  const historicalCeltic = historical.filter((f) => {
    if (f.home !== 'Celtic' && f.away !== 'Celtic') return false
    if (currentDates.has(f.date)) return false
    const opponent = f.home === 'Celtic' ? f.away : f.home
    if (
      KNOWN_RESCHEDULES.some(
        (r) => normalizeOpponent(r.opponent) === normalizeOpponent(opponent) && r.from === f.date
      )
    ) {
      return false
    }
    return true
  })
  const historicalEntries = historicalCeltic.map((f, i) => rawToEntry(f, i, 'ss', now))

  const entries = [...currentEntries, ...historicalEntries].sort(
    (a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()
  )

  cacheSet(cacheKey, entries, 10 * 60) // 10 min
  return entries
}

// Standing + injuries still come from Sportmonks (free plan covers this)
export { fetchCelticStanding, fetchCelticInjuries } from './sportmonks'
