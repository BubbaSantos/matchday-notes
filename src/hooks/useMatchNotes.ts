import { useCallback, useEffect, useState } from 'react'
import {
  addVoiceNote,
  deleteVoiceNote,
  getNotes,
  postTextNote,
  toVoiceNote,
  type NotesRecord,
} from '../lib/notesDb'
import type { VoiceNote } from '../types'

export interface MatchNotes {
  preNotes: string
  preNotesPostedAt?: string
  postNotes: string
  postNotesPostedAt?: string
  preVoiceNotes: VoiceNote[]
  postVoiceNotes: VoiceNote[]
  loading: boolean
  postPreNotes: (text: string) => void
  postPostNotes: (text: string) => void
  saveVoiceNote: (field: 'pre' | 'post', blob: Blob, transcript: string, duration: number) => void
  removeVoiceNote: (field: 'pre' | 'post', id: string) => void
}

function toVoiceNotes(record: NotesRecord) {
  return {
    preVoiceNotes: record.preVoiceNotes.map(toVoiceNote),
    postVoiceNotes: record.postVoiceNotes.map(toVoiceNote),
  }
}

export function useMatchNotes(matchKey: string | undefined): MatchNotes {
  const [record, setRecord] = useState<NotesRecord | null>(null)

  useEffect(() => {
    if (!matchKey) return
    let cancelled = false
    getNotes(matchKey).then((r) => { if (!cancelled) setRecord(r) })
    return () => { cancelled = true }
  }, [matchKey])

  const postPreNotes = useCallback((text: string) => {
    if (!matchKey) return
    postTextNote(matchKey, 'preNotes', text).then((postedAt) => {
      setRecord((prev) => prev && { ...prev, preNotes: text, preNotesPostedAt: postedAt })
    })
  }, [matchKey])

  const postPostNotes = useCallback((text: string) => {
    if (!matchKey) return
    postTextNote(matchKey, 'postNotes', text).then((postedAt) => {
      setRecord((prev) => prev && { ...prev, postNotes: text, postNotesPostedAt: postedAt })
    })
  }, [matchKey])

  const saveVoiceNote = useCallback((field: 'pre' | 'post', blob: Blob, transcript: string, duration: number) => {
    if (!matchKey) return
    const key = field === 'pre' ? 'preVoiceNotes' : 'postVoiceNotes'
    addVoiceNote(matchKey, key, blob, transcript, duration).then((note) => {
      setRecord((prev) => prev && { ...prev, [key]: [...prev[key], note] })
    })
  }, [matchKey])

  const removeVoiceNote = useCallback((field: 'pre' | 'post', id: string) => {
    if (!matchKey) return
    const key = field === 'pre' ? 'preVoiceNotes' : 'postVoiceNotes'
    setRecord((prev) => prev && { ...prev, [key]: prev[key].filter((n) => n.id !== id) })
    deleteVoiceNote(matchKey, key, id)
  }, [matchKey])

  const voiceNotes = record ? toVoiceNotes(record) : { preVoiceNotes: [], postVoiceNotes: [] }

  return {
    preNotes: record?.preNotes ?? '',
    preNotesPostedAt: record?.preNotesPostedAt,
    postNotes: record?.postNotes ?? '',
    postNotesPostedAt: record?.postNotesPostedAt,
    ...voiceNotes,
    loading: record === null,
    postPreNotes,
    postPostNotes,
    saveVoiceNote,
    removeVoiceNote,
  }
}
