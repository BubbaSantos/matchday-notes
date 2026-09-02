import type { IncomingMessage, ServerResponse } from 'http'
import { getEnrichedFixtures } from '../server/fixtures.js'

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const data = await getEnrichedFixtures()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
