// TypeScript port of scripts/spfl-fixtures (Python). Fetches SPFL league fixtures,
// domestic cup fixtures (backed by ICS files bundled in data/), and UEFA fixtures
// for the current season, all via plain `fetch` against ESPN — no python3/curl
// subprocess needed, so this runs on Vercel serverless functions as well as the
// local Vite dev server.
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEAGUE_CUP_ICS = path.resolve(__dirname, '../data/league-cup.ics')
const SCOTTISH_CUP_ICS = path.resolve(__dirname, '../data/scottish-cup.ics')

export interface RawFixture {
  date: string
  kickoff: string
  home: string
  away: string
  comp: 'League' | 'League Cup' | 'Scottish Cup' | 'Europa League' | 'Champions League' | 'Conference League'
  homeScore: number | null
  awayScore: number | null
  state: 'pre' | 'in' | 'post'
  postponed: boolean
  aggHome?: number
  aggAway?: number
}

export interface ScriptOutput {
  season: string
  fixtures: RawFixture[]
  fetchedAt: number
  stale: boolean
}

const PREM_TEAMS = new Set([
  'celtic', 'rangers', 'heart of midlothian', 'hearts', 'hibernian', 'hibs',
  'aberdeen', 'kilmarnock', 'motherwell', 'st mirren', 'st. mirren',
  'st johnstone', 'st. johnstone', 'dundee united', 'dundee', 'dundee fc',
  'falkirk', 'ross county', 'livingston', 'partick thistle',
  'inverness caledonian thistle', 'inverness ct',
])

const ABBREV: Record<string, string> = {
  'heart of midlothian': 'Hearts',
  'hearts of midlothian': 'Hearts',
  'hibernian': 'Hibs',
  'dundee united': 'Dundee Utd',
  'inverness caledonian thistle': 'Inverness CT',
  'inverness ct': 'Inverness CT',
  'ross county': 'Ross Co',
  'partick thistle': 'Partick',
  'livingston': 'Livi',
  'queen of the south': 'QotS',
  'airdrieonians': 'Airdrie',
  'greenock morton': 'Morton',
  'st mirren': 'St Mirren',
  'st. mirren': 'St Mirren',
  'st johnstone': 'St Johnstone',
  'st. johnstone': 'St Johnstone',
  'aberdeen': 'Aberdeen',
  'rangers': 'Rangers',
  'celtic': 'Celtic',
  'motherwell': 'Motherwell',
  'kilmarnock': 'Kilmarnock',
  'falkirk': 'Falkirk',
  'dundee': 'Dundee',
  'dundee fc': 'Dundee',
  'dunfermline athletic': 'Dunfermline',
  'ayr united': 'Ayr United',
  'stenhousemuir': 'Stenhousemuir',
}

function stripSuffix(name: string): string {
  let k = name.trim().toLowerCase()
  for (const suffix of [' fc', ' f.c.', ' football club']) {
    if (k.endsWith(suffix)) { k = k.slice(0, -suffix.length).trim(); break }
  }
  return k
}

function abbrev(name: string): string {
  return ABBREV[stripSuffix(name)] ?? name.trim()
}

function isPrem(name: string): boolean {
  return PREM_TEAMS.has(stripSuffix(name))
}

const POSTPONED_STATUSES = new Set([
  'STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED', 'STATUS_ABANDONED',
])

