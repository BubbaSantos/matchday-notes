interface CacheEntry<T> {
  data: T
  fetchedAt: number
  ttl: number
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`spm_cache_${key}`)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.fetchedAt > entry.ttl * 1000) {
      localStorage.removeItem(`spm_cache_${key}`)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number) {
  try {
    const entry: CacheEntry<T> = { data, fetchedAt: Date.now(), ttl: ttlSeconds }
    localStorage.setItem(`spm_cache_${key}`, JSON.stringify(entry))
  } catch {
    // localStorage full — just skip
  }
}
