import type { IncomingMessage, ServerResponse } from 'http'
import { handleAiSearchRequest } from '../server/aiSearch.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  await handleAiSearchRequest(req, res)
}
