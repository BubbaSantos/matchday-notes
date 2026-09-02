import { useCallback, useEffect, useState } from 'react'
import * as localNotes from '../lib/notesDb'
import * as remoteNotes from '../lib/notesApi'
import { useAuth } from './useAuth'
import type { VoiceNote } from '../types'

export interface MatchNotes {
  notes: string
  notesPostedAt?: string
  voiceNotes: VoiceNote[]
  loading: boolean
  postNotes: (text: string) => void
  saveVoiceNote: (blob: Blob, transcript: string, duration: number) => void
  removeVoiceNote: (id: string) => void
}

interface LoadedRecord {
  notes: string
  notesPostedAt?: string
  voiceNotes: VoiceNote[]
}

export function useMatchNotes(matchKey: string | undefined): MatchNotes {
  const { username } = useAuth()
  const [record, setRecord] = useState<LoadedRecord | null>(null)

  useEffect(() => {
    if (!matchKey) return
    let cancelled = false
    setRecord(null)
    async function load() {
      if (username) {
        const r = await remoteNotes.getNotes(matchKey!)
        if (!cancelled) setRecord(r)
      } else {
        const r = await localNotes.getNotes(matchKey!)
        if (!cancelled) setRecord({ notes: r.notes, notesPostedAt: r.notesPostedAt, voiceNotes: r.voiceNotes.map(localNotes.toVoiceNote) })
      }
    }
    load()
    return () => { cancelled = true }
  }, [matchKey, username])

  const postNotes = useCallback((text: string) => {
    if (!matchKey) return
    const save = username ? remoteNotes.postTextNote(matchKey, text) : localNotes.postTextNote(matchKey, text)
    save.then((postedAt) => {
      setRecord((prev) => prev && { ...prev, notes: text, notesPostedAt: postedAt })
    })
  }, [matchKey, username])

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
    notes: record?.notes ?? '',
    notesPostedAt: record?.notesPostedAt,
    voiceNotes: record?.voiceNotes ?? [],
    loading: record === null,
    postNotes,
    saveVoiceNote,
    removeVoiceNote,
  }
}
