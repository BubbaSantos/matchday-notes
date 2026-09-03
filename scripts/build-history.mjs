/**
 * Splits cw-celtic.json into static per-year files for the app.
 * Run after scraping: node scripts/build-history.mjs
 *
 * Outputs:
 *   public/history/index.json         — year list with counts
 *   public/history/{year}.json        — full match data per year
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const INPUT  = 'scripts/cw-celtic.json'
const OUTDIR = 'public/history'

const raw = JSON.parse(readFileSync(INPUT, 'utf8'))

// Group by year
const byYear = {}
for (const match of raw) {
  const y = match.year
  if (!byYear[y]) byYear[y] = []
  byYear[y].push(match)
}

mkdirSync(OUTDIR, { recursive: true })

// Build index
const index = Object.entries(byYear)
  .sort(([a], [b]) => Number(b) - Number(a)) // newest first
  .map(([year, matches]) => {
    const comps = [...new Set(matches.map(m => m.competition))].filter(Boolean)
    const withReport = matches.filter(m => m.report?.sections).length
    return {
      year: Number(year),
      count: matches.length,
      withReport,
      competitions: comps,
    }
  })

writeFileSync(`${OUTDIR}/index.json`, JSON.stringify(index))
console.log(`✓ index.json — ${index.length} years`)

// Write per-year files
for (const [year, matches] of Object.entries(byYear)) {
  writeFileSync(`${OUTDIR}/${year}.json`, JSON.stringify(matches))
  const withReport = matches.filter(m => m.report?.sections).length
  console.log(`  ${year}: ${matches.length} matches, ${withReport} reports`)
}

// Build flat search index (lightweight — no report text)
const searchIndex = raw.map(m => ({
  date: m.date,
  slug: m.slug,
  home: m.home,
  away: m.away,
  homeScore: m.homeScore,
  awayScore: m.awayScore,
  competition: m.competition,
  hasReport: !!(m.report?.sections),
}))
writeFileSync(`${OUTDIR}/search-index.json`, JSON.stringify(searchIndex))
console.log(`✓ search-index.json — ${searchIndex.length} matches`)

console.log(`\n✅ Done — ${raw.length} total matches`)
