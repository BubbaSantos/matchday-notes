import type { IncomingMessage, ServerResponse } from 'http'
import { getAuthedUsername } from './authHandlers.js'
import { getNotes, getAllNotes, postTextNote, addVoiceNote, deleteVoiceNote, importNotes, type NotesRecord, type StoredVoiceNote } from './notesStore.js'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : ({} as T))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function voiceNoteToClient(n: StoredVoiceNote) {
  return {
    id: n.id,
    transcript: n.transcript,
    duration: n.duration,
    createdAt: n.createdAt,
    audioUrl: `data:${n.audioMime};base64,${n.audioBase64}`,
  }
}

function recordToClient(record: NotesRecord) {
  return {
    notes: record.notes,
    notesPostedAt: record.notesPostedAt,
    voiceNotes: record.voiceNotes.map(voiceNoteToClient),
  }
}

export async function handleGetNotes(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })

  const url = new URL(req.url!, 'http://localhost')
  const matchKey = url.searchParams.get('matchKey')

  try {
    if (matchKey) {
      const record = await getNotes(username, matchKey)
      return sendJson(res, 200, recordToClient(record))
    }
    const all = await getAllNotes(username)
    const out: Record<string, ReturnType<typeof recordToClient>> = {}
    for (const [key, record] of all) out[key] = recordToClient(record)
    sendJson(res, 200, out)
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

export async function handleSaveText(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })

  try {
    const { matchKey, text } = await readJsonBody<{ matchKey?: string; text?: string }>(req)
    if (!matchKey || text === undefined) return sendJson(res, 400, { error: 'matchKey and text are required.' })
    const postedAt = await postTextNote(username, matchKey, text)
    sendJson(res, 200, { postedAt })
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

export async function handleVoicePost(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })

  try {
    const url = new URL(req.url!, 'http://localhost')
    const matchKey = url.searchParams.get('matchKey')
    const transcript = url.searchParams.get('transcript') ?? ''
    const duration = Number(url.searchParams.get('duration') ?? '0')
    if (!matchKey) return sendJson(res, 400, { error: 'matchKey is required.' })

    const mime = (req.headers['content-type'] || 'audio/webm').split(';')[0].trim()
    const body = await readRawBody(req)
    if (body.length === 0) return sendJson(res, 400, { error: 'No audio data received.' })

    const note = await addVoiceNote(username, matchKey, body.toString('base64'), mime, transcript, duration)
    sendJson(res, 200, voiceNoteToClient(note))
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

export async function handleVoiceDelete(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })

  try {
    const url = new URL(req.url!, 'http://localhost')
    const matchKey = url.searchParams.get('matchKey')
    const id = url.searchParams.get('id')
    if (!matchKey || !id) return sendJson(res, 400, { error: 'matchKey and id are required.' })
    await deleteVoiceNote(username, matchKey, id)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}

interface ImportVoiceNote {
  id: string
  transcript: string
  duration: number
  createdAt: string
  audioBase64: string
  audioMime: string
}

export async function handleImport(req: IncomingMessage, res: ServerResponse) {
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not logged in.' })

  try {
    const { notes } = await readJsonBody<{
      notes?: Record<string, { notes: string; notesPostedAt?: string; voiceNotes: ImportVoiceNote[] }>
    }>(req)
    if (!notes) return sendJson(res, 400, { error: 'notes is required.' })

    const converted: Record<string, NotesRecord> = {}
    for (const [matchKey, record] of Object.entries(notes)) {
      converted[matchKey] = {
        notes: record.notes,
        notesPostedAt: record.notesPostedAt,
        voiceNotes: record.voiceNotes.map((v) => ({
          id: v.id,
          transcript: v.transcript,
          duration: v.duration,
          createdAt: v.createdAt,
          audioBase64: v.audioBase64,
          audioMime: v.audioMime,
        })),
      }
    }
    await importNotes(username, converted)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { error: String(err) })
  }
}
