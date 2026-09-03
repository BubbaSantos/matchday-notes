/**
 * Scraper for https://www.thecelticwiki.com/celtic-games/year-by-year/
 *
 * Flags:
 *   --from 1960        start year (default 1960)
 *   --to   2025        end year   (default current year)
 *   --no-report        skip fetching individual match report pages
 *   --report-only      re-fetch reports for matches already scraped (no score scraping)
 *   --test             just 2002
 *   --fresh            ignore progress file and restart
 */

import { parse } from 'node-html-parser'
import { gotScraping } from 'got-scraping'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const param = (f, def) => {
  const i = args.indexOf(f)
  return i !== -1 ? args[i + 1] : def
}

const NOW = new Date().getFullYear()
const FROM_YEAR = parseInt(param('--from', '1960'))
const TO_YEAR   = parseInt(param('--to',   String(NOW)))
const NO_REPORT   = flag('--no-report')
const REPORT_ONLY = flag('--report-only')
const TEST_MODE   = flag('--test')
const FRESH       = flag('--fresh')

const PROGRESS_FILE = 'scripts/cw-progress.json'
const OUTPUT_FILE   = 'scripts/cw-celtic.json'

const BASE = 'https://www.thecelticwiki.com'

// ── State ────────────────────────────────────────────────────────────────────

let progress = (!FRESH && existsSync(PROGRESS_FILE))
  ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
  : { done: {}, reportsDone: {} }

let results = (!FRESH && existsSync(OUTPUT_FILE))
  ? JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'))
  : []

function save() {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
  writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2))
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
}

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await gotScraping(url, {
        headers: HEADERS,
        timeout: { request: 30_000 },
        followRedirect: true,
      })
      if (resp.statusCode >= 400) throw new Error(`HTTP ${resp.statusCode}`)
      return resp.body
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
}

// ── Parsers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = {
  JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6,
  JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12,
}

function parseYearPage(html, year) {
  const root = parse(html)

  // Find the match table — it's the one whose header row contains "Competition"
  const tables = root.querySelectorAll('table')
  const table = tables.find(t => t.text.includes('Competition')) ?? null
  if (!table) return []

  const rows = table.querySelectorAll('tr')
  const matches = []
  let currentMonth = null

  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    if (!cells.length) continue

    // Month header row — first cell is a month name, all others are empty
    const firstText = cells[0].text.trim().toUpperCase().slice(0, 3)
    const restEmpty = [...cells].slice(1).every(c => !c.text.trim())
    if (MONTH_NAMES[firstText] && restEmpty) {
      currentMonth = MONTH_NAMES[firstText]
      continue
    }

    // Skip the column header row and any rows with too few cells to be matches
    if (firstText === 'DAT') continue
    if (cells.length < 6) continue

    // Match row — should have 7-9 cells
    const day        = cells[0].text.trim().replace(/\D/g, '')
    const comp       = cells[1].text.trim()
    const homeTeam   = cells[2].text.trim()
    const score1     = cells[3].text.trim()
    const score2     = cells[4].text.trim()
    const awayTeam   = cells[5].text.trim()
    const reportLink = cells[6]?.querySelector('a')?.getAttribute('href') ?? null
    const picLink    = cells[7]?.querySelector('a')?.getAttribute('href') ?? null
    const noteText   = cells[8]?.text.trim() ?? ''

    if (!homeTeam || !awayTeam) continue

    // Build ISO date — day may be empty for postponed/unlisted
    let date = null
    if (currentMonth && day) {
      const d = parseInt(day)
      const m = String(currentMonth).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      date = `${year}-${m}-${dd}`
    }

    const homeScore = score1 === '' ? null : parseInt(score1)
    const awayScore = score2 === '' ? null : parseInt(score2)

    const reportUrl  = reportLink ? (reportLink.startsWith('http') ? reportLink : BASE + reportLink) : null
    const pictureUrl = picLink    ? (picLink.startsWith('http')    ? picLink    : BASE + picLink)    : null

    // Slug for deduplication
    const slug = reportUrl ? reportUrl.replace(BASE, '') : `${date}-${homeTeam}-${awayTeam}`.toLowerCase().replace(/\s+/g, '-')

    matches.push({
      year,
      date,
      competition: comp,
      home: homeTeam,
      away: awayTeam,
      homeScore,
      awayScore,
      reportUrl,
      pictureUrl,
      tableNote: noteText || null,
      slug,
      report: null,
      pictures: [],
    })
  }

  return matches
}

