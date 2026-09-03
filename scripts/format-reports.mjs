/**
 * Runs all match report sections through Claude Haiku to apply markdown
 * formatting and fix spelling/grammar. Saves progress so it can be resumed.
 *
 * Usage: node scripts/format-reports.mjs [--from YYYY] [--to YYYY] [--reset]
 *
 * Output: updates scripts/cw-celtic.json in place.
 * After completion, run: node scripts/build-history.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'

const args = process.argv.slice(2)
const FROM_YEAR = parseInt(args[args.indexOf('--from') + 1] ?? '1889')
const TO_YEAR   = parseInt(args[args.indexOf('--to')   + 1] ?? '2026')
const RESET     = args.includes('--reset')

const DATA_FILE     = 'scripts/cw-celtic.json'
const PROGRESS_FILE = 'scripts/format-progress.json'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── State ─────────────────────────────────────────────────────────────────────

let matches = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
let progress
try {
  progress = RESET ? { done: {} } : JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
} catch {
  progress = { done: {} }
}

function save() {
  writeFileSync(DATA_FILE, JSON.stringify(matches))
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
}

// ── Format one section of text ────────────────────────────────────────────────

const CHUNK_SIZE = 4000  // chars per API call

const SYSTEM_PROMPT = `You are editing match reports for Celtic FC written by fans on a wiki.
Format the text using markdown and fix spelling/grammar, following these rules:

- Fix spelling mistakes and grammatical errors
- Add paragraph breaks where new thoughts begin (use blank lines between paragraphs)
- Use **bold** for player names when they score or make a key action
- Keep ALL factual content — do not add, remove, or change any facts, scores, or names
- Do not add headings or bullet lists unless the original already uses them
- Keep the tone and voice of the original author
- Return ONLY the formatted text, nothing else`

async function formatChunk(text) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : text
}

async function formatSection(text) {
  if (!text || text.length < 100) return text  // too short to bother

  // Split long sections into chunks at paragraph/sentence boundaries
  if (text.length <= CHUNK_SIZE) {
    return formatChunk(text)
  }

  // Chunk at paragraph boundaries (double newline), falling back to single newline
  const chunks = []
  let remaining = text
  while (remaining.length > CHUNK_SIZE) {
    // Find a good break point
    let breakAt = remaining.lastIndexOf('\n\n', CHUNK_SIZE)
    if (breakAt < CHUNK_SIZE * 0.5) breakAt = remaining.lastIndexOf('\n', CHUNK_SIZE)
    if (breakAt < CHUNK_SIZE * 0.5) breakAt = remaining.lastIndexOf('. ', CHUNK_SIZE)
    if (breakAt < 0) breakAt = CHUNK_SIZE
    chunks.push(remaining.slice(0, breakAt + 1))
    remaining = remaining.slice(breakAt + 1).trim()
  }
  if (remaining) chunks.push(remaining)

  const formatted = []
  for (const chunk of chunks) {
    formatted.push(await formatChunk(chunk))
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 300))
  }
  return formatted.join('\n\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Sections worth formatting (skip 'teams' which is structured data)
const FORMAT_KEYS = ['review', 'trivia', 'intro']

const toProcess = matches.filter(m =>
  m.report?.sections &&
  Object.keys(m.report.sections).length > 0 &&
  m.year >= FROM_YEAR &&
  m.year <= TO_YEAR &&
  !progress.done[m.slug]
)

console.log(`Formatting ${toProcess.length} reports (${FROM_YEAR}–${TO_YEAR})`)
console.log(`Model: claude-haiku-4-5 · Skipping sections > ${CHUNK_SIZE} chars will be chunked\n`)

let done = 0, skipped = 0, failed = 0

for (const match of toProcess) {
  const sections = match.report.sections
  const label = `${match.date ?? match.year} ${match.home} v ${match.away}`

  // Check if any section is worth formatting
  const keys = Object.keys(sections).filter(k =>
    FORMAT_KEYS.includes(k) && sections[k] && sections[k].length >= 100
  )
  if (!keys.length) {
    progress.done[match.slug] = 'skip'
    skipped++
    continue
  }

  process.stdout.write(`  ${label} … `)

  try {
    for (const key of keys) {
      sections[key] = await formatSection(sections[key])
      // Small delay between sections of the same match
      if (keys.indexOf(key) < keys.length - 1) await new Promise(r => setTimeout(r, 200))
    }
    progress.done[match.slug] = true
    done++
    console.log('✓')
    save()
  } catch (err) {
    console.log(`✗ ${err.message}`)
    failed++
  }

  // Rate limit: ~0.5s between matches
  await new Promise(r => setTimeout(r, 500))
}

console.log(`\n✅ Done — ${done} formatted, ${skipped} skipped (too short), ${failed} failed`)
console.log('Run: node scripts/build-history.mjs')
