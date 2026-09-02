// Simple username + passcode accounts, stored in Redis (server/store.ts).
// Sessions are stateless signed tokens (HMAC-SHA256), not server-side
// session storage — verifying one is just a signature + expiry check.
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto'
import { storeGet, storeSet } from './store.js'

interface UserRecord {
  username: string // original casing, for display
  passcodeHash: string
  salt: string
  createdAt: string
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function userKey(usernameLower: string): string {
  return `user:${usernameLower}`
}

function hashPasscode(passcode: string, salt: string): string {
  return scryptSync(passcode, salt, 64).toString('hex')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export async function createUser(
  username: string,
  passcode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = username.trim()
  if (trimmed.length < 2 || trimmed.length > 30) {
    return { ok: false, error: 'Username must be 2-30 characters.' }
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return { ok: false, error: 'Username can only contain letters, numbers, and _ . -' }
  }
  if (passcode.length < 4) {
    return { ok: false, error: 'Passcode must be at least 4 characters.' }
  }

  const key = userKey(normalizeUsername(trimmed))
  const existing = await storeGet<UserRecord>(key)
  if (existing) return { ok: false, error: 'That username is already taken.' }

  const salt = randomBytes(16).toString('hex')
  const record: UserRecord = {
    username: trimmed,
    passcodeHash: hashPasscode(passcode, salt),
    salt,
    createdAt: new Date().toISOString(),
  }
  await storeSet(key, record)
  return { ok: true }
}

export async function verifyUser(
  username: string,
  passcode: string
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const record = await storeGet<UserRecord>(userKey(normalizeUsername(username)))
  if (!record) return { ok: false, error: 'Incorrect username or passcode.' }
  const candidate = hashPasscode(passcode, record.salt)
  if (!safeEqual(candidate, record.passcodeHash)) {
    return { ok: false, error: 'Incorrect username or passcode.' }
  }
  return { ok: true, username: record.username }
}

// ── Session tokens ──────────────────────────────────────────────────────────

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
export const SESSION_COOKIE = 'session'

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured on the server.')
  return secret
}

export function createSessionToken(username: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

// Returns the username the token belongs to, or null if missing/invalid/expired.
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return null

  const expectedSig = createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url')
  if (!safeEqual(sig, expectedSig)) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { u: string; exp: number }
    if (Date.now() > payload.exp) return null
    return payload.u
  } catch {
    return null
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}
