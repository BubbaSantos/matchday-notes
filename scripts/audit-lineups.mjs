/**
 * Audits lineup/event coverage for all matches from 2012 onwards.
 * Mirrors the logic in src/lib/historicalData.ts.
 *
 * Usage: node scripts/audit-lineups.mjs [--year 2024] [--missing-only]
 */

import { readFileSync } from 'fs'

const args = process.argv.slice(2)
const YEAR_FILTER = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1]) : null
const MISSING_ONLY = args.includes('--missing-only')

// ── Parser (ported from historicalData.ts) ────────────────────────────────────

const NON_TEAM_KEYS = new Set([
  'teams', 'trivia', 'review', 'articles', 'pictures', 'intro',
  'forum', 'motm', 'man_of_the_match', 'stats', 'statistics',
  'lineups', 'lineup', 'squads', 'squad', 'scorers',
  'bbc', 'live_text_commentary', 'possession', 'shots',
  'summary', 'match_links',
])

function hasLineupContent(text) {
  return /^Manager\b/m.test(text)
      || /^\d{1,2}[A-ZÀ-Ý]/m.test(text)        // "1Hart" no-space
      || /^\d{1,2},\s*[A-Z]/m.test(text)        // "01, K. Schmeichel" comma
      || /^\d{1,2} [A-Z][a-z]*\./m.test(text)   // "01 K. Schmeichel" initial+period
      || /^ *\d{1,2} [A-Z][a-z]{3,}/m.test(text) // " 1 Gordon" space+full-name (2016 era)
      || /^[A-Z]{2,}(?:[ ][A-Z]+)*:[ \t]+[A-Za-z]/m.test(text) // "CELTIC: Barkas" all-caps inline (same line)
}

