import type { IncomingMessage, ServerResponse } from 'http'
import { handleGetNotes, handleSaveText, handleImport } from '../server/notesHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') return handleGetNotes(req, res)
  if (req.method === 'POST') {
    const url = new URL(req.url!, 'http://localhost')
    if (url.searchParams.get('kind') === 'import') return handleImport(req, res)
    return handleSaveText(req, res)
  }
  res.statusCode = 405; res.end('{"error":"Method not allowed"}')
}
