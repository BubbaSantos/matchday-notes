// One-time migration: on first login, offer to copy notes that were made
// locally (before the account existed, or on a device that was never
// logged in) up to the account so they sync everywhere. The server merges
// rather than overwrites, so this is safe to run more than once.
import { getAllNotes } from './notesDb'
import { importNotes, type LocalNotesForImport } from './notesApi'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function hasLocalNotesToMigrate(): Promise<boolean> {
  const all = await getAllNotes()
  for (const record of all.values()) {
    if (record.notes.trim() || record.voiceNotes.length > 0) return true
  }
  return false
}

export async function migrateLocalNotesToServer(): Promise<number> {
  const all = await getAllNotes()
  const payload: Record<string, LocalNotesForImport> = {}
  let count = 0

  for (const [matchKey, record] of all) {
    if (!record.notes.trim() && record.voiceNotes.length === 0) continue
    payload[matchKey] = {
      notes: record.notes,
      notesPostedAt: record.notesPostedAt,
      voiceNotes: await Promise.all(
        record.voiceNotes.map(async (v) => ({
          id: v.id,
          transcript: v.transcript,
          duration: v.duration,
          createdAt: v.createdAt,
          audioBase64: await blobToBase64(v.audioBlob),
          audioMime: v.audioBlob.type || 'audio/webm',
        }))
      ),
    }
    count++
  }

  if (count > 0) await importNotes(payload)
  return count
}
