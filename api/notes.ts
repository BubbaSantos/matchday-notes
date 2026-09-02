import type { IncomingMessage, ServerResponse } from 'http'
import { handleGetNotes } from '../server/notesHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"Method not allowed"}'); return }
  await handleGetNotes(req, res)
}
