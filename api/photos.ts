import type { IncomingMessage, ServerResponse } from 'http'
import { put, del } from '@vercel/blob'
import { getAuthedUsername } from '../server/authHandlers.js'
import { storeGet, storeSet } from '../server/store.js'

export interface StoredPhoto {
  id: string
  url: string
  isPublic: boolean
  uploadedAt: string
  filename: string
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function redisKey(matchKey: string) {
  return `photos:${matchKey}`
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://localhost')
  const matchKey = url.searchParams.get('matchKey') ?? ''

  if (!matchKey) return sendJson(res, 400, { error: 'matchKey required' })

  // GET — list photos for a match (public photos visible to all; private only to authed user)
  if (req.method === 'GET') {
    const photos = (await storeGet<StoredPhoto[]>(redisKey(matchKey))) ?? []
    const username = getAuthedUsername(req)
    const visible = username ? photos : photos.filter(p => p.isPublic)
    return sendJson(res, 200, visible)
  }

  // All writes require auth
  const username = getAuthedUsername(req)
  if (!username) return sendJson(res, 401, { error: 'Not authenticated' })

  // DELETE — remove a photo
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) return sendJson(res, 400, { error: 'id required' })
    const photos = (await storeGet<StoredPhoto[]>(redisKey(matchKey))) ?? []
    const photo = photos.find(p => p.id === id)
    if (!photo) return sendJson(res, 404, { error: 'Not found' })
    // Delete from Blob
    try { await del(photo.url) } catch { /* ignore if already gone */ }
    await storeSet(redisKey(matchKey), photos.filter(p => p.id !== id))
    return sendJson(res, 200, { ok: true })
  }

  // POST — upload a photo
  if (req.method === 'POST') {
    const isPublic = url.searchParams.get('public') === 'true'
    const filename = url.searchParams.get('filename') ?? 'photo.jpg'
    const contentType = req.headers['content-type'] ?? 'image/jpeg'

    // Read raw body
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      req.on('data', c => chunks.push(c))
      req.on('end', resolve)
      req.on('error', reject)
    })
    const body = Buffer.concat(chunks)

    if (!body.length) return sendJson(res, 400, { error: 'No file data' })

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const blobPath = `match-photos/${matchKey}/${id}-${filename}`

    const { url: blobUrl } = await put(blobPath, body, {
      access: 'public',
      contentType,
    })

    const photo: StoredPhoto = {
      id,
      url: blobUrl,
      isPublic,
      uploadedAt: new Date().toISOString(),
      filename,
    }

    const existing = (await storeGet<StoredPhoto[]>(redisKey(matchKey))) ?? []
    await storeSet(redisKey(matchKey), [...existing, photo])

    return sendJson(res, 200, photo)
  }

  sendJson(res, 405, { error: 'Method not allowed' })
}