function seasonYear(): number {
  const now = new Date()
  return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

async function espnEventsForRange(start: string, end: string, slug = 'sco.1', extra = ''): Promise<Record<string, unknown>[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?limit=500&dates=${start}-${end}${extra}`
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!resp.ok) return []
    const json = (await resp.json()) as { events?: Record<string, unknown>[] }
    return json.events ?? []
  } catch {
    return []
  }
}

function espnEventToFixture(e: Record<string, unknown>, compLabel?: RawFixture['comp']): RawFixture | null {
  const comps = e.competitions as Record<string, unknown>[] | undefined
  if (!comps || comps.length === 0) return null
  const comp = comps[0]
  const competitors = (comp.competitors as Record<string, unknown>[]) ?? []
  if (competitors.length < 2) return null
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]
  const statusType = ((comp.status as Record<string, unknown>)?.type as Record<string, unknown>) ?? {}
  const state = (statusType.state as string) ?? 'pre'
  const completed = (statusType.completed as boolean) ?? false
  const postponed = POSTPONED_STATUSES.has((statusType.name as string) ?? '')

  const dateStr = (e.date as string) ?? ''
  let dateLocal = dateStr.slice(0, 10)
  let kickoff = ''
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    dateLocal = parsed.toLocaleDateString('en-CA')
    kickoff = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const hs = home.score as string | number | undefined
  const as_ = away.score as string | number | undefined

  return {
    date: dateLocal,
    kickoff,
    home: abbrev(((home.team as Record<string, string>)?.displayName) ?? '?'),
    away: abbrev(((away.team as Record<string, string>)?.displayName) ?? '?'),
    comp: compLabel ?? 'League',
    homeScore: completed && hs != null ? Number(hs) : null,
    awayScore: completed && as_ != null ? Number(as_) : null,
    state: (state as RawFixture['state']) ?? 'pre',
    postponed,
  }
}

async function fetchEspnLeague(): Promise<RawFixture[]> {
  const yr = seasonYear()
  const [a, b] = await Promise.all([
    espnEventsForRange(`${yr}0701`, `${yr + 1}0630`, 'sco.1', '&seasontype=2'),
    espnEventsForRange(`${yr - 1}0701`, `${yr}0630`, 'sco.1', '&seasontype=2'),
  ])
  const seen = new Set<unknown>()
  const out: RawFixture[] = []
  for (const e of [...a, ...b]) {
    const eid = e.id
    if (seen.has(eid)) continue
    seen.add(eid)
    const fixture = espnEventToFixture(e)
    if (fixture) out.push(fixture)
  }
  return out
}

const UEFA_SLUGS: [string, RawFixture['comp']][] = [
  ['uefa.champions_qual', 'Champions League'],
  ['uefa.champions', 'Champions League'],
  ['uefa.europa_qual', 'Europa League'],
  ['uefa.europa', 'Europa League'],
  ['uefa.europa.conf_qual', 'Conference League'],
  ['uefa.europa.conf', 'Conference League'],
]

async function fetchUefa(): Promise<RawFixture[]> {
  const yr = seasonYear()
  const seen = new Set<unknown>()
  const out: RawFixture[] = []
  for (const [slug, label] of UEFA_SLUGS) {
    const [a, b] = await Promise.all([
      espnEventsForRange(`${yr}0601`, `${yr}1231`, slug),
      espnEventsForRange(`${yr + 1}0101`, `${yr + 1}0630`, slug),
    ])
    for (const e of [...a, ...b]) {
      const eid = e.id
      if (seen.has(eid)) continue
      const comps = e.competitions as Record<string, unknown>[] | undefined
      if (!comps || comps.length === 0) continue
      const competitors = (comps[0].competitors as Record<string, unknown>[]) ?? []
      const names = competitors.map((c) => ((c.team as Record<string, string>)?.displayName) ?? '')
      if (!names.some(isPrem)) continue
      seen.add(eid)
      const fixture = espnEventToFixture(e, label)
      if (fixture) out.push(fixture)
    }
  }
  return out
}

const espnAllCache = new Map<string, Record<string, unknown>[]>()

async function espnAllForDate(dateLocal: string): Promise<Record<string, unknown>[]> {
  const key = dateLocal.replace(/-/g, '')
  const hit = espnAllCache.get(key)
  if (hit) return hit
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${key}&limit=500`
  let events: Record<string, unknown>[] = []
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (resp.ok) {
      const json = (await resp.json()) as { events?: Record<string, unknown>[] }
      events = json.events ?? []
    }
  } catch { /* ignore */ }
  espnAllCache.set(key, events)
  return events
}

const CUP_NOTE_LABELS: [string, RawFixture['comp']][] = [
  ['Scottish League Cup', 'League Cup'],
  ['Scottish Cup', 'Scottish Cup'],
]

const REFRESH_WINDOW_DAYS_BACK = 3
const REFRESH_WINDOW_DAYS_FORWARD = 30

async function fetchCupFixturesFromEspn(): Promise<Map<string, RawFixture>> {
  const today = new Date()
  const out = new Map<string, RawFixture>()
  const offsets = []
  for (let o = -REFRESH_WINDOW_DAYS_BACK; o <= REFRESH_WINDOW_DAYS_FORWARD; o++) offsets.push(o)

  await Promise.all(
    offsets.map(async (offset) => {
      const d = new Date(today)
      d.setDate(d.getDate() + offset)
      const dateLocal = d.toLocaleDateString('en-CA')
      const events = await espnAllForDate(dateLocal)
      for (const e of events) {
        const comps = e.competitions as Record<string, unknown>[] | undefined
        if (!comps || comps.length === 0) continue
        const note = (comps[0].altGameNote as string) ?? ''
        const compLabel = CUP_NOTE_LABELS.find(([prefix]) => note.startsWith(prefix))?.[1]
        if (!compLabel) continue
        const fixture = espnEventToFixture(e, compLabel)
        if (!fixture) continue
        if (!isPrem(fixture.home) && !isPrem(fixture.away)) continue
        const key = `${fixture.date}|${fixture.home.toLowerCase()}|${fixture.away.toLowerCase()}`
        out.set(key, fixture)
      }
    })
  )
  return out
}

// ── ICS cup fixtures (SUMMARY-based: "Home - Away (score)") ──────────────────

