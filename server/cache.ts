// Persistent cache backed by Upstash Redis (via Vercel's marketplace
// integration) — unlike an in-memory cache or Vercel's edge cache, this
// survives cold starts AND new deployments, which is what actually matters
// for a low-traffic personal app: the in-memory Sofascore index cache was
// getting rebuilt from scratch almost every request because serverless
// instances rarely stay warm, and the edge cache resets on every deploy.
// Falls back to a no-op (always a miss) if the KV env vars aren't
// configured — e.g. local dev, where the in-memory cache alone is fine.
import { Redis } from '@upstash/redis'

let client: Redis | null | undefined

function getClient(): Redis | null {
  // Read lazily, not as a module-level const — see server/sportmonks.ts's
  // apiFetch for why (vite.config.ts's .env loading runs after this
  // module's top-level code evaluates).
  if (client !== undefined) return client
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  client = url && token ? new Redis({ url, token }) : null
  return client
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient()
  if (!redis) return null
  try {
    const value = await redis.get<T>(key)
    return value ?? null
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient()
  if (!redis) return
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch {
    // best-effort — a failed cache write shouldn't break the request
  }
}
