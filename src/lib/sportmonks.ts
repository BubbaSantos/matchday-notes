// Thin client for our own server-side Sportmonks proxy (server/sportmonks.ts) —
// the Sportmonks token stays server-side, never reaches the browser.
import { cacheGet, cacheSet } from './cache'
import type { LeagueStanding, InjuryRecord } from '../types'

export async function fetchCelticStanding(): Promise<LeagueStanding | null> {
  const cacheKey = 'standing'
  const cached = cacheGet<LeagueStanding | null>(cacheKey)
  if (cached !== null) return cached

  const res = await fetch('/api/standing')
  if (!res.ok) throw new Error(`Standing API: ${res.status}`)
  const standing = (await res.json()) as LeagueStanding | null

  cacheSet(cacheKey, standing, 10 * 60)
  return standing
}

export async function fetchCelticInjuries(): Promise<InjuryRecord[]> {
  const cacheKey = 'injuries'
  const cached = cacheGet<InjuryRecord[]>(cacheKey)
  if (cached) return cached

  const res = await fetch('/api/injuries')
  if (!res.ok) throw new Error(`Injuries API: ${res.status}`)
  const injuries = (await res.json()) as InjuryRecord[]

  cacheSet(cacheKey, injuries, 30 * 60)
  return injuries
}
