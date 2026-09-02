# Matchday Diary

A personal matchday journal for Celtic — a before/during/after timeline for every
match across all competitions, with editable notes, voice notes (recorded
in-browser and auto-transcribed), and full-text search across everything you've
written.

## Local development

```bash
npm install
cp .env.example .env   # add your OPENAI_API_KEY for voice-note transcription
npm run dev
```

Open http://localhost:5173.

To use it from your phone on the same Wi-Fi, run `npm run dev -- --host` and
open `http://<this-machine's-LAN-IP>:5173` on the phone, then "Add to Home
Screen" from Safari's share sheet.

## How it's built

- **Frontend**: React + Vite + Tailwind, client-side routed (`react-router-dom`).
- **Fixture/results data**: ESPN's public scoreboard API (league, cups, UEFA
  competitions) plus two bundled ICS files (`data/*.ics`) for domestic cup
  fixtures, ported to TypeScript in `server/spflFixtures.ts` and
  `server/fixtures.ts`.
- **Match events, lineups, stats, xG, historical fixtures**: Sofascore's
  private API, via `server/sofascore.ts`. Sofascore blocks Node's built-in
  `fetch` (TLS/JA3 fingerprinting), so these requests go through
  [`got-scraping`](https://github.com/apify/got-scraping), which mimics a
  real browser's fingerprint — this only works probabilistically per request
  (~20-30%), so `ssFetch` retries a handful of times before giving up.
- **League standings**: computed from ESPN's Premiership results
  (`server/table.ts`).
- **Voice note transcription**: `server/transcribe.ts` proxies recorded audio
  to OpenAI's Whisper API. Requires `OPENAI_API_KEY`.
- **Notes & voice notes storage**: entirely client-side, in IndexedDB
  (`src/lib/notesDb.ts`) — nothing is sent to a database. Keyed by a stable
  match key (date + competition + opponent) rather than the fixture's `id`,
  since `id` is derived from array position and can shift if upstream fixture
  data changes.

All server logic lives under `server/`, shared between two runtimes:
- **Local dev**: wired up as Vite dev-server middleware in `vite.config.ts`.
- **Production (Vercel)**: thin wrappers in `api/*.ts`, one file per
  serverless function, each importing the same `server/*` module.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" → import the repo. It auto-detects Vite; no
   build config changes needed.
3. Add an environment variable: `OPENAI_API_KEY` (Project Settings →
   Environment Variables).
4. Deploy. Every push to the branch you configure auto-deploys.
5. On your iPhone, open the deployed URL in Safari → Share → Add to Home
   Screen.

The free Hobby plan comfortably covers personal use (100 deploys/day, 1M
function invocations/month).

## Known limitations

- The cup ICS files under `data/` are a point-in-time snapshot, not live —
  they're refreshed by re-syncing from the source and committing.
- Sofascore-backed features (match events, lineups, historical fixtures) can
  occasionally come back empty on a given request if all retries in `ssFetch`
  fail — this self-heals on the next request/refresh.
- Voice note audio and transcripts are stored per-browser (IndexedDB) — they
  don't sync across devices. If you use the app on both desktop and iPhone,
  each keeps its own notes.
