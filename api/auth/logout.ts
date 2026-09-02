import type { IncomingMessage, ServerResponse } from 'http'
import { handleLogout } from '../../server/authHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"Method not allowed"}'); return }
  await handleLogout(req, res)
}
