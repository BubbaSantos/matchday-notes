import type { IncomingMessage, ServerResponse } from 'http'
import { handleTranscribeRequest } from '../server/transcribe.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  await handleTranscribeRequest(req, res)
}
