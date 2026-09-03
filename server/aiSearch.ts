import type { IncomingMessage, ServerResponse } from 'http'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSofascoreData } from './sofascore.js'
import type { SSData } from './sofascore.js'

interface MatchEntry {
  id: string
  competition: string
  opponent: string
  venue: 'H' | 'A' | 'N'
  kickoff: string
  phase: string
  celticScore?: number
  opponentScore?: number
  penalties?: { celtic: number; opponent: number }
  notes?: string
  voiceNotes?: Array<{ transcript: string }>
}

interface CompStats { apps: number; goals: number; assists: number }
export interface PlayerStats {
  name: string
  appearances: number
  goals: number
  assists: number
  byCompetition: Record<string, CompStats>
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function goalSummary(data: SSData, isCelticHome: boolean): string {
  const goals = data.incidents.filter(
    (inc) => inc.type === 'goal' && inc.incidentClass !== 'ownGoal'
  )
  const celticGoals = goals
    .filter((g) => (isCelticHome ? g.isHome : !g.isHome) && g.player)
    .map((g) => `${g.player}${g.assist ? ` (assist: ${g.assist})` : ''} ${g.minute}'`)
  const oppGoals = goals
    .filter((g) => (isCelticHome ? !g.isHome : g.isHome) && g.player)
    .map((g) => `${g.player} ${g.minute}'`)
  const celticPlayers = isCelticHome ? data.homeLineup.players : data.awayLineup.players
  const starters = celticPlayers.filter((p) => p.starter).map((p) => p.shortName)
  const subs = celticPlayers.filter((p) => p.used && !p.starter).map((p) => p.shortName)

  const parts: string[] = []
  if (celticGoals.length) parts.push(`Celtic scorers: ${celticGoals.join(', ')}`)
  if (oppGoals.length) parts.push(`Opp scorers: ${oppGoals.join(', ')}`)
  if (starters.length) parts.push(`Celtic lineup: ${starters.join(', ')}`)
  if (subs.length) parts.push(`Subs used: ${subs.join(', ')}`)
  return parts.join(' | ')
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Simple fuzzy match: does the query appear in the player name (short name parts)?
function playerNameMatch(query: string, name: string): boolean {
  const q = stripAccents(query.toLowerCase().trim())
  const n = stripAccents(name.toLowerCase())
  if (n.includes(q)) return true
  // Also match last-name only: "hatate" matches "R. Hatate"
  const parts = n.split(/[\s.]+/).filter(Boolean)
  return parts.some((p) => p.startsWith(q) && p.length >= q.length)
}

// Determine which side Celtic is on. Prefer Sofascore's team name fields (authoritative),
// but fall back to fixture.venue when the name came back as a generic placeholder
// ("Home"/"Away") due to the event endpoint failing.
function isCelticHomeTeam(data: SSData, fixture: MatchEntry): boolean {
  const home = data.homeTeamName.toLowerCase()
  const away = data.awayTeamName.toLowerCase()
  if (home.includes('celtic')) return true
  if (away.includes('celtic')) return false
  return fixture.venue === 'H'
}

function computePlayerStats(
  query: string,
  matchData: Array<{ data: SSData; fixture: MatchEntry }>,
): PlayerStats | null {
  const normalizedQuery = query.replace(/goals?|scored?|assists?|played?|appearances?/gi, '').trim()

  // Collect names only from Celtic's lineup (not the opponent's).
  // Use Sofascore team names to identify Celtic's side, but fall back to
  // fixture.venue if the team name came back as a generic placeholder ("Home"/"Away").
  const allNames = new Set<string>()
  for (const { data, fixture } of matchData) {
    const isCelticHome = isCelticHomeTeam(data, fixture)
    const celticPlayers = isCelticHome ? data.homeLineup.players : data.awayLineup.players
    for (const p of celticPlayers) if (p.shortName) allNames.add(p.shortName)
    // Incidents may use alternate name spellings — collect them too, but we only
    // use this set to pick a display name, not to determine who played.
    for (const inc of data.incidents) {
      if (inc.player) allNames.add(inc.player)
      if (inc.assist) allNames.add(inc.assist)
    }
  }

  // Collect ALL name variants that match the query
  const matchedNames = new Set([...allNames].filter((n) => playerNameMatch(normalizedQuery, n)))
  if (matchedNames.size === 0) return null

  // Use the longest matching name as the display name (more readable)
  const displayName = [...matchedNames].sort((a, b) => b.length - a.length)[0]

  const stats: PlayerStats = { name: displayName, appearances: 0, goals: 0, assists: 0, byCompetition: {} }

  for (const { data, fixture } of matchData) {
    const isCelticHome = isCelticHomeTeam(data, fixture)
    const celticPlayers = isCelticHome ? data.homeLineup.players : data.awayLineup.players
    const played = celticPlayers.some((p) => p.shortName && p.used && playerNameMatch(normalizedQuery, p.shortName))
    if (!played) continue

    const comp = fixture.competition
    if (!stats.byCompetition[comp]) stats.byCompetition[comp] = { apps: 0, goals: 0, assists: 0 }

    stats.appearances++
    stats.byCompetition[comp].apps++

    for (const inc of data.incidents) {
      if (inc.type !== 'goal' || inc.incidentClass === 'ownGoal') continue
      // Use playerNameMatch directly to avoid Unicode normalization mismatches
      // between how names are stored in lineups vs goal incidents.
      if (inc.player && playerNameMatch(normalizedQuery, inc.player)) {
        stats.goals++
        stats.byCompetition[comp].goals++
      }
      if (inc.assist && playerNameMatch(normalizedQuery, inc.assist)) {
        stats.assists++
        stats.byCompetition[comp].assists++
      }
    }
  }

  return stats.appearances > 0 ? stats : null
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      try { results[i] = await fn(items[i]) } catch { /* keep null */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function enrichWithEvents(fixtures: MatchEntry[]): Promise<{
  eventsMap: Map<string, string>
  matchData: Array<{ data: SSData; fixture: MatchEntry }>
}> {
  const past = fixtures.filter((f) => f.phase === 'post')

  const fetched = await withConcurrency(past, 5, async (f) => {
    const date = new Date(f.kickoff).toLocaleDateString('en-CA')
    const data = await fetchSofascoreData(date)
    return data ? { fixture: f, data } : null
  })

  const eventsMap = new Map<string, string>()
  const matchData: Array<{ data: SSData; fixture: MatchEntry }> = []

  for (const r of fetched) {
    if (!r) continue
    const summary = goalSummary(r.data, isCelticHomeTeam(r.data, r.fixture))
    if (summary) eventsMap.set(r.fixture.id, summary)
    matchData.push({ data: r.data, fixture: r.fixture })
  }

  return { eventsMap, matchData }
}

function serializeFixtures(fixtures: MatchEntry[], eventsMap: Map<string, string>): string {
  return fixtures
    .filter((f) => f.phase === 'post')
    .map((f) => {
      const date = new Date(f.kickoff).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
      const celtic = f.celticScore ?? 0
      const opp = f.opponentScore ?? 0
      const total = celtic + opp
      const result = f.celticScore !== undefined
        ? (celtic > opp ? 'W' : celtic === opp ? 'D' : 'L')
        : '?'
      const venueStr = f.venue === 'H' ? 'Home' : f.venue === 'A' ? 'Away' : 'Neutral'
      const scoreStr = f.celticScore !== undefined
        ? (f.venue === 'A' ? `${opp}–${celtic}` : `${celtic}–${opp}`)
        : '?'
      const notesText = [f.notes, ...(f.voiceNotes?.map((vn) => vn.transcript) ?? [])]
        .filter(Boolean).join(' | ').slice(0, 500)

      let line = `ID:${f.id} | ${date} | ${f.competition} | ${venueStr} vs ${f.opponent} | Score: ${scoreStr} (${result}) | Total goals: ${total}`
      if (f.penalties) line += ` | AET pens Celtic ${f.penalties.celtic}–${f.penalties.opponent}`
      const events = eventsMap.get(f.id)
      if (events) line += ` | ${events}`
      if (notesText) line += ` | Notes: "${notesText}"`
      return line
    })
    .join('\n')
}

export async function handleAiSearchRequest(req: IncomingMessage, res: ServerResponse) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }))
    return
  }

  let query: string
  let fixtures: MatchEntry[]
  try {
    const body = JSON.parse(await readBody(req)) as { query?: string; fixtures?: MatchEntry[] }
    query = body.query?.trim() ?? ''
    fixtures = body.fixtures ?? []
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Invalid JSON body.' }))
    return
  }

  if (!query) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'query is required.' }))
    return
  }

  try {
    const { eventsMap, matchData } = await enrichWithEvents(fixtures)
    const serialized = serializeFixtures(fixtures, eventsMap)

    if (!serialized) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ results: [], summary: 'No played matches in the archive yet.' }))
      return
    }

    // Compute player stats and run AI search concurrently
    const [playerStats, msg] = await Promise.all([
      Promise.resolve(computePlayerStats(query, matchData)),
      (async () => {
        const client = new Anthropic({ apiKey })
        const stream = await client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: `You are a search assistant for a Celtic FC match archive. Given a list of matches and a query, identify the most relevant matches and return JSON only (no markdown fences).

Response format:
{
  "summary": "1–2 sentence friendly description of what you found",
  "results": [
    { "id": "exact-match-id", "reason": "concise reason under 20 words" }
  ]
}

Rules:
- If the query is a player name (e.g. "hatate", "duran"), return EVERY match where that player appears in the lineup or on the scoresheet — do not omit any
- For other queries, only include genuinely relevant matches
- Order by relevance (most relevant first)
- Honour numeric limits in the query (e.g. "top 5")
- Return empty results array with explanatory summary if nothing matches
- Use exact IDs from the data`,
          messages: [{ role: 'user', content: `Match archive:\n${serialized}\n\nQuery: "${query}"` }],
        })
        return stream.finalMessage()
      })(),
    ])

    const textBlock = msg.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response')

    const rawText = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(rawText) as {
      summary: string
      results: Array<{ id: string; reason: string }>
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify({ ...parsed, playerStats: playerStats ?? undefined }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(err) }))
  }
}
