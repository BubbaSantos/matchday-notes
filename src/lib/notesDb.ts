// Local, per-device persistence for match notes and voice notes. Text lives
// alongside the recorded audio Blob in IndexedDB (not localStorage — audio
// can be a few hundred KB to a few MB per note, well past localStorage's
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
  notes: string
  notesPostedAt?: string
  voiceNotes: StoredVoiceNote[]
}

function emptyRecord(): NotesRecord {
  return { notes: '', voiceNotes: [] }
}

// Rows saved before notes had a single-section-per-match model split into
// preNotes/postNotes + separate voice note lists. Fold them into the new
// shape on read rather than a one-off migration pass, so old data in a
// browser that hasn't opened the app in a while still comes back correctly.
interface LegacyRow {
  preNotes?: string
  preNotesPostedAt?: string
  postNotes?: string
  postNotesPostedAt?: string
  preVoiceNotes?: StoredVoiceNote[]
  postVoiceNotes?: StoredVoiceNote[]
}

function fromRow(row: (Partial<NotesRecord> & LegacyRow) | undefined): NotesRecord {
  if (!row) return emptyRecord()
  if (row.notes !== undefined || row.voiceNotes !== undefined) {
    return {
      notes: row.notes ?? '',
      notesPostedAt: row.notesPostedAt,
      voiceNotes: row.voiceNotes ?? [],
    }
  }
  // Legacy pre/post shape.
  const notes = [row.preNotes, row.postNotes].filter(Boolean).join('\n\n')
  return {
    notes,
    notesPostedAt: row.postNotesPostedAt ?? row.preNotesPostedAt,
    voiceNotes: [...(row.preVoiceNotes ?? []), ...(row.postVoiceNotes ?? [])],
  }
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
    const row = await withStore<{ matchKey: string } & Partial<NotesRecord> & LegacyRow | undefined>('readonly', (s) => s.get(matchKey))
    return fromRow(row)
  } catch {
    return emptyRecord()
  }
}

export async function getAllNotes(): Promise<Map<string, NotesRecord>> {
  const map = new Map<string, NotesRecord>()
  try {
    const rows = await withStore<({ matchKey: string } & Partial<NotesRecord> & LegacyRow)[]>('readonly', (s) => s.getAll())
    for (const row of rows) map.set(row.matchKey, fromRow(row))
  } catch { /* ignore — empty map */ }
  return map
}

async function saveRecord(matchKey: string, record: NotesRecord): Promise<void> {
  await withStore('readwrite', (s) => s.put({ matchKey, ...record }))
}

export async function postTextNote(matchKey: string, text: string): Promise<string> {
  const record = await getNotes(matchKey)
  const postedAt = new Date().toISOString()
  record.notes = text
  record.notesPostedAt = postedAt
  await saveRecord(matchKey, record)
  return postedAt
}

export async function addVoiceNote(
  matchKey: string,
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
  record.voiceNotes = [...record.voiceNotes, note]
  await saveRecord(matchKey, record)
  return note
}

export async function deleteVoiceNote(matchKey: string, id: string): Promise<void> {
  const record = await getNotes(matchKey)
  record.voiceNotes = record.voiceNotes.filter((n) => n.id !== id)
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
