export type Competition =
  | 'Scottish Premiership'
  | 'Scottish Cup'
  | 'League Cup'
  | 'Europa League'
  | 'Europa Conference League'
  | 'Champions League'
  | 'Friendly'

export type MatchPhase = 'pre' | 'live' | 'post'

export interface LeagueStanding {
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalDifference: number
  points: number
}

export interface TableRow {
  team: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export interface InjuryRecord {
  playerName: string
  position: string
  injury: string
  returnDate?: string
}

export interface MatchStat {
  label: string
  celtic: number | string
  opponent: number | string
}

export interface MatchEvent {
  type: string
  text: string
  minute: string
  isCeltic: boolean
}

export interface MatchEventData {
  events: MatchEvent[]
  stats: Record<string, Record<string, string>>
}

// Sofascore-based data

export interface SSIncident {
  type: 'goal' | 'card' | 'substitution' | 'penaltyShootout' | 'varDecision' | 'period'
  minute: number
  addedTime?: number
  isHome: boolean
  player?: string
  assist?: string
  incidentClass?: string
  scoringType?: string
  playerIn?: string
  playerOut?: string
}

export interface SSPlayer {
  name: string
  shortName: string
  position: string
  jerseyNumber: string
  starter: boolean
  used: boolean
  minutesPlayed?: number
  rating?: string
  captain?: boolean
  subbedInAt?: number
  subbedInAddedTime?: number
  replacedPlayer?: string
  replacedBy?: string
  replacedByAt?: number
  replacedByAddedTime?: number
  statistics?: Record<string, number>
}

export interface SSLineup {
  formation: string
  players: SSPlayer[]
}

export interface SSStat {
  name: string
  home: string
  away: string
}

export interface SSMatchData {
  incidents: SSIncident[]
  homeLineup: SSLineup
  awayLineup: SSLineup
  homeTeamName: string
  awayTeamName: string
  homeManager?: string
  awayManager?: string
  stats: SSStat[]
  xG: { home: number; away: number } | null
  confirmed: boolean
}

export interface VoiceNote {
  id: string
  audioUrl: string
  transcript: string
  duration: number
  createdAt: string
}

export interface MatchEntry {
  id: string
  sportmonksId?: number
  competition: Competition
  opponent: string
  opponentCrest?: string
  venue: 'H' | 'A' | 'N'
  kickoff: string // ISO date string
  stadiumName?: string
  round?: string
  rescheduledFrom?: { date: string; reason: string }

  standing?: LeagueStanding
  injuries?: InjuryRecord[]

  phase: MatchPhase
  celticScore?: number
  opponentScore?: number
  penalties?: { celtic: number; opponent: number }
  stats?: MatchStat[]

  notes?: string
  notesPostedAt?: string
  voiceNotes?: VoiceNote[]
}
