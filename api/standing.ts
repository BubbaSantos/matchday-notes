import type { IncomingMessage, ServerResponse } from 'http'
import { fetchStanding } from '../server/sportmonks.js'

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const standing = await fetchStanding()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.end(JSON.stringify(standing))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
