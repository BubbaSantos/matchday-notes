import { storeGet, storeSet, getRedisClient } from './store.js'

const DELETED_SET_KEY = 'match-edits:deleted'

export async function getDeletedSlugs(): Promise<string[]> {
  try {
    const members = await getRedisClient().smembers(DELETED_SET_KEY)
    return members as string[]
  } catch {
    return []
  }
}

async function addDeletedSlug(slug: string): Promise<void> {
  await getRedisClient().sadd(DELETED_SET_KEY, slug.replace(/^\//, ''))
}

async function removeDeletedSlug(slug: string): Promise<void> {
  await getRedisClient().srem(DELETED_SET_KEY, slug.replace(/^\//, ''))
}

export interface OverrideEvent {
  type: 'goal' | 'ownGoal' | 'yellowCard' | 'redCard'
  player: string
  minute: number | null
  isCeltic: boolean
}

export interface OverridePlayer {
  name: string
  starter: boolean
  subbedOff?: number | null
  subbedOn?: number | null
}

export interface OverrideLineup {
  teamName: string
  manager?: string | null
  players: OverridePlayer[]
}

export interface MatchOverride {
  deleted?: boolean
  homeScore?: number | null
  awayScore?: number | null
  tableNote?: string | null
  events?: OverrideEvent[] | null          // null = "use parsed"
  celticLineup?: OverrideLineup | null     // null = "use parsed"
  opponentLineup?: OverrideLineup | null   // null = "use parsed"
}

function editKey(slug: string): string {
  return `match-edit:${slug.replace(/^\//, '')}`
}

export async function getMatchOverride(slug: string): Promise<MatchOverride | null> {
  return storeGet<MatchOverride>(editKey(slug))
}

export async function saveMatchOverride(slug: string, override: MatchOverride): Promise<void> {
  await storeSet(editKey(slug), override)
  if (override.deleted) {
    await addDeletedSlug(slug)
  } else {
    await removeDeletedSlug(slug)
  }
}
