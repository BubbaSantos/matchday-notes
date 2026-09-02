import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addVoiceNote,
  deleteVoiceNote,
  getNotes,
  setTextNote,
  toVoiceNote,
  type NotesRecord,
} from '../lib/notesDb'
import type { VoiceNote } from '../types'

export interface MatchNotes {
  preNotes: string
  postNotes: string
  preVoiceNotes: VoiceNote[]
  postVoiceNotes: VoiceNote[]
  loading: boolean
  setPreNotes: (text: string) => void
  setPostNotes: (text: string) => void
  saveVoiceNote: (field: 'pre' | 'post', blob: Blob, transcript: string, duration: number) => void
  removeVoiceNote: (field: 'pre' | 'post', id: string) => void
}

function toVoiceNotes(record: NotesRecord) {
  return {
    preVoiceNotes: record.preVoiceNotes.map(toVoiceNote),
    postVoiceNotes: record.postVoiceNotes.map(toVoiceNote),
  }
}

const SAVE_DEBOUNCE_MS = 400

export function useMatchNotes(matchKey: string | undefined): MatchNotes {
  const [record, setRecord] = useState<NotesRecord | null>(null)
  const saveTimers = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!matchKey) return
    let cancelled = false
    getNotes(matchKey).then((r) => { if (!cancelled) setRecord(r) })
    return () => { cancelled = true }
  }, [matchKey])

  const debouncedSave = useCallback((field: 'preNotes' | 'postNotes', key: string, text: string) => {
    if (!matchKey) return
    window.clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = window.setTimeout(() => {
      setTextNote(matchKey, field, text)
    }, SAVE_DEBOUNCE_MS)
  }, [matchKey])

  const setPreNotes = useCallback((text: string) => {
    if (!matchKey) return
    setRecord((prev) => prev && { ...prev, preNotes: text })
    debouncedSave('preNotes', 'pre', text)
  }, [matchKey, debouncedSave])

  const setPostNotes = useCallback((text: string) => {
    if (!matchKey) return
    setRecord((prev) => prev && { ...prev, postNotes: text })
    debouncedSave('postNotes', 'post', text)
  }, [matchKey, debouncedSave])

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
    postNotes: record?.postNotes ?? '',
    ...voiceNotes,
    loading: record === null,
    setPreNotes,
    setPostNotes,
    saveVoiceNote,
    removeVoiceNote,
  }
}
