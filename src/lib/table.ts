import type { TableRow } from '../types'

export async function fetchLeagueTable(options?: {
  cutoff?: string   // YYYY-MM-DD
  inclusive?: boolean
}): Promise<TableRow[]> {
  const params = new URLSearchParams()
  if (options?.cutoff) params.set('cutoff', options.cutoff)
  if (options?.inclusive === false) params.set('inclusive', 'false')
  const res = await fetch(`/api/table?${params}`)
  if (!res.ok) throw new Error(`Table API: ${res.status}`)
  return res.json()
}
