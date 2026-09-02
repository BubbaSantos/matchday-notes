import { useState, useEffect } from 'react'
import { fetchCelticFixtures } from '../lib/espn'
import { fetchCelticStanding } from '../lib/sportmonks'
import type { MatchEntry, LeagueStanding } from '../types'

interface FixtureStore {
  fixtures: MatchEntry[]
  standing: LeagueStanding | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFixtures(): FixtureStore {
  const [fixtures, setFixtures] = useState<MatchEntry[]>([])
  const [standing, setStanding] = useState<LeagueStanding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [allFixtures, stand] = await Promise.all([
          fetchCelticFixtures(),
          fetchCelticStanding().catch(() => null),
        ])
        if (cancelled) return

        // Inject standing into upcoming Premiership fixtures
        const enriched = allFixtures.map((f) => ({
          ...f,
          standing:
            f.phase === 'pre' && f.competition === 'Scottish Premiership'
              ? (stand ?? undefined)
              : undefined,
        }))

        enriched.sort(
          (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
        )

        setFixtures(enriched)
        setStanding(stand)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load fixtures')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tick])

  return { fixtures, standing, loading, error, refresh: () => setTick((t) => t + 1) }
}
