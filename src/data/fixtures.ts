import type { MatchEntry } from '../types'

// Cup and European fixtures — not available on Sportmonks free plan.
// These are maintained manually until an upgrade adds cup endpoints.
export const PLACEHOLDER_FIXTURES: MatchEntry[] = [
  {
    id: 'celtic-motherwell-lc-2627-sf',
    competition: 'League Cup',
    opponent: 'Motherwell',
    venue: 'N',
    kickoff: '2026-10-18T14:00:00',
    phase: 'pre',
    injuries: [],
    preNotes: '',
  },
]
