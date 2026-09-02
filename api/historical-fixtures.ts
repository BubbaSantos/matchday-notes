import type { IncomingMessage, ServerResponse } from 'http'
import { getHistoricalFixtures } from '../server/sofascore.js'

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const fixtures = await getHistoricalFixtures()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(fixtures))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
