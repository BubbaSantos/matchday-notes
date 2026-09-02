import { cacheGet, cacheSet } from './cache'
import type { Competition, MatchEntry, MatchStat, LeagueStanding } from '../types'

const TOKEN = import.meta.env.VITE_SPORTMONKS_TOKEN as string
const CELTIC_ID = Number(import.meta.env.VITE_CELTIC_TEAM_ID)
const SEASON_ID = Number(import.meta.env.VITE_CURRENT_SEASON_ID)

const BASE = '/api/sportmonks/v3/football'

async function apiFetch(path: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}${path}${sep}api_token=${TOKEN}`)
  if (!res.ok) throw new Error(`Sportmonks ${res.status}: ${path}`)
  return res.json()
}

// ── Raw API types ──

interface RawParticipant {
  id: number
  name: string
  image_path: string
  meta: { location: 'home' | 'away'; winner: boolean }
}

interface RawScore {
  type_id: number
  participant_id: number
  score: { goals: number }
  description: string
}

interface RawState {
  state: string // 'FT' | 'NS' | 'LIVE' | 'POSTPONED' | 'HT' | ...
}

interface RawFixture {
  id: number
  league_id: number
  season_id: number
  starting_at: string
  name: string
  participants: RawParticipant[]
  scores: RawScore[]
  state: RawState | null
}

interface RawStandingDetail {
  type: { developer_name: string }
  value: number
}

interface RawStanding {
  participant_id: number
  position: number
  points: number
  details: RawStandingDetail[]
}

// ── Helpers ──

function fixturePhase(state: RawState | null): MatchEntry['phase'] {
  if (!state) return 'pre'
  const s = state.state
  if (s === 'FT' || s === 'AET' || s === 'PEN') return 'post'
  if (s === 'NS' || s === 'POSTP' || s === 'POSTPONED' || s === 'CANCL') return 'pre'
  return 'live'
}

function extractScore(scores: RawScore[], participantId: number): number | undefined {
  const current = scores.find(
    (s) => s.description === 'CURRENT' && s.participant_id === participantId
  )
  return current?.score.goals
}

const LEAGUE_MAP: Record<number, Competition> = {
  501: 'Scottish Premiership',
  // Free plan only — cups would be added here when upgraded
}

function leagueToCompetition(leagueId: number): Competition {
  return LEAGUE_MAP[leagueId] ?? 'Friendly'
}

// ── Fixture list ──

export async function fetchCelticFixtures(
  seasonStart: string,
  seasonEnd: string
): Promise<MatchEntry[]> {
  const cacheKey = `fixtures_${SEASON_ID}`
  const cached = cacheGet<MatchEntry[]>(cacheKey)
  if (cached) return cached

  const url = `/fixtures/between/${seasonStart}/${seasonEnd}/${CELTIC_ID}?include=participants;scores;state&per_page=100`
  const json = (await apiFetch(url)) as { data: RawFixture[] }

  const entries: MatchEntry[] = json.data.map((f) => {
    const celtic = f.participants.find((p) => p.id === CELTIC_ID)!
    const opponent = f.participants.find((p) => p.id !== CELTIC_ID)!
    const phase = fixturePhase(f.state)
    const venue = celtic.meta.location === 'home' ? 'H' : 'A'

    const entry: MatchEntry = {
      id: `spm-${f.id}`,
      sportmonksId: f.id,
      competition: leagueToCompetition(f.league_id),
      opponent: opponent?.name ?? 'Unknown',
      opponentCrest: opponent?.image_path,
      venue,
      kickoff: f.starting_at,
      phase,
    }

    if (phase === 'post') {
      entry.celticScore = extractScore(f.scores, CELTIC_ID)
      entry.opponentScore = extractScore(f.scores, opponent.id)
    }

    return entry
  })

  cacheSet(cacheKey, entries, 15 * 60) // 15 min TTL
  return entries
}

// ── Standing ──

export async function fetchCelticStanding(): Promise<LeagueStanding | null> {
  const cacheKey = `standing_${SEASON_ID}`
  const cached = cacheGet<LeagueStanding>(cacheKey)
  if (cached) return cached

  const url = `/standings/seasons/${SEASON_ID}?include=details.type`
  const json = (await apiFetch(url)) as { data: RawStanding[] }

  const row = json.data.find((s) => s.participant_id === CELTIC_ID)
  if (!row) return null

  const val = (name: string) =>
    row.details.find((d) => d.type.developer_name === name)?.value ?? 0

  const standing: LeagueStanding = {
    position: row.position,
    played: val('OVERALL_MATCHES'),
    won: val('OVERALL_WINS'),
    drawn: val('OVERALL_DRAWS'),
    lost: val('OVERALL_LOST'),
    goalDifference: val('OVERALL_GOAL_DIFFERENCE'),
    points: val('TOTAL_POINTS'),
  }

  cacheSet(cacheKey, standing, 10 * 60) // 10 min TTL
  return standing
}

// ── Match statistics ──

interface RawStat {
  participant_id: number
  data: { value: number | string }
  type: { name: string; code: string }
}

const STAT_ORDER = [
  'ball-possession',
  'shots-on-target',
  'shots-total',
  'corners',
  'fouls',
  'yellowcards',
  'offsides',
]

const STAT_LABELS: Record<string, string> = {
  'ball-possession': 'Possession',
  'shots-on-target': 'Shots on Target',
  'shots-total': 'Shots',
  'corners': 'Corners',
  'fouls': 'Fouls',
  'yellowcards': 'Yellow Cards',
  'offsides': 'Offsides',
  'goals': 'Goals',
  'assists': 'Assists',
  'successful-dribbles-percentage': 'Dribble Success %',
  'redcards': 'Red Cards',
  'saves': 'Saves',
  'passes': 'Passes',
  'attacks': 'Attacks',
  'dangerous-attacks': 'Dangerous Attacks',
}

export async function fetchMatchStats(
  sportmonksId: number,
  opponentId: number
): Promise<MatchStat[]> {
  const cacheKey = `stats_${sportmonksId}`
  const cached = cacheGet<MatchStat[]>(cacheKey)
  if (cached) return cached

  const url = `/fixtures/${sportmonksId}?include=statistics.type`
  const json = (await apiFetch(url)) as { data: { statistics: RawStat[] } }
  const rawStats = json.data.statistics ?? []

  // Group by stat type, pairing Celtic vs opponent
  const statMap = new Map<string, { celtic?: number | string; opponent?: number | string }>()

  for (const s of rawStats) {
    const code = s.type.code
    if (!statMap.has(code)) statMap.set(code, {})
    const entry = statMap.get(code)!
    const val = s.data.value
    if (s.participant_id === CELTIC_ID) {
      entry.celtic = code === 'ball-possession' ? `${val}%` : val
    } else if (s.participant_id === opponentId) {
      entry.opponent = code === 'ball-possession' ? `${val}%` : val
    }
  }

  // Build ordered stat list
  const ordered: MatchStat[] = []
  for (const code of STAT_ORDER) {
    const pair = statMap.get(code)
    if (pair && pair.celtic !== undefined && pair.opponent !== undefined) {
      ordered.push({
        label: STAT_LABELS[code] ?? code,
        celtic: pair.celtic,
        opponent: pair.opponent,
      })
    }
  }

  // Any remaining stats not in STAT_ORDER
  for (const [code, pair] of statMap) {
    if (!STAT_ORDER.includes(code) && pair.celtic !== undefined && pair.opponent !== undefined) {
      ordered.push({
        label: STAT_LABELS[code] ?? code,
        celtic: pair.celtic,
        opponent: pair.opponent,
      })
    }
  }

  cacheSet(cacheKey, ordered, 60 * 60) // 1 hr — post-match stats don't change
  return ordered
}

// ── Opponent ID from fixture ──

export async function fetchOpponentId(sportmonksId: number): Promise<number | null> {
  const cacheKey = `opponent_${sportmonksId}`
  const cached = cacheGet<number>(cacheKey)
  if (cached) return cached

  const url = `/fixtures/${sportmonksId}?include=participants`
  const json = (await apiFetch(url)) as { data: { participants: RawParticipant[] } }
  const opponent = json.data.participants.find((p) => p.id !== CELTIC_ID)
  if (!opponent) return null
  cacheSet(cacheKey, opponent.id, 24 * 60 * 60)
  return opponent.id
}
