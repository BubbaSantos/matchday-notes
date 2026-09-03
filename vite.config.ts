import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { computeLeagueTable } from './server/table.js'
import { fetchSofascoreData, getHistoricalFixtures } from './server/sofascore.js'
import { getEnrichedFixtures } from './server/fixtures.js'
import { handleTranscribeRequest } from './server/transcribe.js'
import { fetchStanding, fetchInjuries } from './server/sportmonks.js'
import { handleSignup, handleLogin, handleLogout, handleMe } from './server/authHandlers.js'
import { handleGetNotes, handleSaveText, handleVoicePost, handleVoiceDelete, handleImport } from './server/notesHandlers.js'
import { handleAiSearchRequest } from './server/aiSearch.js'

async function handleTableRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const cutoff = url.searchParams.get('cutoff') ?? new Date().toLocaleDateString('en-CA')
    const inclusive = url.searchParams.get('inclusive') !== 'false'
    const table = await computeLeagueTable(cutoff, inclusive)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(table))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

async function handleMatchEventsRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url!, 'http://localhost')
    const date = url.searchParams.get('date') ?? ''
    if (!date) { res.statusCode = 400; res.end('{"error":"date required"}'); return }
    const data = await fetchSofascoreData(date)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

async function handleHistoricalFixturesRequest(_req: IncomingMessage, res: ServerResponse) {
  try {
    const fixtures = await getHistoricalFixtures()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(fixtures))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

async function handleFixturesRequest(_req: IncomingMessage, res: ServerResponse) {
  try {
    const data = await getEnrichedFixtures()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(data))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

async function handleStandingRequest(_req: IncomingMessage, res: ServerResponse) {
  try {
    const standing = await fetchStanding()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(standing))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

async function handleInjuriesRequest(_req: IncomingMessage, res: ServerResponse) {
  try {
    const injuries = await fetchInjuries()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify(injuries))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(err) }))
  }
}

export default defineConfig(({ mode }) => {
  // Load .env / .env.local into process.env so server-side code (the API
  // middleware below, all under server/*.ts) can read secrets like
  // OPENAI_API_KEY via process.env — Vite only does this automatically for
  // import.meta.env in client code, not for config-level Node code.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fixtures-api',
      configureServer(server) {
        server.middlewares.use('/api/table', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleTableRequest(req, res)
        })

        server.middlewares.use('/api/match-events', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleMatchEventsRequest(req, res)
        })

        server.middlewares.use('/api/historical-fixtures', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleHistoricalFixturesRequest(req, res)
        })

        server.middlewares.use('/api/fixtures', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleFixturesRequest(req, res)
        })

        server.middlewares.use('/api/transcribe', (req, res, next) => {
          if (req.method !== 'POST') { next(); return }
          handleTranscribeRequest(req, res)
        })

        server.middlewares.use('/api/standing', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleStandingRequest(req, res)
        })

        server.middlewares.use('/api/injuries', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleInjuriesRequest(req, res)
        })

        // Consolidated (matches api/auth.ts) — routed by ?action=.
        server.middlewares.use('/api/auth', (req, res, next) => {
          const url = new URL(req.url!, 'http://localhost')
          const action = url.searchParams.get('action')
          if (req.method === 'GET' && action === 'me') { handleMe(req, res); return }
          if (req.method === 'POST' && action === 'signup') { handleSignup(req, res); return }
          if (req.method === 'POST' && action === 'login') { handleLogin(req, res); return }
          if (req.method === 'POST' && action === 'logout') { handleLogout(req, res); return }
          next()
        })

        server.middlewares.use('/api/notes/voice', (req, res, next) => {
          if (req.method === 'POST') { handleVoicePost(req, res); return }
          if (req.method === 'DELETE') { handleVoiceDelete(req, res); return }
          next()
        })

        // Consolidated (matches api/notes-write.ts) — routed by ?kind=.
        server.middlewares.use('/api/notes-write', (req, res, next) => {
          if (req.method !== 'POST') { next(); return }
          const url = new URL(req.url!, 'http://localhost')
          if (url.searchParams.get('kind') === 'import') { handleImport(req, res); return }
          handleSaveText(req, res)
        })

        server.middlewares.use('/api/notes', (req, res, next) => {
          if (req.method !== 'GET') { next(); return }
          handleGetNotes(req, res)
        })

        server.middlewares.use('/api/ai-search', (req, res, next) => {
          if (req.method !== 'POST') { next(); return }
          handleAiSearchRequest(req, res)
        })
      },
    },
  ],
  }
})
