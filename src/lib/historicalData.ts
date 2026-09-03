// Parser for Celtic Wiki match data (teams section → structured events + lineups)

export interface HistoricalPlayer {
  name: string
  subbedOff?: number   // minute subbed off
  subbedOn?: number    // minute subbed on (for bench players who came on)
  starter: boolean
}

export interface HistoricalLineup {
  teamName: string
  players: HistoricalPlayer[]
  subsNotUsed: string[]
}

export interface HistoricalEvent {
  type: 'goal' | 'yellowCard' | 'redCard' | 'ownGoal'
  player: string
  minute: number | null
  isCeltic: boolean
}

export interface ParsedMatch {
  celticLineup: HistoricalLineup | null
  opponentLineup: HistoricalLineup | null
  events: HistoricalEvent[]
  attendance: string | null
  referee: string | null
}

// ── Competition normaliser ────────────────────────────────────────────────────

import type { Competition } from '../types'

const COMPETITION_MAP: [RegExp, Competition][] = [
  [/premiership|spl|premier division|premier league/i, 'Scottish Premiership'],
  [/scottish cup/i, 'Scottish Cup'],
  [/league cup|sc.*cup/i, 'League Cup'],
  [/champions league|european cup|champions cup/i, 'Champions League'],
  [/europa conference/i, 'Europa Conference League'],
  [/europa league|uefa cup|cup winners/i, 'Europa League'],
]

export function normaliseCompetition(raw: string): Competition {
  for (const [re, comp] of COMPETITION_MAP) {
    if (re.test(raw)) return comp
  }
  return 'Friendly'
}

// ── Teams section parser ──────────────────────────────────────────────────────

