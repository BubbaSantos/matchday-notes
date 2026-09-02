import { useState, useEffect } from 'react'
import { fetchCelticFixtures } from '../lib/espn'
import { fetchCelticStanding, fetchCelticInjuries } from '../lib/sportmonks'
import { getAllNotes, toVoiceNote } from '../lib/notesDb'
import { stableMatchKey } from '../lib/matchKey'
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
        const [allFixtures, stand, injuries, notesMap] = await Promise.all([
          fetchCelticFixtures(),
          fetchCelticStanding().catch(() => null),
          fetchCelticInjuries().catch(() => []),
          getAllNotes().catch(() => new Map()),
        ])
        if (cancelled) return

        // Inject standing into upcoming Premiership fixtures, and merge in
        // locally-persisted notes/voice notes (keyed by a stable match key,
        // since fixture `id`s can shift when the upstream data changes).
        const enriched = allFixtures.map((f) => {
          const notes = notesMap.get(stableMatchKey(f))
          return {
            ...f,
            standing:
              f.phase === 'pre' && f.competition === 'Scottish Premiership'
                ? (stand ?? undefined)
                : undefined,
            preNotes: notes?.preNotes || undefined,
            postNotes: notes?.postNotes || undefined,
            preVoiceNotes: notes?.preVoiceNotes.map(toVoiceNote),
            postVoiceNotes: notes?.postVoiceNotes.map(toVoiceNote),
          }
        })

        enriched.sort(
          (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
        )

        // Attach the current injury list to just the next upcoming fixture —
        // it's a live squad snapshot, not something that varies per match, so
        // showing it on every future fixture would be misleading.
        const nextUpcoming = enriched.find((f) => f.phase === 'pre')
        if (nextUpcoming && injuries.length > 0) nextUpcoming.injuries = injuries

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
