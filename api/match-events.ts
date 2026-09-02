import type { IncomingMessage, ServerResponse } from 'http'
import { fetchSofascoreData, matchEventsCacheControl } from '../server/sofascore.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const date = url.searchParams.get('date') ?? ''
    if (!date) { res.statusCode = 400; res.end('{"error":"date required"}'); return }
    const data = await fetchSofascoreData(date)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', matchEventsCacheControl(date))
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}
