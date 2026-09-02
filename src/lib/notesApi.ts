// Client for the server-backed notes API (used when logged in — see
// src/lib/notesDb.ts for the anonymous, per-device IndexedDB equivalent).
import type { VoiceNote } from '../types'

export interface RemoteNotesRecord {
  notes: string
  notesPostedAt?: string
  voiceNotes: VoiceNote[]
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export async function getAllNotes(): Promise<Map<string, RemoteNotesRecord>> {
  const res = await fetch('/api/notes', { credentials: 'include' })
  const body = await json<Record<string, RemoteNotesRecord>>(res)
  return new Map(Object.entries(body))
}

export async function getNotes(matchKey: string): Promise<RemoteNotesRecord> {
  const res = await fetch(`/api/notes?matchKey=${encodeURIComponent(matchKey)}`, { credentials: 'include' })
  return json<RemoteNotesRecord>(res)
}

export async function postTextNote(matchKey: string, text: string): Promise<string> {
  const res = await fetch('/api/notes/save-text', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchKey, text }),
  })
  const { postedAt } = await json<{ postedAt: string }>(res)
  return postedAt
}

export async function addVoiceNote(matchKey: string, blob: Blob, transcript: string, duration: number): Promise<VoiceNote> {
  const params = new URLSearchParams({ matchKey, transcript, duration: String(duration) })
  const res = await fetch(`/api/notes/voice?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  })
  return json<VoiceNote>(res)
}

export async function deleteVoiceNote(matchKey: string, id: string): Promise<void> {
  const params = new URLSearchParams({ matchKey, id })
  await fetch(`/api/notes/voice?${params}`, { method: 'DELETE', credentials: 'include' })
}

export interface LocalNotesForImport {
  notes: string
  notesPostedAt?: string
  voiceNotes: { id: string; transcript: string; duration: number; createdAt: string; audioBase64: string; audioMime: string }[]
}

export async function importNotes(notes: Record<string, LocalNotesForImport>): Promise<void> {
  await fetch('/api/notes/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
}
