import type { MatchEntry } from '../types'

// A stable key for a match, independent of its `id` (which is derived from
// array index in the fixture-fetching pipeline and can shift if upstream
// data changes). Notes are keyed by this instead, so they survive fixture
// list changes.
export function stableMatchKey(match: MatchEntry): string {
  const date = match.kickoff.slice(0, 10)
  const opponent = match.opponent.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${date}__${match.competition}__${opponent}`
}
