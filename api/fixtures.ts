import type { IncomingMessage, ServerResponse } from 'http'
import { getEnrichedFixtures } from '../server/fixtures.js'

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const data = await getEnrichedFixtures()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
