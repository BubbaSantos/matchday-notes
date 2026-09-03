/**
 * Supplements cw-celtic.json with matches from thecelticwiki.com sitemap
 * that weren't linked from the year-by-year index pages (mainly Aug-Dec of
 * each year, plus pre-1960 matches).
 *
 * Run: node scripts/scrape-from-sitemap.mjs
 * Flags:
 *   --from YYYY   only process dates >= YYYY (default: 1889)
 *   --to YYYY     only process dates <= YYYY (default: 2026)
 *   --dry-run     print what would be fetched without fetching
 */

import { readFileSync, writeFileSync } from 'fs'
import { gotScraping } from 'got-scraping'
import { parse } from 'node-html-parser'

const args = process.argv.slice(2)
const FROM_YEAR = parseInt(args[args.indexOf('--from') + 1] ?? '1889')
const TO_YEAR   = parseInt(args[args.indexOf('--to')   + 1] ?? '2026')
const DRY_RUN   = args.includes('--dry-run')

const DATA_FILE     = 'scripts/cw-celtic.json'
const PROGRESS_FILE = 'scripts/cw-sitemap-progress.json'
const BASE          = 'https://www.thecelticwiki.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
}

// ── Load state ────────────────────────────────────────────────────────────────

let results = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
let progress
try { progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) } catch { progress = { done: {} } }

function save() {
  writeFileSync(DATA_FILE, JSON.stringify(results))
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await gotScraping(url, { headers: HEADERS, timeout: { request: 30_000 }, followRedirect: true })
      if (resp.statusCode === 404) return null   // page doesn't exist
      if (resp.statusCode >= 400) throw new Error(`HTTP ${resp.statusCode}`)
      if (resp.body.includes('Attention Required! | Cloudflare')) throw new Error('Cloudflare block')
      return resp.body
    } catch (err) {
      if (err.message === 'Cloudflare block' && i < retries - 1) {
        await new Promise(r => setTimeout(r, 5000 * (i + 1)))
        continue
      }
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
}

// ── Parse match page ──────────────────────────────────────────────────────────

function parseMatchPage(html, url) {
  const root = parse(html)

  // Title format: "YYYY-MM-DD: Home N-N Away, Competition – The Celtic Wiki"
  const titleEl = root.querySelector('h1.entry-title') ?? root.querySelector('h1')
  const rawTitle = titleEl?.text?.trim() ?? ''

  // Extract date from URL (reliable)
  const dateMatch = url.match(/\/(\d{4}-\d{2}-\d{2})-/)
  const date = dateMatch?.[1] ?? null
  const year = date ? parseInt(date.slice(0, 4)) : null

  // Parse title: "2012-08-01: Celtic 2-1 HJK Helskinki, Champions League"
  // Strip "YYYY-MM-DD: " prefix
  const titleBody = rawTitle.replace(/^\d{4}-\d{2}-\d{2}[:\s-]+/, '').trim()

  // Split off competition (after last comma)
  const lastComma = titleBody.lastIndexOf(',')
  const matchPart = lastComma >= 0 ? titleBody.slice(0, lastComma).trim() : titleBody
  const competition = lastComma >= 0 ? titleBody.slice(lastComma + 1).trim() : ''

  // Parse "Home N-N Away" — score is two digits separated by a dash
  // Use a greedy approach: find all "digits-digits" patterns and take the one that splits sensibly
  let home = '', away = '', homeScore = null, awayScore = null
  const scoreMatch = matchPart.match(/^(.*?)\s+(\d+)\s*[–\-]\s*(\d+)\s+(.+)$/)
  if (scoreMatch) {
    home      = scoreMatch[1].trim()
    homeScore = parseInt(scoreMatch[2])
    awayScore = parseInt(scoreMatch[3])
    away      = scoreMatch[4].trim()
  } else {
    // Fallback: just use the whole string as home
    home = matchPart
  }

  // Get slug from URL
  const slug = url.replace(BASE, '').replace(/\/$/, '')

  // Get report content
  const article = root.querySelector('.entry-content')
  let report = null
  if (article) {
    const sections = {}
    let currentKey = null
    for (const child of article.childNodes) {
      const tag = child.rawTagName?.toLowerCase()
      if (tag === 'h2' || tag === 'h3') {
        currentKey = child.text.trim().toLowerCase().replace(/\s+/g, '_')
        sections[currentKey] = sections[currentKey] ?? []
        continue
      }
      if (tag === 'table') {
        const t = child.text.trim()
        if (!t || t.includes('Match Pictures')) continue
        if (currentKey) (sections[currentKey] ??= []).push(t)
        continue
      }
      if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'blockquote') {
        const text = child.text.trim()
        if (text && currentKey) (sections[currentKey] ??= []).push(text)
        else if (text && !currentKey) {
          sections['intro'] = sections['intro'] ?? []
          sections['intro'].push(text)
        }
      }
    }
    // Collapse arrays to strings
    const collapsed = {}
    for (const [k, v] of Object.entries(sections)) {
      const joined = (Array.isArray(v) ? v : [v]).join('\n').trim()
      if (joined) collapsed[k] = joined
    }
    if (Object.keys(collapsed).length) report = { sections: collapsed, images: [] }
  }

  // Pictures URL
  const pictureUrl = url.replace(/\/$/, '') + '-pictures/'

  return { date, year, slug, home, away, homeScore, awayScore, competition, reportUrl: url, pictureUrl, report, pictures: [], tableNote: null }
}

