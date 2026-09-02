import type { IncomingMessage, ServerResponse } from 'http'
import { createUser, verifyUser, createSessionToken, verifySessionToken, parseCookies, SESSION_COOKIE } from './auth.js'

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : ({} as T))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const SESSION_COOKIE_MAX_AGE = 90 * 24 * 60 * 60 // seconds, matches auth.ts's SESSION_TTL_MS

function setSessionCookie(res: ServerResponse, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
  )
}

function clearSessionCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
}

export function getAuthedUsername(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie)
  return verifySessionToken(cookies[SESSION_COOKIE])
}

export async function handleSignup(req: IncomingMessage, res: ServerResponse) {
  try {
    const { username, passcode } = await readJsonBody<{ username?: string; passcode?: string }>(req)
    if (!username || !passcode) return sendJson(res, 400, { error: 'Username and passcode are required.' })

    const result = await createUser(username, passcode)
    if (!result.ok) return sendJson(res, 400, { error: result.error })

    const token = createSessionToken(username.trim())
    setSessionCookie(res, token)
    sendJson(res, 200, { username: username.trim() })
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

export async function handleLogin(req: IncomingMessage, res: ServerResponse) {
  try {
    const { username, passcode } = await readJsonBody<{ username?: string; passcode?: string }>(req)
    if (!username || !passcode) return sendJson(res, 400, { error: 'Username and passcode are required.' })

    const result = await verifyUser(username, passcode)
    if (!result.ok) return sendJson(res, 401, { error: result.error })

    const token = createSessionToken(result.username)
    setSessionCookie(res, token)
    sendJson(res, 200, { username: result.username })
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

export async function handleLogout(_req: IncomingMessage, res: ServerResponse) {
  clearSessionCookie(res)
  sendJson(res, 200, { ok: true })
}

export async function handleMe(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })
  sendJson(res, 200, { username })
}
