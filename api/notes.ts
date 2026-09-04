import type { IncomingMessage, ServerResponse } from 'http'
import { handleGetNotes, handleSaveText, handleImport } from '../server/notesHandlers.js'
import { getAuthedUsername } from '../server/authHandlers.js'
import { getMatchOverride, saveMatchOverride, getDeletedSlugs, type MatchOverride } from '../server/matchEditStore.js'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} as T) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://localhost')
  const kind = url.searchParams.get('kind')

  // Deleted slugs list (no auth — just a filter list for the client)
  if (kind === 'deleted-slugs' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await getDeletedSlugs())
    } catch {
      return sendJson(res, 200, [])
    }
  }

  // Match-edit sub-routes
  if (kind === 'edit') {
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug')
      if (!slug) return sendJson(res, 400, { error: 'slug required' })
      try {
        const override = await getMatchOverride(slug)
        return sendJson(res, 200, override ?? {})
      } catch {
        return sendJson(res, 200, {})
      }
    }
    if (req.method === 'POST') {
      const username = getAuthedUsername(req)
      if (!username) return sendJson(res, 401, { error: 'Unauthorized' })
      const body = await readBody<{ slug: string } & MatchOverride>(req)
      if (!body.slug) return sendJson(res, 400, { error: 'slug required' })
      const { slug: bodySlug, ...override } = body
      await saveMatchOverride(bodySlug, override)
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  // Notes routes
  if (req.method === 'GET') return handleGetNotes(req, res)
  if (req.method === 'POST') {
    if (kind === 'import') return handleImport(req, res)
    return handleSaveText(req, res)
  }
  res.statusCode = 405; res.end('{"error":"Method not allowed"}')
}