function parsePicturePage(html) {
  const root = parse(html)
  const article = root.querySelector('.entry-content')
  if (!article) return []
  return article.querySelectorAll('img')
    .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
    .filter(src => src && src.startsWith('http') && !src.includes('logo'))
}

// ── Get all sitemap URLs ──────────────────────────────────────────────────────

console.log('Fetching sitemaps…')
let sitemapUrls = []
for (let i = 1; i <= 10; i++) {
  try {
    const resp = await gotScraping(`${BASE}/wp-sitemap-posts-page-${i}.xml`, { headers: HEADERS, timeout: { request: 15000 } })
    const urls = (resp.body.match(/https:\/\/www\.thecelticwiki\.com\/[^<\s]+/g) || [])
      .filter(u => /\/\d{4}-\d{2}-\d{2}-/.test(u) && !u.includes('-pictures/'))
    sitemapUrls.push(...urls)
  } catch { /* sitemap page missing */ }
}
console.log(`Found ${sitemapUrls.length} match URLs in sitemap`)

// ── Filter to missing matches ─────────────────────────────────────────────────

const existingSlugs = new Set(results.map(m => m.slug))
const toFetch = sitemapUrls
  .map(u => u.replace(/\/$/, ''))
  .filter(u => {
    const slug = u.replace(BASE, '')
    if (existingSlugs.has(slug)) return false
    const year = parseInt(slug.slice(1, 5))
    return year >= FROM_YEAR && year <= TO_YEAR
  })

console.log(`${toFetch.length} matches to fetch (${FROM_YEAR}–${TO_YEAR})\n`)
if (DRY_RUN) { toFetch.forEach(u => console.log(u)); process.exit(0) }

// ── Fetch and add ─────────────────────────────────────────────────────────────

let added = 0, failed = 0

for (const url of toFetch) {
  const slug = url.replace(BASE, '')
  if (progress.done[slug]) continue

  process.stdout.write(`  ${slug.slice(1, 11)} … `)

  try {
    const html = await fetchHtml(url)
    if (!html) {
      console.log('404 skip')
      progress.done[slug] = 'skip'
      save()
      continue
    }

    const match = parseMatchPage(html, url)

    // Fetch pictures page
    try {
      const pHtml = await fetchHtml(match.pictureUrl)
      if (pHtml) match.pictures = parsePicturePage(pHtml)
    } catch { /* no pictures */ }

    results.push(match)
    existingSlugs.add(slug)
    progress.done[slug] = true
    added++
    console.log(`✓  ${match.home} ${match.homeScore ?? '?'}-${match.awayScore ?? '?'} ${match.away}`)
    save()
  } catch (err) {
    console.log(`✗ ${err.message}`)
    failed++
  }

  await new Promise(r => setTimeout(r, 900))
}

console.log(`\n✅ Done — added ${added} matches, ${failed} failed`)
console.log(`Total matches: ${results.length}`)
