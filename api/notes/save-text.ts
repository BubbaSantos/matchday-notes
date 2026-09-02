import type { IncomingMessage, ServerResponse } from 'http'
import { handleSaveText } from '../../server/notesHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"Method not allowed"}'); return }
  await handleSaveText(req, res)
}
