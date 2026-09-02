import { useState, useEffect } from 'react'
import { fetchCelticFixtures } from '../lib/espn'
import { fetchCelticStanding, fetchCelticInjuries } from '../lib/sportmonks'
import * as localNotes from '../lib/notesDb'
import * as remoteNotes from '../lib/notesApi'
import { stableMatchKey } from '../lib/matchKey'
import { useAuth } from './useAuth'
import type { MatchEntry, LeagueStanding, VoiceNote } from '../types'

interface FixtureStore {
  fixtures: MatchEntry[]
  standing: LeagueStanding | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFixtures(): FixtureStore {
  const { username, loading: authLoading } = useAuth()
  const [fixtures, setFixtures] = useState<MatchEntry[]>([])
  const [standing, setStanding] = useState<LeagueStanding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (authLoading) return // wait to know whether to read local or synced notes
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [allFixtures, stand, injuries, notesMap] = await Promise.all([
          fetchCelticFixtures(),
          fetchCelticStanding().catch(() => null),
          fetchCelticInjuries().catch(() => []),
          username
            ? remoteNotes.getAllNotes().catch(() => new Map())
            : localNotes.getAllNotes().catch(() => new Map()),
        ])
        if (cancelled) return

        // Inject standing into upcoming Premiership fixtures, and merge in
        // notes/voice notes (keyed by a stable match key, since fixture
        // `id`s can shift when the upstream data changes) — from the
        // account if logged in, otherwise this device's local IndexedDB.
        const enriched = allFixtures.map((f) => {
          const key = stableMatchKey(f)
          const record = notesMap.get(key)
          const voiceNotes: VoiceNote[] | undefined = !record
            ? undefined
            : username
              ? (record.voiceNotes as VoiceNote[])
              : (record.voiceNotes as localNotes.StoredVoiceNote[]).map(localNotes.toVoiceNote)
          return {
            ...f,
            standing:
              f.phase === 'pre' && f.competition === 'Scottish Premiership'
                ? (stand ?? undefined)
                : undefined,
            notes: record?.notes || undefined,
            notesPostedAt: record?.notesPostedAt,
            voiceNotes,
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
  }, [tick, username, authLoading])

  return { fixtures, standing, loading, error, refresh: () => setTick((t) => t + 1) }
}
