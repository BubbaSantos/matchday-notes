# Celtic FC Match Archive

A personal match archive for Celtic — a timeline for every match across all
competitions, with editable notes, voice notes (recorded in-browser and
auto-transcribed), and full-text search across everything you've written.
Notes can optionally sync across devices via a lightweight username +
passcode login.

## Local development

```bash
npm install
cp .env.example .env   # see .env.example for what each var is for
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
- **League standing widget + injury list**: Sportmonks free plan
  (`server/sportmonks.ts`), server-side only — `SPORTMONKS_TOKEN` never
  reaches the client, unlike an earlier version of this integration that
  read a `VITE_`-prefixed token client-side (and was broken in production
  the whole time — no token was ever configured, and there was no serverless
  function backing `/api/sportmonks` either). Injuries are filtered to
  `category === 'injury' && !completed`, since the free plan's "sidelined"
  data includes stale entries (e.g. a multi-year-old suspension still marked
  incomplete).
- **Full expandable league table**: computed independently from ESPN's
  Premiership results (`server/table.ts`) — this is the "Before match" /
  "After match" table shown on a fixture's own page, not the standing widget.
- **Voice note transcription**: `server/transcribe.ts` proxies recorded audio
  to OpenAI's Whisper API. Requires `OPENAI_API_KEY`.
- **Notes & voice notes storage**: two modes, matching whether you're logged
  in.
  - Logged out: entirely client-side, in IndexedDB (`src/lib/notesDb.ts`) —
    nothing leaves the browser.
  - Logged in: synced via a Redis-backed account (`server/notesStore.ts`,
    `server/auth.ts`) — username + passcode accounts (scrypt-hashed,
    stateless HMAC-signed session cookies, no third-party auth provider).
    Voice note audio is stored as base64 directly in the note record (fine
    at personal scale; would want real blob storage at any real scale).
    First login offers a one-time import of any notes already sitting in
    that browser's IndexedDB (merges, doesn't overwrite).

  Both modes are keyed by a stable match key (date + competition +
  opponent) rather than the fixture's `id`, since `id` is derived from array
  position and can shift if upstream fixture data changes.

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
   `OPENAI_API_KEY`, `SCRAPERAPI_KEY`, `SPORTMONKS_TOKEN`, and `SESSION_SECRET`.
   Then install Vercel's free "Upstash for Redis" marketplace integration
   (Storage tab, or `vercel install upstash/upstash-kv`) and connect it to
   the project — this auto-provisions `KV_REST_API_URL`/`KV_REST_API_TOKEN`.
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
- If you don't log in, notes stay per-browser (IndexedDB) — using the app on
  both desktop and iPhone without logging in means each keeps its own notes.
- Accounts are username + passcode only, no email/recovery — losing the
  passcode means losing access to that account's synced notes (local
  IndexedDB notes on a given device are unaffected either way).
