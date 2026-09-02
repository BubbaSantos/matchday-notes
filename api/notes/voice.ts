import type { IncomingMessage, ServerResponse } from 'http'
import { handleVoicePost, handleVoiceDelete } from '../../server/notesHandlers.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'POST') return handleVoicePost(req, res)
  if (req.method === 'DELETE') return handleVoiceDelete(req, res)
  res.statusCode = 405
  res.end('{"error":"Method not allowed"}')
}