function parseReportPage(html) {
  const root = parse(html)

  const article = root.querySelector('.entry-content')
  if (!article) return null

  // Walk top-level elements, group by h3 headings
  const sections = {}
  let currentKey = null

  // querySelectorAll gives depth-first — use direct children instead
  const children = article.childNodes

  for (const child of children) {
    const tag = child.rawTagName?.toLowerCase()

    if (tag === 'h2' || tag === 'h3') {
      currentKey = child.text.trim().toLowerCase().replace(/\s+/g, '_')
      sections[currentKey] = sections[currentKey] ?? []
      continue
    }

    // Separator tables (single empty cell) — skip
    if (tag === 'table') {
      const t = child.text.trim()
      if (!t) continue
      // Navigation/meta tables at top — skip if they contain "Match Pictures"
      if (t.includes('Match Pictures')) continue
      if (currentKey) (sections[currentKey] ??= []).push(t)
      continue
    }

    const text = child.text?.trim()
    if (!text) continue

    if (currentKey) {
      (sections[currentKey] ??= []).push(text)
    }
  }

  // Flatten
  const cleaned = {}
  for (const [key, lines] of Object.entries(sections)) {
    const text = lines.join('\n').trim()
    if (text) cleaned[key] = text
  }

  const images = article.querySelectorAll('img')
    .map(img => img.getAttribute('src'))
    .filter(src => src?.startsWith('http') && !src.includes('logo') && !src.includes('icon'))

  return { sections: cleaned, images }
}

function parsePicturePage(html) {
  const root = parse(html)
  const article = root.querySelector('article, .entry-content, .post-content, main')
  if (!article) return []

  return article.querySelectorAll('img')
    .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
    .filter(src => src && src.startsWith('http') && !src.includes('logo'))
}

// ── Main ─────────────────────────────────────────────────────────────────────

const years = TEST_MODE
  ? [2002]
  : Array.from({ length: TO_YEAR - FROM_YEAR + 1 }, (_, i) => FROM_YEAR + i)

console.log(`Scraping thecelticwiki.com — ${years[0]} to ${years[years.length - 1]}`)
if (NO_REPORT) console.log('(skipping report pages)')
if (REPORT_ONLY) console.log('(report-only mode)')
console.log()

for (const year of years) {
  const url = `${BASE}/${year}-2/`

  if (!REPORT_ONLY) {
    if (progress.done[year]) {
      console.log(`▶ ${year}  (cached)`)
      continue
    }

    process.stdout.write(`▶ ${year}  `)

    let html
    try {
      html = await fetchHtml(url)
    } catch (err) {
      console.log(`✗ fetch failed: ${err.message}`)
      continue
    }

    const matches = parseYearPage(html, year)
    console.log(`${matches.length} matches`)

    if (matches.length) {
      // Remove any existing entries for this year before adding fresh ones
      results = results.filter(r => r.year !== year)
      results.push(...matches)
      progress.done[year] = true
      save()
    }
  }

  // Fetch report pages
  if (NO_REPORT) continue

  const yearMatches = results.filter(r => r.year === year && r.reportUrl && !r.report)
  if (!yearMatches.length) continue

  for (const match of yearMatches) {
    if (progress.reportsDone[match.slug]) continue

    process.stdout.write(`  ↳ report ${match.date} ${match.home} v ${match.away} … `)

    try {
      const rHtml = await fetchHtml(match.reportUrl)
      match.report = parseReportPage(rHtml)

      // Also fetch pictures page if available
      if (match.pictureUrl) {
        const pHtml = await fetchHtml(match.pictureUrl)
        match.pictures = parsePicturePage(pHtml)
      }

      progress.reportsDone[match.slug] = true
      console.log('✓')
    } catch (err) {
      console.log(`✗ ${err.message}`)
    }

    // Polite delay
    await new Promise(r => setTimeout(r, 800))
  }

  save()
}

// Final tally
const total = results.length
const withReport = results.filter(r => r.report).length
const withPics   = results.filter(r => r.pictures?.length).length

console.log()
console.log(`✅ Done — ${total} matches, ${withReport} with reports, ${withPics} with pictures`)
console.log(`   Saved to ${OUTPUT_FILE}`)
