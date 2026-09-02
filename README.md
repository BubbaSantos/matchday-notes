# Matchday Diary

A personal matchday journal for Celtic — a before/during/after timeline for every
match across all competitions, with editable notes, voice notes (recorded
in-browser and auto-transcribed), and full-text search across everything you've
written.

## Local development

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY (transcription) and SCRAPERAPI_KEY (Sofascore)
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
  `fetch` (TLS/JA3 fingerprinting) *and* blocks Vercel's datacenter IP ranges
  outright regardless of fingerprint — confirmed by logs showing 100% 403s
  from Vercel even with browser-fingerprint spoofing. So these requests route
  through ScraperAPI (`SCRAPERAPI_KEY`, their API-endpoint integration — proxy
  mode is gated to paid plans, the API endpoint works on the free trial),
  which handles both problems. Without a `SCRAPERAPI_KEY` configured, it falls
  back to plain [`got-scraping`](https://github.com/apify/got-scraping)
  (fingerprint spoofing only), which works ~20-30% of the time locally and
  effectively never from Vercel.
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

This repo is already linked to a Vercel project (`matchday-diary/matchday-notes`,
connected to `BubbaSantos/matchday-notes` on GitHub) and live at
https://matchday-notes.vercel.app — every push to `master` auto-deploys.

For a from-scratch setup elsewhere:
1. Push the repo to GitHub.
2. In Vercel, "Add New Project" → import the repo. It auto-detects Vite; no
   build config changes needed.
3. Add environment variables (Project Settings → Environment Variables):
   `OPENAI_API_KEY` and `SCRAPERAPI_KEY`.
4. Deploy.
5. On your iPhone, open the deployed URL in Safari → Share → Add to Home
   Screen.

The free Hobby plan comfortably covers personal use (100 deploys/day, 1M
function invocations/month). ScraperAPI's free trial covers 1,000
requests/month, which comfortably covers personal use too, but is time-limited
— check its dashboard before the trial period ends.

## Known limitations

- The cup ICS files under `data/` are a point-in-time snapshot, not live —
  they're refreshed by re-syncing from the source and committing.
- Sofascore-backed features (match events, lineups, historical fixtures) can
  occasionally come back empty on a given request if all retries in `ssFetch`
  fail — this self-heals on the next request/refresh.
- Voice note audio and transcripts are stored per-browser (IndexedDB) — they
  don't sync across devices. If you use the app on both desktop and iPhone,
  each keeps its own notes.
