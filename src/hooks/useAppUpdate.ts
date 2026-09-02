import { useEffect, useRef, useState } from 'react'

// This app gets redeployed frequently. A tab or iOS "Add to Home Screen"
// instance left open across a deploy keeps running the JS it already
// loaded — reloading the page (or navigating within the SPA) doesn't fetch
// new code on its own. Detects a newer build by comparing the currently
// referenced JS bundle against what's in the freshly-fetched index.html,
// so we can prompt a reload instead of silently showing stale code.
function currentBundleSrc(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"]')?.getAttribute('src') ?? null
}

async function fetchLatestBundleSrc(): Promise<string | null> {
  try {
    const res = await fetch('/', { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

const CHECK_INTERVAL_MS = 10 * 60 * 1000 // 10 min, as a foreground fallback
const MIN_RECHECK_MS = 30 * 1000 // don't re-check more than once per 30s

export function useAppUpdate(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const lastCheck = useRef(0)

  useEffect(() => {
    const initial = currentBundleSrc()
    if (!initial) return

    async function check() {
      const now = Date.now()
      if (now - lastCheck.current < MIN_RECHECK_MS) return
      lastCheck.current = now

      const latest = await fetchLatestBundleSrc()
      if (latest && latest !== initial) setUpdateAvailable(true)
    }

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }

    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])

  return updateAvailable
}
