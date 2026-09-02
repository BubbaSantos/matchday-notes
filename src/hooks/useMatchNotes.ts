import { useCallback, useEffect, useRef, useState } from 'react'
import * as localNotes from '../lib/notesDb'
import * as remoteNotes from '../lib/notesApi'
import { useAuth } from './useAuth'
import type { VoiceNote } from '../types'

export interface MatchNotes {
  draft: string
  notesPostedAt?: string
  voiceNotes: VoiceNote[]
  loading: boolean
  saving: boolean
  setDraft: (text: string) => void
  saveVoiceNote: (blob: Blob, transcript: string, duration: number) => void
  removeVoiceNote: (id: string) => void
}

interface LoadedRecord {
  notes: string
  notesPostedAt?: string
  voiceNotes: VoiceNote[]
}

const AUTOSAVE_DELAY_MS = 800

// Notes live here (not in the tab component) so the draft survives switching
// away to Events/Stats/Lineups and back — this hook is created once per
// match page and never unmounts on tab change.
export function useMatchNotes(matchKey: string | undefined): MatchNotes {
  const { username } = useAuth()
  const [record, setRecord] = useState<LoadedRecord | null>(null)
  const [draft, setDraftState] = useState('')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastSaved = useRef('')

  useEffect(() => {
    if (!matchKey) return
    let cancelled = false
    setRecord(null)
    setDraftState('')
    async function load() {
      if (username) {
        const r = await remoteNotes.getNotes(matchKey!)
        if (cancelled) return
        setRecord(r)
        setDraftState(r.notes)
        lastSaved.current = r.notes
      } else {
        const r = await localNotes.getNotes(matchKey!)
        if (cancelled) return
        const mapped = { notes: r.notes, notesPostedAt: r.notesPostedAt, voiceNotes: r.voiceNotes.map(localNotes.toVoiceNote) }
        setRecord(mapped)
        setDraftState(mapped.notes)
        lastSaved.current = mapped.notes
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(saveTimer.current)
    }
  }, [matchKey, username])

  const save = useCallback((text: string) => {
    if (!matchKey || text === lastSaved.current) return
    lastSaved.current = text
    setSaving(true)
    const op = username ? remoteNotes.postTextNote(matchKey, text) : localNotes.postTextNote(matchKey, text)
    op.then((postedAt) => {
      setRecord((prev) => prev && { ...prev, notes: text, notesPostedAt: postedAt })
    }).finally(() => setSaving(false))
  }, [matchKey, username])

  const setDraft = useCallback((text: string) => {
    setDraftState(text)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(text), AUTOSAVE_DELAY_MS)
  }, [save])

  const saveVoiceNote = useCallback((blob: Blob, transcript: string, duration: number) => {
    if (!matchKey) return
    if (username) {
      remoteNotes.addVoiceNote(matchKey, blob, transcript, duration).then((note) => {
        setRecord((prev) => prev && { ...prev, voiceNotes: [...prev.voiceNotes, note] })
      })
    } else {
      localNotes.addVoiceNote(matchKey, blob, transcript, duration).then((stored) => {
        setRecord((prev) => prev && { ...prev, voiceNotes: [...prev.voiceNotes, localNotes.toVoiceNote(stored)] })
      })
    }
  }, [matchKey, username])

  const removeVoiceNote = useCallback((id: string) => {
    if (!matchKey) return
    setRecord((prev) => prev && { ...prev, voiceNotes: prev.voiceNotes.filter((n) => n.id !== id) })
    if (username) remoteNotes.deleteVoiceNote(matchKey, id)
    else localNotes.deleteVoiceNote(matchKey, id)
  }, [matchKey, username])

  return {
    draft,
    notesPostedAt: record?.notesPostedAt,
    voiceNotes: record?.voiceNotes ?? [],
    loading: record === null,
    saving,
    setDraft,
    saveVoiceNote,
    removeVoiceNote,
  }
}
