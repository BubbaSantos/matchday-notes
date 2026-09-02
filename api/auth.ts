import type { IncomingMessage, ServerResponse } from 'http'
import { handleSignup, handleLogin, handleLogout, handleMe } from '../server/authHandlers.js'

// Consolidated into one function (Vercel's Hobby plan caps a deployment at
// 12 serverless functions) — routed by ?action=, same pattern as
// api/notes/voice.ts's POST/DELETE split.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://localhost')
  const action = url.searchParams.get('action')

  if (req.method === 'GET' && action === 'me') return handleMe(req, res)
  if (req.method === 'POST' && action === 'signup') return handleSignup(req, res)
  if (req.method === 'POST' && action === 'login') return handleLogin(req, res)
  if (req.method === 'POST' && action === 'logout') return handleLogout(req, res)

  res.statusCode = 404
  res.end('{"error":"Not found"}')
}
