import type { SSMatchData } from '../types'

export async function fetchMatchEvents(date: string): Promise<SSMatchData | null> {
  const params = new URLSearchParams({ date })
  const res = await fetch(`/api/match-events?${params}`)
  if (!res.ok) return null
  const data = await res.json()
  return data ?? null
}