function parseMinute(raw: string): number | null {
  const n = parseInt(raw.replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

function parseGoalList(str: string, isCeltic: boolean): HistoricalEvent[] {
  if (!str || /^none$/i.test(str.trim())) return []
  const events: HistoricalEvent[] = []
  // Match: "Player (90+2)" or "Player(81)" or "Player (OG 45)"
  const re = /([A-Za-zÀ-ÿ\-'. ]+?)\s*\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) {
    const player = m[1].trim()
    if (!player) continue
    const details = m[2].trim()
    const ownGoal = /og|own goal/i.test(details)
    const minute = parseMinute(details)
    events.push({ type: ownGoal ? 'ownGoal' : 'goal', player, minute, isCeltic })
  }
  // Fallback: names without minutes
  if (!events.length) {
    for (const p of str.split(',')) {
      const name = p.trim().replace(/\.$/, '')
      if (name && !/^none$/i.test(name)) {
        events.push({ type: 'goal', player: name, minute: null, isCeltic })
      }
    }
  }
  return events
}

function parseBookingList(str: string, isCeltic: boolean, type: HistoricalEvent['type']): HistoricalEvent[] {
  if (!str || /^none$/i.test(str.trim())) return []
  return str.split(/,|;/).map(s => s.trim().replace(/\.$/, '')).filter(Boolean).map(player => ({
    type, player, minute: null, isCeltic,
  }))
}

// Split player list string into individual entries, respecting parentheses
function splitPlayers(str: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  // Old format uses semicolons as group separators (goalkeeper; defenders; ...)
  // Normalise to commas within groups
  for (const ch of str.replace(/;/g, ',')) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      const p = cur.trim()
      if (p) parts.push(p)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function parsePlayers(playerText: string): { starters: HistoricalPlayer[]; subs: HistoricalPlayer[] } {
  const text = playerText.replace(/\.$/, '').trim()
  const starters: HistoricalPlayer[] = []
  const subs: HistoricalPlayer[] = []

  for (const entry of splitPlayers(text)) {
    // Modern sub format: "PlayerOff (PlayerOn Minute)"
    const subMatch = entry.match(/^(.+?)\s*\(([A-Za-zÀ-ÿ'\-. ]+)\s+(\d+)\)$/)
    if (subMatch) {
      const starterName = subMatch[1].trim()
      const subName    = subMatch[2].trim()
      const minute     = parseInt(subMatch[3])
      starters.push({ name: starterName, starter: true, subbedOff: minute })
      subs.push({ name: subName, starter: false, subbedOn: minute })
    } else {
      starters.push({ name: entry.trim(), starter: true })
    }
  }
  return { starters, subs }
}

export function parseTeamsSection(text: string, celticTeamName = 'Celtic'): ParsedMatch {
  const result: ParsedMatch = {
    celticLineup: null,
    opponentLineup: null,
    events: [],
    attendance: null,
    referee: null,
  }

  if (!text) return result

  // Extract attendance / referee (can appear anywhere)
  const attendanceMatch = text.match(/attendance[:\s]+([^\n]+)/i)
  if (attendanceMatch) result.attendance = attendanceMatch[1].trim().replace(/[,]/g, '')
  const refMatch = text.match(/referee[:\s]+([^\n]+)/i)
  if (refMatch) result.referee = refMatch[1].trim()

  // Split text into team sections. Team headers end with ":" or ":-"
  // e.g. "Celtic:-\n..." or "Celtic:\n..."
  const sections: Array<{ name: string; body: string }> = []
  const headerRe = /^([A-Za-zÀ-ÿ .'\-&()]+?):-?\s*$/gm
  let lastIndex = 0
  let lastTeam = ''
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    if (lastTeam) {
      sections.push({ name: lastTeam, body: text.slice(lastIndex, m.index) })
    }
    lastTeam = m[1].trim()
    lastIndex = m.index + m[0].length
  }
  if (lastTeam) sections.push({ name: lastTeam, body: text.slice(lastIndex) })

  for (const { name, body } of sections) {
    const isCeltic = /celtic/i.test(name)
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean)

    let playerText = ''
    const goals: HistoricalEvent[] = []
    const bookings: HistoricalEvent[] = []
    const redCards: HistoricalEvent[] = []
    let subsNotUsed: string[] = []

    for (const line of lines) {
      const lower = line.toLowerCase()

      if (/^goals?:?-?\s*(.*)$/i.test(line) || /^scorers?:?-?\s*(.*)$/i.test(line)) {
        const val = line.replace(/^(goals?|scorers?):?-?\s*/i, '').trim()
        goals.push(...parseGoalList(val, isCeltic))
        continue
      }
      if (/^booked:?-?\s*/i.test(line)) {
        const val = line.replace(/^booked:?-?\s*/i, '').trim()
        bookings.push(...parseBookingList(val, isCeltic, 'yellowCard'))
        continue
      }
      if (/^(sent off|red cards?):?-?\s*/i.test(line)) {
        const val = line.replace(/^(sent off|red cards?):?-?\s*/i, '').trim()
        redCards.push(...parseBookingList(val, isCeltic, 'redCard'))
        continue
      }
      if (/^subs not used:?-?\s*/i.test(line)) {
        const val = line.replace(/^subs not used:?-?\s*/i, '').trim()
        subsNotUsed = val.split(/,|;/).map(p => p.trim()).filter(Boolean)
        continue
      }
      // Skip metadata lines
      if (/^(referee|attendance|aet|after extra time)/i.test(line)) continue
      // Accumulate player lines (may span multiple lines in old format)
      if (!lower.startsWith('sub') && line.length > 3) {
        playerText += (playerText ? ', ' : '') + line.replace(/\.$/, '')
      }
    }

    const { starters, subs } = parsePlayers(playerText)
    const lineup: HistoricalLineup = {
      teamName: name,
      players: [...starters, ...subs],
      subsNotUsed,
    }

    result.events.push(...goals, ...bookings, ...redCards)

    if (isCeltic) result.celticLineup = lineup
    else if (!result.opponentLineup) result.opponentLineup = lineup
  }

  // Sort events by minute (nulls last)
  result.events.sort((a, b) => {
    if (a.minute == null && b.minute == null) return 0
    if (a.minute == null) return 1
    if (b.minute == null) return -1
    return a.minute - b.minute
  })

  return result
}
