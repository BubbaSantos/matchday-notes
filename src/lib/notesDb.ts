// Local, per-device persistence for pre/post-match notes and voice notes.
// Text lives alongside the recorded audio Blob in IndexedDB (not localStorage —
// audio can be a few hundred KB to a few MB per note, well past localStorage's
// ~5MB origin quota, especially on iOS Safari).
import type { VoiceNote } from '../types'

const DB_NAME = 'matchday-diary'
const DB_VERSION = 1
const STORE = 'notes'

export interface StoredVoiceNote {
  id: string
  transcript: string
  duration: number
  createdAt: string
  audioBlob: Blob
}

export interface NotesRecord {
  preNotes: string
  postNotes: string
  preVoiceNotes: StoredVoiceNote[]
  postVoiceNotes: StoredVoiceNote[]
}

function emptyRecord(): NotesRecord {
  return { preNotes: '', postNotes: '', preVoiceNotes: [], postVoiceNotes: [] }
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'matchKey' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getNotes(matchKey: string): Promise<NotesRecord> {
  try {
    const row = await withStore<{ matchKey: string } & NotesRecord | undefined>('readonly', (s) => s.get(matchKey))
    if (!row) return emptyRecord()
    return {
      preNotes: row.preNotes ?? '',
      postNotes: row.postNotes ?? '',
      preVoiceNotes: row.preVoiceNotes ?? [],
      postVoiceNotes: row.postVoiceNotes ?? [],
    }
  } catch {
    return emptyRecord()
  }
}

export async function getAllNotes(): Promise<Map<string, NotesRecord>> {
  const map = new Map<string, NotesRecord>()
  try {
    const rows = await withStore<({ matchKey: string } & NotesRecord)[]>('readonly', (s) => s.getAll())
    for (const row of rows) {
      map.set(row.matchKey, {
        preNotes: row.preNotes ?? '',
        postNotes: row.postNotes ?? '',
        preVoiceNotes: row.preVoiceNotes ?? [],
        postVoiceNotes: row.postVoiceNotes ?? [],
      })
    }
  } catch { /* ignore — empty map */ }
  return map
}

async function saveRecord(matchKey: string, record: NotesRecord): Promise<void> {
  await withStore('readwrite', (s) => s.put({ matchKey, ...record }))
}

export async function setTextNote(matchKey: string, field: 'preNotes' | 'postNotes', text: string): Promise<void> {
  const record = await getNotes(matchKey)
  record[field] = text
  await saveRecord(matchKey, record)
}

export async function addVoiceNote(
  matchKey: string,
  field: 'preVoiceNotes' | 'postVoiceNotes',
  audioBlob: Blob,
  transcript: string,
  duration: number
): Promise<StoredVoiceNote> {
  const record = await getNotes(matchKey)
  const note: StoredVoiceNote = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    transcript,
    duration,
    createdAt: new Date().toISOString(),
    audioBlob,
  }
  record[field] = [...record[field], note]
  await saveRecord(matchKey, record)
  return note
}

export async function updateVoiceNoteTranscript(
  matchKey: string,
  field: 'preVoiceNotes' | 'postVoiceNotes',
  id: string,
  transcript: string
): Promise<void> {
  const record = await getNotes(matchKey)
  record[field] = record[field].map((n) => (n.id === id ? { ...n, transcript } : n))
  await saveRecord(matchKey, record)
}

export async function deleteVoiceNote(
  matchKey: string,
  field: 'preVoiceNotes' | 'postVoiceNotes',
  id: string
): Promise<void> {
  const record = await getNotes(matchKey)
  record[field] = record[field].filter((n) => n.id !== id)
  await saveRecord(matchKey, record)
}

// Object URLs created from stored blobs, for <audio> playback. Cached per
// note id so repeated renders don't leak new URLs.
const audioUrlCache = new Map<string, string>()

export function toVoiceNote(stored: StoredVoiceNote): VoiceNote {
  let audioUrl = audioUrlCache.get(stored.id)
  if (!audioUrl) {
    audioUrl = URL.createObjectURL(stored.audioBlob)
    audioUrlCache.set(stored.id, audioUrl)
  }
  return {
    id: stored.id,
    audioUrl,
    transcript: stored.transcript,
    duration: stored.duration,
    createdAt: stored.createdAt,
  }
}
