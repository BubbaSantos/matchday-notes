// Durable Redis-backed storage for user accounts and synced notes — distinct
// from server/cache.ts, which is a TTL-based *cache* (safe to silently miss).
// A failure to read/write here is a real data-loss risk, so this throws
// instead of silently no-op'ing when the store isn't configured.
import { Redis } from '@upstash/redis'

let client: Redis | null | undefined

export function getRedisClient(): Redis {
  if (client === undefined) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    client = url && token ? new Redis({ url, token }) : null
  }
  if (!client) throw new Error('Data store is not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing).')
  return client
}

function getClient(): Redis {
  return getRedisClient()
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const value = await getClient().get<T>(key)
  return value ?? null
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  await getClient().set(key, value)
}

export async function storeDel(key: string): Promise<void> {
  await getClient().del(key)
}
