import type { IncomingMessage, ServerResponse } from 'http'
import { handleMe } from '../../server/authHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"Method not allowed"}'); return }
  await handleMe(req, res)
}
