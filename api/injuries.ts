import type { IncomingMessage, ServerResponse } from 'http'
import { fetchInjuries } from '../server/sportmonks.js'

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const injuries = await fetchInjuries()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(injuries))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
