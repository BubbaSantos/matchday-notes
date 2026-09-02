import type { IncomingMessage, ServerResponse } from 'http'
import { computeLeagueTable } from '../server/table.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const cutoff = url.searchParams.get('cutoff') ?? new Date().toLocaleDateString('en-CA')
    const inclusive = url.searchParams.get('inclusive') !== 'false'
    const table = await computeLeagueTable(cutoff, inclusive)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.end(JSON.stringify(table))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