function unfoldICS(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

function parseIcsFixtures(filePath: string, compLabel: RawFixture['comp']): RawFixture[] {
  if (!existsSync(filePath)) return []
  const text = unfoldICS(readFileSync(filePath, 'utf8'))
  const lines = text.split(/\r?\n/)
  const out: RawFixture[] = []

  let inEvent = false
  let summary = '', dtstart = ''

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; summary = ''; dtstart = ''; continue }
    if (line === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const cleaned = summary.replace(/^[^\w-]+/, '').trim()
        const m = cleaned.match(/^(.+?)\s+-\s+(.+?)(?:\s+\((\d+)-(\d+)\))?$/)
        if (m) {
          const homeRaw = m[1].trim()
          const awayRaw = m[2].trim()
          if (isPrem(homeRaw) || isPrem(awayRaw)) {
            const raw = dtstart.trim().replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z')
            const dt = new Date(raw)
            if (!isNaN(dt.getTime())) {
              const dateLocal = dt.toLocaleDateString('en-CA')
              const kickoff = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              const homeScoreStr = m[3]
              const completed = homeScoreStr !== undefined
              out.push({
                date: dateLocal,
                kickoff,
                home: abbrev(homeRaw),
                away: abbrev(awayRaw),
                comp: compLabel,
                homeScore: completed ? Number(m[3]) : null,
                awayScore: completed ? Number(m[4]) : null,
                state: completed ? 'post' : 'pre',
                postponed: false,
              })
            }
          }
        }
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (line.startsWith('SUMMARY:')) summary = line.slice(8)
    if (line.startsWith('DTSTART:')) dtstart = line.slice(8)
  }
  return out
}

function mergeCupFixtures(icsFixtures: RawFixture[], espnWindow: Map<string, RawFixture>): RawFixture[] {
  const merged = new Map<string, RawFixture>()
  for (const f of icsFixtures) {
    merged.set(`${f.date}|${f.home.toLowerCase()}|${f.away.toLowerCase()}`, f)
  }
  for (const [k, f] of espnWindow) merged.set(k, f)
  return [...merged.values()]
}

// ── Two-legged UEFA tie aggregates ────────────────────────────────────────────

const EUROPEAN_COMPS = new Set<RawFixture['comp']>(['Champions League', 'Europa League', 'Conference League'])

function addAggregates(fixtures: RawFixture[]): RawFixture[] {
  const groups = new Map<string, RawFixture[]>()
  for (const f of fixtures) {
    if (!EUROPEAN_COMPS.has(f.comp)) continue
    const key = `${f.comp}|${[f.home, f.away].sort().join('|')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  for (const legs of groups.values()) {
    if (legs.length !== 2) continue
    legs.sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff))
    const [leg1, leg2] = legs
    if (leg1.homeScore == null || leg1.awayScore == null) continue
    if (leg1.home !== leg2.away || leg1.away !== leg2.home) continue
    leg2.aggHome = leg1.awayScore + (leg2.homeScore ?? 0)
    leg2.aggAway = leg1.homeScore + (leg2.awayScore ?? 0)
  }
  return fixtures
}

// ── Cache + main entry point ──────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour, matches the old python script's TTL
let cached: ScriptOutput | null = null
let cachedAt = 0
let inFlight: Promise<ScriptOutput> | null = null

async function doFetch(): Promise<ScriptOutput> {
  const icsCup = [
    ...parseIcsFixtures(LEAGUE_CUP_ICS, 'League Cup'),
    ...parseIcsFixtures(SCOTTISH_CUP_ICS, 'Scottish Cup'),
  ]
  const [espnWindow, league, uefa] = await Promise.all([
    fetchCupFixturesFromEspn(),
    fetchEspnLeague(),
    fetchUefa(),
  ])
  const cupFixtures = mergeCupFixtures(icsCup, espnWindow)

  let fixtures = [...league, ...cupFixtures, ...uefa]
  fixtures = addAggregates(fixtures)
  fixtures.sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff))

  const yr = seasonYear()
  return {
    season: `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`,
    fixtures,
    fetchedAt: Date.now(),
    stale: false,
  }
}

export async function fetchSpflFixtures(): Promise<ScriptOutput> {
  const isStale = Date.now() - cachedAt > CACHE_TTL_MS

  if (cached && !isStale) return cached

  if (cached && isStale) {
    // Serve stale instantly, refresh in the background for next time.
    if (!inFlight) {
      inFlight = doFetch()
        .then((fresh) => { cached = fresh; cachedAt = Date.now(); return fresh })
        .finally(() => { inFlight = null })
    }
    return { ...cached, stale: true }
  }

  // First call ever — fetch synchronously.
  if (!inFlight) {
    inFlight = doFetch()
      .then((fresh) => { cached = fresh; cachedAt = Date.now(); return fresh })
      .finally(() => { inFlight = null })
  }
  return inFlight
}
