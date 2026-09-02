// Server-side notes storage (Redis), synced across every device a user logs
// into. Mirrors src/lib/notesDb.ts's shape so the client-side IndexedDB
// store (used for the one-time "import my local notes" migration) and the
// server model line up field-for-field.
import { getRedisClient, storeGet, storeSet } from './store.js'

export interface StoredVoiceNote {
  id: string
  transcript: string
  duration: number
  createdAt: string
  audioBase64: string
  audioMime: string
}

export interface NotesRecord {
  notes: string
  notesPostedAt?: string
  voiceNotes: StoredVoiceNote[]
}

function emptyRecord(): NotesRecord {
  return { notes: '', voiceNotes: [] }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function notesKey(usernameLower: string, matchKey: string): string {
  return `notes:${usernameLower}:${matchKey}`
}

function indexKey(usernameLower: string): string {
  return `notes-index:${usernameLower}`
}

export async function getNotes(username: string, matchKey: string): Promise<NotesRecord> {
  const record = await storeGet<NotesRecord>(notesKey(normalizeUsername(username), matchKey))
  return record ?? emptyRecord()
}

export async function getAllNotes(username: string): Promise<Map<string, NotesRecord>> {
  const usernameLower = normalizeUsername(username)
  const redis = getRedisClient()
  const matchKeys = await redis.smembers(indexKey(usernameLower))
  const map = new Map<string, NotesRecord>()
  if (matchKeys.length === 0) return map

  const keys = matchKeys.map((k) => notesKey(usernameLower, k))
  const records = await redis.mget<(NotesRecord | null)[]>(...keys)
  matchKeys.forEach((matchKey, i) => {
    const record = records[i]
    if (record) map.set(matchKey, record)
  })
  return map
}

async function saveRecord(usernameLower: string, matchKey: string, record: NotesRecord): Promise<void> {
  await storeSet(notesKey(usernameLower, matchKey), record)
  await getRedisClient().sadd(indexKey(usernameLower), matchKey)
}

export async function postTextNote(username: string, matchKey: string, text: string): Promise<string> {
  const usernameLower = normalizeUsername(username)
  const record = await getNotes(username, matchKey)
  const postedAt = new Date().toISOString()
  record.notes = text
  record.notesPostedAt = postedAt
  await saveRecord(usernameLower, matchKey, record)
  return postedAt
}

export async function addVoiceNote(
  username: string,
  matchKey: string,
  audioBase64: string,
  audioMime: string,
  transcript: string,
  duration: number
): Promise<StoredVoiceNote> {
  const usernameLower = normalizeUsername(username)
  const record = await getNotes(username, matchKey)
  const note: StoredVoiceNote = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    transcript,
    duration,
    createdAt: new Date().toISOString(),
    audioBase64,
    audioMime,
  }
  record.voiceNotes = [...record.voiceNotes, note]
  await saveRecord(usernameLower, matchKey, record)
  return note
}

export async function deleteVoiceNote(username: string, matchKey: string, id: string): Promise<void> {
  const usernameLower = normalizeUsername(username)
  const record = await getNotes(username, matchKey)
  record.voiceNotes = record.voiceNotes.filter((n) => n.id !== id)
  await saveRecord(usernameLower, matchKey, record)
}

// Bulk-import a client's local IndexedDB notes into their account, merging
// rather than overwriting anything already on the server (used for the
// one-time "sync my existing notes" migration on first login).
export async function importNotes(username: string, notes: Record<string, NotesRecord>): Promise<void> {
  const usernameLower = normalizeUsername(username)
  for (const [matchKey, incoming] of Object.entries(notes)) {
    const existing = await getNotes(username, matchKey)
    const merged: NotesRecord = {
      notes: existing.notes || incoming.notes,
      notesPostedAt: existing.notesPostedAt ?? incoming.notesPostedAt,
      voiceNotes: [
        ...existing.voiceNotes,
        ...incoming.voiceNotes.filter((n) => !existing.voiceNotes.some((e) => e.id === n.id)),
      ],
    }
    await saveRecord(usernameLower, matchKey, merged)
  }
}