function buildTeamsText(sections) {
  // Use sections.teams only if it has substantial content (not just a stub like "Celtic:")
  if (sections.teams && sections.teams.length > 50) {
    const raw = sections.teams
    // New-format content stored under old-style "TeamName:" headers:
    // normalize header colons so parseNewFormat can handle it, then append any
    // individual opponent sections that aren't already covered
    if (hasLineupContent(raw)) {
      // All-caps inline format: "CELTIC: Barkas; Ralston..." → "Celtic:\nBarkas; Ralston..."
      // Keep the trailing colon so hasColonHeaders → parseOldFormat (handles comma-separated players)
      if (/^[A-Z]{2,}(?:[ ][A-Z]+)*:[ \t]+[A-Za-z]/m.test(raw)) {
        return raw.replace(/^([A-Z][A-Z &']+):[ \t]+(.+)$/gm, (_, team, players) =>
          team.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ':\n' + players
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
          const name = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, c => c.toUpperCase()).replace(/:$/, '')
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
    // Keeps the colon so hasColonHeaders → parseOldFormat (handles comma-separated players)
    // OLD_FORMAT_SKIP_HEADERS in parseOldFormat then filters spurious Ref:/Goals:/etc. headers
    const OLD_FORMAT_NON_TEAM = /^(?:goals?|assists?|subs?(?:stitutes?)?|ref(?:eree)?|att(?:endance)?|notes?|aet|sent|yellow|red|pen|video|source|match|extra|missed|scored|saved|manager|formation|captain|venue|booked)/i
    const inlineNorm = raw.replace(/^([A-Z][A-Za-zÀ-ÿ &']+):[ \t]+([A-Za-zÀ-ÿ(].*)$/gm, (_, team, players) => {
      if (OLD_FORMAT_NON_TEAM.test(team)) return _
      return team.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ':\n' + players
    })
    if (oppKeys.length) {
      const extras = oppKeys.map(k => {
        const name = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, c => c.toUpperCase()).replace(/:$/, '')
        return name + '\n\n' + sections[k]
      }).join('\n\n')
      return inlineNorm + '\n\n' + extras
    }
    return inlineNorm
  }
  const teamKeys = Object.keys(sections).filter(k => {
    if (NON_TEAM_KEYS.has(k)) return false
    if (/\d/.test(k)) return false
    // Allow up to 7 parts for long team names like "young_boys_of_berne,_bsc_young_boys"
    if (k.split('_').length > 7) return false
    const text = sections[k] || ''
    // Article keys: first non-blank line is usually a URL
    const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? ''
    if (/^https?:\/\//i.test(firstLine)) return false
    return hasLineupContent(text)
  })
  if (!teamKeys.length) return ''
  const sorted = [...teamKeys].sort((a, b) =>
    /celtic/i.test(a) ? -1 : /celtic/i.test(b) ? 1 : 0
  )
  return sorted.map(k => {
    const teamName = k.replace(/_/g, ' ').replace(/['']/g, "'").replace(/\b\w/g, c => c.toUpperCase()).replace(/:$/, '')
    return `${teamName}\n\n${sections[k]}`
  }).join('\n\n')
}

function parseGoalList(str, isCeltic) {
  if (!str || /^none$/i.test(str.trim())) return []
  const events = []
  const re = /([A-Za-zÀ-ÿ\-'. ]+?)\s*\(([^)]+)\)/g
  let m
  while ((m = re.exec(str)) !== null) {
    const player = m[1].trim()
    if (!player) continue
    const details = m[2].trim()
    const ownGoal = /og|own goal/i.test(details)
    const stoppage = details.match(/(\d+)[+''\-]+(\d+)/)
    const n = stoppage ? parseInt(stoppage[1]) + parseInt(stoppage[2]) : parseInt(details.replace(/[^0-9]/g, ''))
    const minute = isNaN(n) ? null : n
    events.push({ type: ownGoal ? 'ownGoal' : 'goal', player, minute, isCeltic })
  }
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

function parseInlineGoals(text, isCeltic) {
  const events = []
  const re = /([A-Za-zÀ-ÿ\-'. ]+?)\s*\(([^)]+)\)/g
  let m
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

function parseBookingList(str, isCeltic, type) {
  if (!str || /^none$/i.test(str.trim())) return []
  return str.split(/,|;/).map(s => s.trim().replace(/\.$/, '')).filter(Boolean).map(player => ({
    type, player, minute: null, isCeltic,
  }))
}

function splitPlayers(str) {
  const parts = []
  let depth = 0, cur = ''
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

function parsePlayers(playerText) {
  const text = playerText.replace(/\.$/, '').trim()
  const starters = [], subs = []
  for (const entry of splitPlayers(text)) {
    const subMatch = entry.match(/^(.+?)\s*\(([A-Za-zÀ-ÿ'\-. ]+)\s+(\d+)\)$/)
    if (subMatch) {
      starters.push({ name: subMatch[1].trim(), starter: true, subbedOff: parseInt(subMatch[3]) })
      subs.push({ name: subMatch[2].trim(), starter: false, subbedOn: parseInt(subMatch[3]) })
    } else {
      starters.push({ name: entry.trim(), starter: true })
    }
  }
  return { starters, subs }
}

const OLD_FORMAT_SKIP_HEADERS = /^(?:goals?|assists?|subs?(?:stitutes?)?|ref(?:eree)?|att(?:endance)?|notes?|aet|bookings?|sent|yellow|red|pen(?:alty)?|video|source|match|extra|missed|scored|saved)/i

function parseOldFormat(text, result) {
  const sections = []
  const headerRe = /^([A-Za-zÀ-ÿ .'\-&()]+?):-?\s*$/gm
  let lastIndex = 0, lastTeam = '', m
  while ((m = headerRe.exec(text)) !== null) {
    if (OLD_FORMAT_SKIP_HEADERS.test(m[1].trim())) continue
    if (lastTeam) sections.push({ name: lastTeam, body: text.slice(lastIndex, m.index) })
    lastTeam = m[1].trim()
    lastIndex = m.index + m[0].length
  }
  if (lastTeam) sections.push({ name: lastTeam, body: text.slice(lastIndex) })

  for (const { name, body } of sections) {
    const isCeltic = /celtic/i.test(name)
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
    let playerText = ''
    const goals = [], bookings = [], redCards = []
    let subsNotUsed = []
    for (const line of lines) {
      if (/^goals?:?-?\s*(.*)$/i.test(line) || /^scorers?:?-?\s*(.*)$/i.test(line)) {
        const val = line.replace(/^(goals?|scorers?):?-?\s*/i, '').trim()
        goals.push(...parseGoalList(val, isCeltic)); continue
      }
      if (/^booked:?-?\s*/i.test(line)) {
        const val = line.replace(/^booked:?-?\s*/i, '').trim()
        bookings.push(...parseBookingList(val, isCeltic, 'yellowCard')); continue
      }
      if (/^(sent off|red cards?):?-?\s*/i.test(line)) {
        const val = line.replace(/^(sent off|red cards?):?-?\s*/i, '').trim()
        redCards.push(...parseBookingList(val, isCeltic, 'redCard')); continue
      }
      if (/^subs not used:?-?\s*/i.test(line)) {
        const val = line.replace(/^subs not used:?-?\s*/i, '').trim()
        subsNotUsed = val.split(/,|;/).map(p => p.trim()).filter(Boolean); continue
      }
      if (/^(referee|attendance|aet|after extra time|assists?)/i.test(line)) continue
      if (!line.toLowerCase().startsWith('sub') && line.length > 3) {
        playerText += (playerText ? ', ' : '') + line.replace(/\.$/, '')
      }
    }
    const { starters, subs } = parsePlayers(playerText)
    const lineup = { teamName: name, players: [...starters, ...subs], subsNotUsed }
    result.events.push(...goals, ...bookings, ...redCards)
    if (isCeltic) result.celticLineup = lineup
    else if (!result.opponentLineup) result.opponentLineup = lineup
  }
  result.events.sort((a, b) => {
    if (a.minute == null && b.minute == null) return 0
    if (a.minute == null) return 1
    if (b.minute == null) return -1
    return a.minute - b.minute
  })
  return result
}

const SKIP_SECTION_WORDS = new Set([
  'goals', 'substitutes', 'subs', 'ref', 'att', 'referee', 'attendance',
  'manager', 'formation', 'starting', 'lineup', 'captain', 'assists',
  'video', 'venue', 'fourth', 'assistant', 'notes', 'source',
  'penalties', 'penalty', 'match', 'aet', 'extra',
])

function parseNewFormatPlayerLine(raw, starters, events, isCeltic) {
  let line = raw
  // Normalize missing spaces from wiki no-space jersey format
  line = line.replace(/([a-zÀ-ÿ])(Substituted|Subbed|Booked)/g, '$1 $2')
  line = line.replace(/(for)([A-Z])/g, '$1 $2')
  line = line.replace(/([A-Za-zÀ-ÿ])at(\s+\d)/g, '$1 at$2')
  line = line.replace(/\s*\(c\)/i, '').trim()
  line = line.replace(/,\s*captain\s*$/i, '').trim()

  let playerName = line, subName = null, subMinute = null
  let yellowCard = false, redCard = false, yellowMinute = null

  // Format A: comma-based sub "Name, subbed for Sub at Nmin"
  const subbedCommaMatch = line.match(/^(.+?),\s*(?:subbed|substituted)\s+for\s+(.+?)\s+at\s+(\d+)\s*min/i)
  if (subbedCommaMatch) {
    playerName = subbedCommaMatch[1].trim()
    subName = subbedCommaMatch[2].trim()
    subMinute = parseInt(subbedCommaMatch[3])
  } else {
    // Format B: space-based sub "Name Substituted for Sub at Nmin"
    const subbedSpaceMatch = line.match(/^(.+?)\s+(?:subbed|substituted)\s+for\s+(.+?)\s+at\s+(\d+)/i)
    if (subbedSpaceMatch) {
      playerName = subbedSpaceMatch[1].trim()
      subName = subbedSpaceMatch[2].trim()
      subMinute = parseInt(subbedSpaceMatch[3])
    } else {
      // Format C: parens "Name (Sub Minute)"
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

  // Card detection
  const ycMatch = playerName.match(/^(.+?),\s*yellow\s*card\s*(\d+)(?:\+\d+)?[′''`]?/i)
  if (ycMatch) { yellowCard = true; yellowMinute = parseInt(ycMatch[2]); playerName = ycMatch[1].trim() }
  if (/;\s*yellow\s*card/i.test(playerName)) { yellowCard = true; playerName = playerName.replace(/;\s*yellow\s*card/i, '').trim() }
  if (/booked/i.test(playerName)) {
    yellowCard = true
    const bm = playerName.match(/booked\s+at\s+(\d+)/i)
    if (bm) yellowMinute = parseInt(bm[1])
    playerName = playerName.replace(/,?\s*booked(?:\s+at\s+\d+\s*mins?)?/i, '').trim()
  }
  if (/;\s*red\s*card/i.test(playerName) || /sent\s*off/i.test(playerName)) {
    redCard = true; playerName = playerName.replace(/;\s*red\s*card|sent\s*off/gi, '').trim()
  }

  playerName = playerName.replace(/[,.]$/, '').trim()
  if (!playerName) return
  // Reject strings that are only digits (attendance figures misidentified as players)
  if (/^\d+$/.test(playerName)) return

  starters.push({ name: playerName, starter: true, ...(subMinute != null ? { subbedOff: subMinute } : {}) })
  if (subName && subName.length > 1) starters.push({ name: subName, starter: false, subbedOn: subMinute ?? undefined })
  if (yellowCard) events.push({ type: 'yellowCard', player: playerName, minute: yellowMinute, isCeltic })
  if (redCard) events.push({ type: 'redCard', player: playerName, minute: null, isCeltic })
}

function parseNewFormat(text, result) {
  // Pre-process: merge jersey-only lines with the following name line
  // (some formats split "28," and "Z. Clark" across two lines)
  // Strip leading bullet characters (· U+00B7 or • U+2022) used in some 2018-era wiki entries
  const rawLines = text.split('\n').map(l => l.trim().replace(/^[·•]\s*/, ''))
  const lines = []
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]
    if (/^\d{1,3},?\s*$/.test(l) && i + 1 < rawLines.length && /^[A-Za-z]/.test(rawLines[i + 1])) {
      lines.push(l.replace(/,\s*$/, '') + ' ' + rawLines[i + 1])
      i++
    } else {
      lines.push(l)
    }
  }
  const isPlayerLine = l => /^\d{1,3}[\s,]/.test(l) || /^\d{1,3}[A-Z]/.test(l)
  const isTeamHeader = l => {
    if (!l || /^\d/.test(l)) return false
    const lo = l.toLowerCase().replace(/[^a-z]/g, ' ').trim()
    if (SKIP_SECTION_WORDS.has(lo.split(' ')[0])) return false
    return /^[A-Za-zÀ-ÿ .,'\-&/()]+$/.test(l)
  }
  const isInfoLine = l => /^(?:assists?|referee|video|assistant|fourth|venue|att)[:\s]/i.test(l)

  const teamSections = []
  const goalBlocks = []
  let currentGoalBlock = null, currentSection = null, inBench = false, inGoals = false
  let skipNextLine = false  // set after a label-only info line (e.g. "Referee:") to skip the value on the next line
  let afterFormationHeader = false  // true right after "Formation X-X-X" line to skip bare player names

  for (const line of lines) {
    // Blank lines always update state and clear the skip-next-line flag
    if (!line) { skipNextLine = false; afterFormationHeader = false; continue }
    if (skipNextLine) { skipNextLine = false; continue }
    // Inline goals
    const inlineGoalsMatch = line.match(/^goals?:\s*(.+)/i)
    if (inlineGoalsMatch) {
      const goalOwner = currentSection ? currentSection.isCeltic : true
      result.events.push(...parseInlineGoals(inlineGoalsMatch[1], goalOwner))
      inBench = false; continue
    }
    if (/^goals?[\s:′''`]*$/i.test(line)) {
      inGoals = true; inBench = false
      currentGoalBlock = { lines: [], isCeltic: currentSection ? currentSection.isCeltic : true }
      goalBlocks.push(currentGoalBlock); continue
    }
    // Match standalone bench-header lines only ("Substitutes", "Subs:") — NOT "Substituted for X"
    if (/^substitutes?\s*$/i.test(line) || /^subs?:?\s*$/i.test(line)) {
      inBench = true; inGoals = false; continue
    }
    if (isInfoLine(line)) {
      inGoals = false
      // If line is just a label ending with colon, next line is the value (e.g. ref name) — skip it
      if (/:\s*$/.test(line)) skipNextLine = true
      continue
    }
    if (/^(?:ref|referee)[:\s]/i.test(line) || /^(?:att|attendance)[:\s]/i.test(line)) {
      inGoals = false
      if (/:\s*$/.test(line)) skipNextLine = true
      continue
    }
    if (inGoals && isTeamHeader(line)) inGoals = false
    if (inGoals) { if (line && currentGoalBlock) currentGoalBlock.lines.push(line); continue }
    // Formation header: track state so bare player names right after it aren't mistaken for teams
    if (/^formation\b/i.test(line)) { afterFormationHeader = true; continue }
    // Once we see a digit-starting line after a formation header, bare names are done
    if (afterFormationHeader && /^\d/.test(line)) afterFormationHeader = false
    if (isTeamHeader(line)) {
      // Skip bare player names that appear right after a "Formation" line (2022 format)
      if (afterFormationHeader) continue
      currentSection = { name: line, playerLines: [], benchLines: [], isCeltic: /celtic/i.test(line) }
      teamSections.push(currentSection); inBench = false; inGoals = false; continue
    }
    if (currentSection && isPlayerLine(line)) {
      if (inBench) currentSection.benchLines.push(line)
      else currentSection.playerLines.push(line)
      continue
    }
    if (currentSection && inBench && /^[A-Za-z]/.test(line) && !isInfoLine(line)) {
      line.split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
        if (isPlayerLine(p)) currentSection.benchLines.push(p)
        else if (/^[A-Za-z]/.test(p)) currentSection.benchLines.push('  ' + p)
      })
    }
  }

  for (const block of goalBlocks) {
    const parenGoals = parseGoalList(block.lines.join(' '), block.isCeltic)
    if (parenGoals.length > 0) {
      result.events.push(...parenGoals)
      continue
    }
    for (const gl of block.lines) {
      const gm = gl.match(/^(.+?)\s+(\d+(?:\+\d+)?)[′''`]?\s*$/)
      if (gm) {
        result.events.push({ type: 'goal', player: gm[1].trim(), minute: parseInt(gm[2]), isCeltic: block.isCeltic })
      } else if (gl.trim()) {
        result.events.push({ type: 'goal', player: gl.trim(), minute: null, isCeltic: block.isCeltic })
      }
    }
  }

  for (const section of teamSections) {
    const isCeltic = /celtic/i.test(section.name)
    const starters = [], bench = []
    const seenJerseys = new Set()

    for (const raw of section.playerLines) {
      const jerseyMatch = raw.match(/^(\d{1,3})[,\s]/)
      const jersey = jerseyMatch?.[1] ?? null
      const stripped = raw.replace(/^\d{1,3}[,\s]*/, '').trim()
      if (!stripped) continue
      if (/\d[A-Z]/.test(stripped)) continue  // merged formation line
      if (jersey && seenJerseys.has(jersey)) continue
      if (jersey) seenJerseys.add(jersey)
      parseNewFormatPlayerLine(stripped, starters, result.events, isCeltic)
    }

    for (const raw of section.benchLines) {
      const stripped = raw.replace(/^\d{1,3}[,\s]*/, '').trim()
      if (!stripped || /\d[A-Z]/.test(stripped)) continue
      const names = stripped.includes(',') ? stripped.split(',').map(p => p.trim()).filter(Boolean) : [stripped]
      for (const name of names) {
        if (name && /^[A-Za-z]/.test(name)) bench.push({ name, starter: false })
      }
    }

    const lineup = { teamName: section.name, players: [...starters, ...bench], subsNotUsed: [] }
    if (isCeltic && starters.length > 0) result.celticLineup = lineup
    else if (!isCeltic && !result.opponentLineup && starters.length > 0) result.opponentLineup = lineup
  }

  result.events.sort((a, b) => {
    if (a.minute == null && b.minute == null) return 0
    if (a.minute == null) return 1; if (b.minute == null) return -1
    return a.minute - b.minute
  })
  return result
}

function parseTeamsSection(text) {
  const result = { celticLineup: null, opponentLineup: null, events: [], attendance: null, referee: null }
  if (!text) return result
  const attMatch = text.match(/(?:attendance|att)[:\s]+([0-9,. ]+)/i)
  if (attMatch) result.attendance = attMatch[1].trim().replace(/[, ]/g, '').replace(/\.$/, '')
  const refMatch = text.match(/(?:referee|ref)[:\s]+([^\n]+)/i)
  if (refMatch) result.referee = refMatch[1].trim()

  // Same keyword-exclusion logic as updated TS
  const COLON_SKIP = /^(?:subs?|goals?|manager|formation|assists?|ref(?:eree)?|att(?:endance)?|video|starting|lineup|captain|fourth|venue|notes?|source|yellow|red|pen|penalt|match|aet|extra|booked|missed|scored|saved)/i
  const hasColonHeaders = text.split('\n').some(line => {
    const m = line.match(/^([A-Za-zÀ-ÿ .'\-&()]+?):-?\s*$/)
    return m && !COLON_SKIP.test(m[1].trim())
  })
  return hasColonHeaders ? parseOldFormat(text, result) : parseNewFormat(text, result)
}

// ── Audit ─────────────────────────────────────────────────────────────────────

const years = YEAR_FILTER
  ? [YEAR_FILTER]
  : Array.from({ length: 2026 - 2012 + 1 }, (_, i) => 2012 + i)

let totalMatches = 0
let withBothLineups = 0
let withCelticOnly = 0
let withNoLineups = 0
let withEvents = 0
let withGoals = 0

const missingLineups = []
const lowStarters = []

for (const year of years) {
  let data
  try {
    data = JSON.parse(readFileSync(`public/history/${year}.json`, 'utf8'))
  } catch { continue }

  for (const match of data) {
    totalMatches++
    const sections = match.report?.sections ?? {}
    const teamsText = buildTeamsText(sections)
    const parsed = parseTeamsSection(teamsText)

    const celticStarters = parsed.celticLineup?.players.filter(p => p.starter).length ?? 0
    const oppStarters    = parsed.opponentLineup?.players.filter(p => p.starter).length ?? 0
    const goalCount      = parsed.events.filter(e => e.type === 'goal' || e.type === 'ownGoal').length
    const eventCount     = parsed.events.length

    const opp = match.home === 'Celtic' ? match.away : match.home
    const score = (match.homeScore != null && match.awayScore != null)
      ? `${match.homeScore}–${match.awayScore}` : '?–?'

    const hasBoth   = celticStarters >= 8 && oppStarters >= 8
    const hasCeltic = celticStarters >= 8

    if (hasBoth) withBothLineups++
    else if (hasCeltic) withCelticOnly++
    else withNoLineups++
    if (eventCount > 0) withEvents++
    if (goalCount > 0) withGoals++

    if (!hasBoth) {
      let reason = ''
      const hasReport = Object.keys(sections).length > 0

      if (!hasReport) reason = 'NO REPORT - no wiki sections at all'
      else if (!teamsText) reason = `NO TEAMS TEXT - sections: [${Object.keys(sections).join(', ')}]`
      else if (celticStarters === 0 && oppStarters === 0) reason = `PARSE FAILED - teams text exists (${teamsText.length}ch) but 0 starters parsed`
      else if (celticStarters < 8) {
        reason = `CELTIC PARTIAL - only ${celticStarters} starters parsed`
        if (oppStarters === 0) reason += ` | OPP MISSING`
      } else {
        reason = `OPP MISSING - Celtic ok (${celticStarters}), opponent has ${oppStarters} starters`
      }

      missingLineups.push({ year, date: match.date, slug: match.slug, opponent: opp, score, reason, celticStarters, oppStarters, goalCount, hasSections: hasReport })
    }

    if (hasBoth && celticStarters < 11) {
      lowStarters.push({ year, date: match.date, slug: match.slug, opponent: opp, score, celticStarters, oppStarters })
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(80)}`)
console.log(`  LINEUP / EVENTS AUDIT  —  2012–2026`)
console.log(`${'═'.repeat(80)}`)
console.log(`  Total matches:      ${totalMatches}`)
console.log(`  Full lineups:       ${withBothLineups}  (${pct(withBothLineups, totalMatches)}%)`)
console.log(`  Celtic only:        ${withCelticOnly}  (${pct(withCelticOnly, totalMatches)}%)`)
console.log(`  No lineups:         ${withNoLineups}  (${pct(withNoLineups, totalMatches)}%)`)
console.log(`  Have events:        ${withEvents}  (${pct(withEvents, totalMatches)}%)`)
console.log(`  Have goals:         ${withGoals}  (${pct(withGoals, totalMatches)}%)`)
console.log(`${'─'.repeat(80)}`)

const cats = {}
for (const m of missingLineups) {
  const cat = m.reason.split(' - ')[0].split(' |')[0]
  if (!cats[cat]) cats[cat] = []
  cats[cat].push(m)
}

console.log(`\n  MISSING LINEUPS BY CATEGORY:`)
for (const [cat, items] of Object.entries(cats).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${cat.padEnd(30)} ${items.length} matches`)
}

console.log(`\n${'─'.repeat(80)}`)
console.log(`  ALL MATCHES MISSING FULL LINEUPS (${missingLineups.length})`)
console.log(`${'─'.repeat(80)}`)

missingLineups.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

let prevYear = null
for (const m of missingLineups) {
  if (m.year !== prevYear) { console.log(`\n  ── ${m.year} ──`); prevYear = m.year }
  const dateStr = m.date ? m.date.slice(0, 10) : '????-??-??'
  const oppPad = m.opponent.padEnd(20).slice(0, 20)
  const scorePad = m.score.padEnd(5)
  console.log(`    ${dateStr}  ${oppPad}  ${scorePad}  C:${String(m.celticStarters).padStart(2)} O:${String(m.oppStarters).padStart(2)}  ${m.reason}`)
}

if (lowStarters.length > 0) {
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`  POSSIBLE PARSE ERRORS (full lineups but Celtic < 11 starters): ${lowStarters.length}`)
  console.log(`${'─'.repeat(80)}`)
  for (const m of lowStarters.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))) {
    const dateStr = m.date ? m.date.slice(0, 10) : '????-??-??'
    console.log(`    ${dateStr}  ${m.opponent.padEnd(20).slice(0, 20)}  ${m.score}  C:${m.celticStarters} O:${m.oppStarters}`)
  }
}

console.log(`\n${'═'.repeat(80)}\n`)

function pct(n, total) { return total ? Math.round(n / total * 100) : 0 }
