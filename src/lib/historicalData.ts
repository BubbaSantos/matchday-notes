// Parser for Celtic Wiki match data (teams section → structured events + lineups)

// Strip raw URLs, navigation noise, and dead-link text from report section text
export function cleanReportText(text: string): string {
  return text
    .split('\n')
    .map(line => {
      // Remove inline URLs
      let l = line.replace(/https?:\/\/\S+/g, '').trim()
      // Remove bare www. links
      l = l.replace(/www\.\S+/g, '').trim()
      return l
    })
    // Drop lines that are purely URL-like or navigation artifacts
    .filter(line => {
      if (!line) return false
      if (/^https?:\/\//i.test(line)) return false
      if (/^www\./i.test(line)) return false
      // Drop tab/navigation lines that crept in as text nodes
      if (/^\s*[\t]+\s*$/.test(line)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')  // collapse multiple blank lines
    .trim()
}

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

// ── Season helpers ────────────────────────────────────────────────────────────

// Returns the football season label for a date, e.g. "1967-68" or "2023-24"
export function wikiSeasonLabel(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = d.getMonth() + 1 // 1-12
  const startYear = month >= 7 ? year : year - 1
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

// Returns the two calendar years that make up a season label like "1967-68"
export function seasonToYears(label: string): [number, number] {
  const startYear = parseInt(label)
  const endShort  = label.slice(-2)
  const century   = Math.floor(startYear / 100) * 100
  let endYear = century + parseInt(endShort)
  if (endYear <= startYear) endYear += 100
  return [startYear, endYear]
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
  // Handle stoppage-time notation: "90+4", "90'-4", "90'-4" → 94
  const stoppage = raw.match(/(\d+)[+''\-]+(\d+)/)
  if (stoppage) return parseInt(stoppage[1]) + parseInt(stoppage[2])
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

// Keys that are never team sections
const NON_TEAM_KEYS = new Set([
  'teams', 'trivia', 'review', 'articles', 'pictures', 'intro',
  'forum', 'motm', 'man_of_the_match', 'stats', 'statistics',
  'lineups', 'lineup', 'squads', 'squad', 'scorers',
  'bbc', 'live_text_commentary', 'possession', 'shots',
  'summary', 'match_links',
])

function hasLineupContent(text: string): boolean {
  return /^Manager\b/m.test(text)
      || /^\d{1,2}[A-ZÀ-Ý]/m.test(text)            // "1Hart" no-space
      || /^\d{1,2},\s*[A-Z]/m.test(text)            // "01, K. Schmeichel" comma
      || /^\d{1,2} [A-Z][a-z]*\./m.test(text)       // "01 K. Schmeichel" initial+period
      || /^ *\d{1,2} [A-Z][a-z]{3,}/m.test(text)   // " 1 Gordon" space+full-name (2016 era)
      || /^[A-Z]{2,}(?:[ ][A-Z]+)*:[ \t]+[A-Za-z]/m.test(text) // "CELTIC: Barkas" all-caps inline
}

// When a match stores lineups under team-name keys (e.g. "celtic", "kilmarnock")
// instead of a single "teams" key, build a combined text the parser can handle.
export function buildTeamsText(sections: Record<string, string>): string {
  if (sections.teams && sections.teams.length > 50) {
    const raw = sections.teams
    // New-format content with old-style "TeamName:" headers: normalize and append opponent sections
    if (hasLineupContent(raw)) {
      // All-caps inline format: "CELTIC: Barkas; Ralston..." → "Celtic:\nBarkas; Ralston..."
      // Keep the colon so hasColonHeaders → parseOldFormat (handles comma-separated players)
      if (/^[A-Z]{2,}(?:[ ][A-Z]+)*:[ \t]+[A-Za-z]/m.test(raw)) {
        return raw.replace(/^([A-Z][A-Z &']+):[ \t]+(.+)$/gm, (_, team, players) =>
          team.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) + ':\n' + players
        )
      }
      const normalized = raw.replace(/^([A-Za-zÀ-ÿ .'\-&()]+):[-\s]*$/gm, '$1')
      const extraKeys = Object.keys(sections).filter(k => {
        if (NON_TEAM_KEYS.has(k) || /celtic/i.test(k) || k === 'teams') return false
        if (/\d/.test(k) || k.split('_').length > 7) return false
        const text = sections[k] || ''
        const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? ''
        if (/^https?:\/\//i.test(firstLine)) return false
        return hasLineupContent(text)
      })
      if (extraKeys.length) {
        const extras = extraKeys.map(k => {
          const name = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/:$/, '')
          return name + '\n\n' + sections[k]
        }).join('\n\n')
        return normalized + '\n\n' + extras
      }
      return normalized
    }
    // Old-format content in sections.teams — still look for opponent sections in individual keys
    const oppKeys = Object.keys(sections).filter(k => {
      if (NON_TEAM_KEYS.has(k) || /celtic/i.test(k) || k === 'teams') return false
      if (/\d/.test(k) || k.split('_').length > 7) return false
      const text = sections[k] || ''
      const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? ''
      if (/^https?:\/\//i.test(firstLine)) return false
      return hasLineupContent(text)
    })
    // Normalize title-case inline team headers: "Celtic: Barkas; Ralston..." → "Celtic:\nBarkas; Ralston..."
    // OLD_FORMAT_SKIP_HEADERS in parseOldFormat then filters spurious Ref:/Goals:/etc. headers
    const OLD_FORMAT_NON_TEAM = /^(?:goals?|assists?|subs?(?:stitutes?)?|ref(?:eree)?|att(?:endance)?|notes?|aet|sent|yellow|red|pen|video|source|match|extra|missed|scored|saved|manager|formation|captain|venue|booked)/i
    const inlineNorm = raw.replace(/^([A-Z][A-Za-zÀ-ÿ &']+):[ \t]+([A-Za-zÀ-ÿ(].*)$/gm, (_, team: string, players: string) => {
      if (OLD_FORMAT_NON_TEAM.test(team)) return _
      return team.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) + ':\n' + players
    })
    if (oppKeys.length) {
      const extras = oppKeys.map(k => {
        const name = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/:$/, '')
        return name + '\n\n' + sections[k]
      }).join('\n\n')
      return inlineNorm + '\n\n' + extras
    }
    return inlineNorm
  }

  const teamKeys = Object.keys(sections).filter(k => {
    if (NON_TEAM_KEYS.has(k)) return false
    if (/\d/.test(k)) return false  // score-string key
    // Allow up to 7 parts for long team names (e.g. "young_boys_of_berne,_bsc_young_boys")
    if (k.split('_').length > 7) return false
    const text = sections[k] || ''
    // Article keys: first non-blank line is usually a URL
    const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? ''
    if (/^https?:\/\//i.test(firstLine)) return false
    return hasLineupContent(text)
  })

  if (!teamKeys.length) return ''

  // Celtic section first, then opponent
  const sorted = [...teamKeys].sort((a, b) =>
    /celtic/i.test(a) ? -1 : /celtic/i.test(b) ? 1 : 0
  )

  return sorted.map(k => {
    const teamName = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/:$/, '')
    return `${teamName}\n\n${sections[k]}`
  }).join('\n\n')
}

export function parseTeamsSection(text: string): ParsedMatch {
  const result: ParsedMatch = {
    celticLineup: null,
    opponentLineup: null,
    events: [],
    attendance: null,
    referee: null,
  }

  if (!text) return result

  // Extract attendance / referee — handle both long and short forms
  const attMatch = text.match(/(?:attendance|att)[:\s]+([0-9,. ]+)/i)
  if (attMatch) result.attendance = attMatch[1].trim().replace(/[, ]/g, '').replace(/\.$/, '')
  const refMatch = text.match(/(?:referee|ref)[:\s]+([^\n]+)/i)
  if (refMatch) result.referee = refMatch[1].trim()

  // ── Format detection ──────────────────────────────────────────────────────
  // Old format uses "TeamName:-" headers (e.g. "Celtic:-", "Kilmarnock:-").
  // New format uses plain team-name lines followed by jersey-number player lines.
  // Exclude common section keywords from triggering the old-format path.
  const COLON_SKIP = /^(?:subs?|goals?|manager|formation|assists?|ref(?:eree)?|att(?:endance)?|video|starting|lineup|captain|fourth|venue|notes?|source|yellow|red|pen|penalt|match|aet|extra|booked|missed|scored|saved)/i
  const hasColonHeaders = text.split('\n').some(line => {
    const m = line.match(/^([A-Za-zÀ-ÿ .'\-&()]+?):-?\s*$/)
    return m != null && !COLON_SKIP.test(m[1].trim())
  })

  if (hasColonHeaders) {
    return parseOldFormat(text, result)
  }

  // ── New format: jersey-number player lines ────────────────────────────────
  return parseNewFormat(text, result)
}

// ── Old format parser (TeamName:- headers) ────────────────────────────────────

const OLD_FORMAT_SKIP_HEADERS = /^(?:goals?|assists?|subs?(?:stitutes?)?|ref(?:eree)?|att(?:endance)?|notes?|aet|bookings?|sent|yellow|red|pen(?:alty)?|video|source|match|extra|missed|scored|saved)/i

function parseOldFormat(text: string, result: ParsedMatch): ParsedMatch {
  const sections: Array<{ name: string; body: string }> = []
  const headerRe = /^([A-Za-zÀ-ÿ .'\-&()]+?):-?\s*$/gm
  let lastIndex = 0
  let lastTeam = ''
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    if (OLD_FORMAT_SKIP_HEADERS.test(m[1].trim())) continue
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
      if (/^(referee|attendance|aet|after extra time|assists?)/i.test(line)) continue
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
    if (isCeltic && starters.length > 0) result.celticLineup = lineup
    else if (!isCeltic && !result.opponentLineup && starters.length > 0) result.opponentLineup = lineup
  }

  result.events.sort((a, b) => {
    if (a.minute == null && b.minute == null) return 0
    if (a.minute == null) return 1
    if (b.minute == null) return -1
    return a.minute - b.minute
  })
  return result
}

// ── New format parser (jersey-number prefix lines) ────────────────────────────

const SKIP_SECTION_WORDS = new Set([
  'goals', 'substitutes', 'subs', 'ref', 'att', 'referee', 'attendance',
  'manager', 'formation', 'starting', 'lineup', 'captain', 'assists',
  'video', 'venue', 'fourth', 'assistant', 'notes', 'source',
  'penalties', 'penalty', 'match', 'aet', 'extra',
])

// Parse inline goal lists like "Chermiti (50′, 59′) Moore (71′)" — handles multiple minutes per player
function parseInlineGoals(text: string, isCeltic: boolean): HistoricalEvent[] {
  const events: HistoricalEvent[] = []
  const re = /([A-Za-zÀ-ÿ\-'. ]+?)\s*\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const player = m[1].trim()
    if (!player) continue
    const details = m[2].trim()
    const ownGoal = /og|own goal/i.test(details)
    const minuteMatches = [...details.matchAll(/(\d+(?:\+\d+)?)/g)]
    if (minuteMatches.length > 0) {
      for (const mm of minuteMatches) {
        events.push({ type: ownGoal ? 'ownGoal' : 'goal', player, minute: parseInt(mm[1]), isCeltic })
      }
    } else {
      events.push({ type: 'goal', player, minute: null, isCeltic })
    }
  }
  if (!events.length) {
    for (const p of text.split(',')) {
      const name = p.trim().replace(/\.$/, '')
      if (name && !/^none$/i.test(name)) events.push({ type: 'goal', player: name, minute: null, isCeltic })
    }
  }
  return events
}

function parseNewFormat(text: string, result: ParsedMatch): ParsedMatch {
  // Pre-process: merge jersey-only lines with the following name line
  // (some formats split "28," and "Z. Clark" across two lines)
  // Strip leading bullet characters (· U+00B7 or • U+2022) used in some 2018-era wiki entries
  const rawLines = text.split('\n').map(l => l.trim().replace(/^[·•]\s*/, ''))
  const lines: string[] = []
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]
    if (/^\d{1,3},?\s*$/.test(l) && i + 1 < rawLines.length && /^[A-Za-z]/.test(rawLines[i + 1])) {
      lines.push(l.replace(/,\s*$/, '') + ' ' + rawLines[i + 1])
      i++
    } else {
      lines.push(l)
    }
  }

  // Player line: starts with 1-3 digits then space, uppercase, or comma (covers "01 Forster", "01Forster", "1, Forster")
  const isPlayerLine = (l: string) => /^\d{1,3}[\s,]/.test(l) || /^\d{1,3}[A-Z]/.test(l)
  // Team-name header: no leading digit, not a known section keyword, only name characters
  const isTeamHeader = (l: string) => {
    if (!l || /^\d/.test(l)) return false
    const lo = l.toLowerCase().replace(/[^a-z]/g, ' ').trim()
    if (SKIP_SECTION_WORDS.has(lo.split(' ')[0])) return false
    return /^[A-Za-zÀ-ÿ .,'\-&/()]+$/.test(l)
  }
  // Skip informational lines that appear at the end of sections (Referee, Venue, Assists, etc.)
  const isInfoLine = (l: string) =>
    /^(?:assists?|referee|video|assistant|fourth|venue|att)[:\s]/i.test(l)

  type TeamSection = { name: string; playerLines: string[]; benchLines: string[]; isCeltic: boolean }
  const teamSections: TeamSection[] = []
  type GoalBlock = { lines: string[]; isCeltic: boolean }
  const goalBlocks: GoalBlock[] = []
  let currentGoalBlock: GoalBlock | null = null
  let currentSection: TeamSection | null = null
  let inBench = false
  let inGoals = false
  let skipNextLine = false  // set after a label-only info line (e.g. "Referee:") to skip the value on the next line
  let afterFormationHeader = false  // true right after "Formation X-X-X" line to skip bare player names

  for (const line of lines) {
    // Blank lines always update state and clear the skip-next-line flag
    if (!line) { skipNextLine = false; afterFormationHeader = false; continue }
    if (skipNextLine) { skipNextLine = false; continue }

    // Inline goals: "Goals: Player (45′, 67′) Player2 (71′)" — parse immediately
    const inlineGoalsMatch = line.match(/^goals?:\s*(.+)/i)
    if (inlineGoalsMatch) {
      const goalOwner = currentSection ? currentSection.isCeltic : true
      result.events.push(...parseInlineGoals(inlineGoalsMatch[1], goalOwner))
      inBench = false
      continue
    }

    // Standalone "Goals" / "Goals:" line — start collecting goal lines
    if (/^goals?[\s:′''`]*$/i.test(line)) {
      inGoals = true
      inBench = false
      currentGoalBlock = { lines: [], isCeltic: currentSection ? currentSection.isCeltic : true }
      goalBlocks.push(currentGoalBlock)
      continue
    }

    // Bench section headers: "Substitutes", "Subs", "Subs:" — NOT "Substituted for X"
    if (/^substitutes?\s*$/i.test(line) || /^subs?:?\s*$/i.test(line)) {
      inBench = true
      inGoals = false
      continue
    }

    // Informational lines (Referee, Venue, Assists, etc.) — skip silently
    // If the line is just a label (ends with colon), next line is the value — skip that too
    if (isInfoLine(line)) {
      inGoals = false
      if (/:\s*$/.test(line)) skipNextLine = true
      continue
    }

    // att/ref lines: stop goals block but don't skip (att/ref extracted from full text)
    if (/^(?:ref|referee)[:\s]/i.test(line) || /^(?:att|attendance)[:\s]/i.test(line)) {
      inGoals = false
      if (/:\s*$/.test(line)) skipNextLine = true
      continue
    }

    if (inGoals && isTeamHeader(line)) inGoals = false

    if (inGoals) {
      if (line && currentGoalBlock) currentGoalBlock.lines.push(line)
      continue
    }

    // Formation header: track state so bare player names right after it aren't mistaken for teams
    if (/^formation\b/i.test(line)) { afterFormationHeader = true; continue }
    // Once we see a digit-starting line after a formation header, bare names are done
    if (afterFormationHeader && /^\d/.test(line)) afterFormationHeader = false

    if (isTeamHeader(line)) {
      // Skip bare player names that appear right after a "Formation" line (2022 format)
      if (afterFormationHeader) continue
      currentSection = { name: line, playerLines: [], benchLines: [], isCeltic: /celtic/i.test(line) }
      teamSections.push(currentSection)
      inBench = false
      inGoals = false
      continue
    }

    if (currentSection && isPlayerLine(line)) {
      if (inBench) currentSection.benchLines.push(line)
      else currentSection.playerLines.push(line)
      continue
    }

    // Comma-separated bench names (older format leftover)
    if (currentSection && inBench && /^[A-Za-z]/.test(line) && !isInfoLine(line)) {
      line.split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
        if (isPlayerLine(p)) currentSection!.benchLines.push(p)
        else if (/^[A-Za-z]/.test(p)) currentSection!.benchLines.push('  ' + p)
      })
    }
  }

  // Parse standalone goal blocks
  for (const block of goalBlocks) {
    // Try "Player (minute)" paren format (common in 2016–2020 data)
    const parenGoals = parseGoalList(block.lines.join(' '), block.isCeltic)
    if (parenGoals.length > 0) {
      result.events.push(...parenGoals)
      continue
    }
    for (const gl of block.lines) {
      const gm = gl.match(/^(.+?)\s+(\d+(?:\+\d+)?)[′''`]?\s*$/)
      if (gm) {
        const minute = parseInt(gm[2])
        result.events.push({ type: 'goal', player: gm[1].trim(), minute: isNaN(minute) ? null : minute, isCeltic: block.isCeltic })
      } else if (gl.trim()) {
        result.events.push({ type: 'goal', player: gl.trim(), minute: null, isCeltic: block.isCeltic })
      }
    }
  }

  // Parse team sections
  for (const section of teamSections) {
    const isCeltic = /celtic/i.test(section.name)
    const starters: HistoricalPlayer[] = []
    const bench: HistoricalPlayer[] = []
    const seenJerseys = new Set<string>()

    for (const raw of section.playerLines) {
      const jerseyMatch = raw.match(/^(\d{1,3})[,\s]/)
      const jersey = jerseyMatch?.[1] ?? null

      // Strip jersey number and optional comma/space: "01 Name", "01,Name", "1, Name"
      const stripped = raw.replace(/^\d{1,3}[,\s]*/, '').trim()
      if (!stripped) continue

      // Skip merged formation display lines (contain multiple jersey+name sequences)
      if (/\d[A-Z]/.test(stripped)) continue

      // Skip duplicate jerseys (formation display repeated above proper lineup)
      if (jersey && seenJerseys.has(jersey)) continue
      if (jersey) seenJerseys.add(jersey)

      parseNewFormatPlayerLine(stripped, starters, result.events, isCeltic)
    }

    for (const raw of section.benchLines) {
      const stripped = raw.replace(/^\d{1,3}[,\s]*/, '').trim()
      if (!stripped || /\d[A-Z]/.test(stripped)) continue
      // Handle inline sub/card info on bench players too
      const names = stripped.includes(',')
        ? stripped.split(',').map(p => p.trim()).filter(Boolean)
        : [stripped]
      for (const name of names) {
        if (name && /^[A-Za-z]/.test(name)) bench.push({ name, starter: false })
      }
    }

    const lineup: HistoricalLineup = {
      teamName: section.name,
      players: [...starters, ...bench],
      subsNotUsed: [],
    }

    if (isCeltic && starters.length > 0) result.celticLineup = lineup
    else if (!isCeltic && !result.opponentLineup && starters.length > 0) result.opponentLineup = lineup
  }

  result.events.sort((a, b) => {
    if (a.minute == null && b.minute == null) return 0
    if (a.minute == null) return 1
    if (b.minute == null) return -1
    return a.minute - b.minute
  })

  return result
}

function parseNewFormatPlayerLine(
  raw: string,
  starters: HistoricalPlayer[],
  events: HistoricalEvent[],
  isCeltic: boolean,
): void {
  let line = raw

  // Normalize missing spaces from wiki no-space jersey format:
  // "RogicSubstituted" → "Rogic Substituted", "forRoberts" → "for Roberts",
  // "Cochraneat 71" → "Cochrane at 71"
  line = line.replace(/([a-zÀ-ÿ])(Substituted|Subbed|Booked)/g, '$1 $2')
  line = line.replace(/(for)([A-Z])/g, '$1 $2')
  line = line.replace(/([A-Za-zÀ-ÿ])at(\s+\d)/g, '$1 at$2')

  // Strip captain marker and trailing annotation
  line = line.replace(/\s*\(c\)/i, '').trim()
  line = line.replace(/,\s*captain\s*$/i, '').trim()

  let playerName = line
  let subName: string | null = null
  let subMinute: number | null = null
  let yellowCard = false
  let redCard = false
  let yellowMinute: number | null = null

  // ── Sub detection (try comma format first, then space, then parens) ──────

  // Format A: "Name, subbed for SubName at Nmin" (2025/2026)
  // Also catches yellow-card noise before the sub part — match rightmost ", subbed for"
  const subbedCommaMatch = line.match(/^(.+?),\s*(?:subbed|substituted)\s+for\s+(.+?)\s+at\s+(\d+)\s*min/i)
  if (subbedCommaMatch) {
    playerName = subbedCommaMatch[1].trim()
    subName = subbedCommaMatch[2].trim()
    subMinute = parseInt(subbedCommaMatch[3])
  } else {
    // Format B: "Name Substituted for SubName at Nmin" (2022–2024, no comma)
    const subbedSpaceMatch = line.match(/^(.+?)\s+(?:subbed|substituted)\s+for\s+(.+?)\s+at\s+(\d+)/i)
    if (subbedSpaceMatch) {
      playerName = subbedSpaceMatch[1].trim()
      subName = subbedSpaceMatch[2].trim()
      subMinute = parseInt(subbedSpaceMatch[3])
    } else {
      // Format C: "Name (SubName Minute)" — old wiki style
      const subParenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
      if (subParenMatch) {
        const potentialSub = subParenMatch[2].trim()
        if (!/^(c|oc|yellow\s*card|red\s*card)$/i.test(potentialSub)) {
          playerName = subParenMatch[1].trim()
          let subInfo = potentialSub
          const subYellow = /yellow\s*card/i.test(subInfo)
          if (subYellow) subInfo = subInfo.replace(/;\s*yellow\s*card/i, '').trim()
          const subParts = subInfo.match(/^(.*?)\s+(\d+)[′''`]?\s*$/)
          if (subParts) {
            subName = subParts[1].trim().replace(/\s*[–\-]+\s*$/, '')
            subMinute = parseInt(subParts[2])
          } else {
            subName = subInfo.trim().replace(/\s*[–\-]+\s*$/, '')
          }
          if (subYellow && subName) events.push({ type: 'yellowCard', player: subName, minute: subMinute, isCeltic })
        }
      }
    }
  }

  // ── Card detection on playerName ─────────────────────────────────────────

  // ", Yellow Card N'" (2026 format, may have mangled text after the minute)
  const ycMatch = playerName.match(/^(.+?),\s*yellow\s*card\s*(\d+)(?:\+\d+)?[′''`]?/i)
  if (ycMatch) {
    yellowCard = true
    yellowMinute = parseInt(ycMatch[2])
    playerName = ycMatch[1].trim()
  }

  if (/;\s*yellow\s*card/i.test(playerName)) {
    yellowCard = true
    playerName = playerName.replace(/;\s*yellow\s*card/i, '').trim()
  }

  if (/booked/i.test(playerName)) {
    yellowCard = true
    const bookedMin = playerName.match(/booked\s+at\s+(\d+)/i)
    if (bookedMin) yellowMinute = parseInt(bookedMin[1])
    playerName = playerName.replace(/,?\s*booked(?:\s+at\s+\d+\s*mins?)?/i, '').trim()
  }

  if (/;\s*red\s*card/i.test(playerName) || /sent\s*off/i.test(playerName)) {
    redCard = true
    playerName = playerName.replace(/;\s*red\s*card|sent\s*off/gi, '').trim()
  }

  // Clean trailing punctuation
  playerName = playerName.replace(/[,.]$/, '').trim()
  if (!playerName) return
  // Reject strings that are only digits (attendance figures misidentified as players)
  if (/^\d+$/.test(playerName)) return

  starters.push({
    name: playerName,
    starter: true,
    ...(subMinute != null ? { subbedOff: subMinute } : {}),
  })

  if (subName && subName.length > 1) {
    starters.push({
      name: subName,
      starter: false,
      subbedOn: subMinute ?? undefined,
    })
  }

  if (yellowCard) events.push({ type: 'yellowCard', player: playerName, minute: yellowMinute, isCeltic })
  if (redCard) events.push({ type: 'redCard', player: playerName, minute: null, isCeltic })
}
