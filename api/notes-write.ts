import type { IncomingMessage, ServerResponse } from 'http'
import { handleSaveText, handleImport } from '../server/notesHandlers.js'

// Consolidated (see api/auth.ts for why) — routed by ?kind=.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"Method not allowed"}'); return }
  const url = new URL(req.url!, 'http://localhost')
  if (url.searchParams.get('kind') === 'import') return handleImport(req, res)
  return handleSaveText(req, res)
}
