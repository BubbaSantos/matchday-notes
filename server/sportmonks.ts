// Sportmonks: league standing + current injury list for Celtic. Runs entirely
// server-side (token never reaches the client, unlike the old VITE_-prefixed
// setup this replaces).
const CELTIC_TEAM_ID = 53 // Celtic's Sportmonks team id (looked up once, stable)
const PREMIERSHIP_LEAGUE_ID = 501

const BASE = 'https://api.sportmonks.com/v3/football'

async function apiFetch<T>(path: string): Promise<T> {
  // Read lazily, not as a module-level const: in local dev, vite.config.ts
  // loads .env into process.env inside its config factory function, which
  // runs *after* this module's top-level code (import evaluation order) —
  // a module-level `const TOKEN = process.env.SPORTMONKS_TOKEN` would
  // capture `undefined` permanently.
  const token = process.env.SPORTMONKS_TOKEN
  if (!token) throw new Error('SPORTMONKS_TOKEN is not configured on the server.')
  const sep = path.includes('?') ? '&' : '?'
  const resp = await fetch(`${BASE}${path}${sep}api_token=${token}`)
  if (!resp.ok) throw new Error(`Sportmonks ${resp.status}: ${path}`)
  return resp.json() as Promise<T>
}

export interface LeagueStanding {
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalDifference: number
  points: number
}

export interface InjuryRecord {
  playerName: string
  position: string
  injury: string
  returnDate?: string
}

let seasonIdCache: { id: number; expiry: number } | null = null

async function getCurrentSeasonId(): Promise<number> {
  if (seasonIdCache && seasonIdCache.expiry > Date.now()) return seasonIdCache.id

  const json = await apiFetch<{ data: { activeseasons: { id: number; league_id: number }[] } }>(
    `/teams/${CELTIC_TEAM_ID}?include=activeseasons`
  )
  const season = json.data.activeseasons.find((s) => s.league_id === PREMIERSHIP_LEAGUE_ID)
  if (!season) throw new Error('No active Premiership season found for Celtic')

  seasonIdCache = { id: season.id, expiry: Date.now() + 24 * 60 * 60 * 1000 }
  return season.id
}

interface RawStandingDetail {
  type: { developer_name: string }
  value: number
}

interface RawStanding {
  participant_id: number
  position: number
  details: RawStandingDetail[]
}

const standingCache = new Map<number, { data: LeagueStanding | null; expiry: number }>()

export async function fetchStanding(): Promise<LeagueStanding | null> {
  const seasonId = await getCurrentSeasonId()
  const hit = standingCache.get(seasonId)
  if (hit && hit.expiry > Date.now()) return hit.data

  const json = await apiFetch<{ data: RawStanding[] }>(`/standings/seasons/${seasonId}?include=details.type`)
  const row = json.data.find((s) => s.participant_id === CELTIC_TEAM_ID)

  let standing: LeagueStanding | null = null
  if (row) {
    const val = (name: string) => row.details.find((d) => d.type.developer_name === name)?.value ?? 0
    standing = {
      position: row.position,
      played: val('OVERALL_MATCHES'),
      won: val('OVERALL_WINS'),
      drawn: val('OVERALL_DRAWS'),
      lost: val('OVERALL_LOST'),
      goalDifference: val('OVERALL_GOAL_DIFFERENCE'),
      points: val('TOTAL_POINTS'),
    }
  }

  standingCache.set(seasonId, { data: standing, expiry: Date.now() + 10 * 60 * 1000 })
  return standing
}

interface RawSidelined {
  category: string
  start_date: string
  end_date: string | null
  completed: boolean
  player?: { display_name?: string; name?: string; position?: { name: string } }
  type?: { name: string }
}

let injuriesCache: { data: InjuryRecord[]; expiry: number } | null = null

export async function fetchInjuries(): Promise<InjuryRecord[]> {
  if (injuriesCache && injuriesCache.expiry > Date.now()) return injuriesCache.data

  const json = await apiFetch<{ data: { sidelined: RawSidelined[] } }>(
    `/teams/${CELTIC_TEAM_ID}?include=sidelined.player.position;sidelined.type`
  )

  // The free plan's "sidelined" data is noisy (e.g. multi-year-old suspensions
  // still marked incomplete) — restrict to genuine, currently-ongoing injuries.
  const injuries: InjuryRecord[] = json.data.sidelined
    .filter((s) => s.category === 'injury' && !s.completed)
    .map((s) => ({
      playerName: s.player?.display_name ?? s.player?.name ?? 'Unknown player',
      position: s.player?.position?.name ?? '',
      injury: s.type?.name ?? 'Injury',
      returnDate: s.end_date ?? undefined,
    }))

  injuriesCache = { data: injuries, expiry: Date.now() + 60 * 60 * 1000 }
  return injuries
}
