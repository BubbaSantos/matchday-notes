import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'

interface YearMeta {
  year: number
  count: number
  withReport: number
  competitions: string[]
}

interface HistoricalMatch {
  year: number
  date: string | null
  competition: string
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  reportUrl: string | null
  pictureUrl: string | null
  tableNote: string | null
  slug: string
  report: { sections: Record<string, string>; images: string[] } | null
  pictures: string[]
}

function resultLabel(match: HistoricalMatch): { label: string; color: string; bg: string } {
  const celtic = match.home === 'Celtic' ? match.homeScore : match.awayScore
  const opp   = match.home === 'Celtic' ? match.awayScore : match.homeScore
  if (celtic == null || opp == null) return { label: '', color: 'var(--color-ink-faint)', bg: 'transparent' }
  if (celtic > opp) return { label: 'W', color: 'var(--color-win)', bg: 'var(--color-win-bg)' }
  if (celtic === opp) return { label: 'D', color: 'var(--color-draw)', bg: 'var(--color-draw-bg)' }
  return { label: 'L', color: 'var(--color-loss)', bg: 'var(--color-loss-bg)' }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function opponent(match: HistoricalMatch) {
  return match.home === 'Celtic' ? match.away : match.home
}

function scoreDisplay(match: HistoricalMatch) {
  if (match.homeScore == null || match.awayScore == null) return '–'
  const base = `${match.homeScore}–${match.awayScore}`
  const note = match.tableNote ?? ''
  const hasPens = /pen(?:alties|alty|s|\.)?|shoot[-\s]?out|kicks/i.test(note)
  const hasAet  = /(?:after\s+ET|AET|after\s+extra\s+time|@\s*120)/i.test(note)
  if (hasPens) return `${base} (pens)`
  if (hasAet)  return `${base} (aet)`
  return base
}

// ── Year grid ─────────────────────────────────────────────────────────────────

function YearGrid({ index }: { index: YearMeta[] }) {
  // Group into decades
  const byDecade: Record<number, YearMeta[]> = {}
  for (const y of index) {
    const decade = Math.floor(y.year / 10) * 10
    if (!byDecade[decade]) byDecade[decade] = []
    byDecade[decade].push(y)
  }

  return (
    <div className="space-y-6">
      {Object.entries(byDecade)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([decade, years]) => (
          <div key={decade}>
            <div
              className="mb-2"
              style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}
            >
              {decade}s
            </div>
            <div className="flex flex-wrap gap-2">
              {years.sort((a, b) => b.year - a.year).map((y) => (
                <Link
                  key={y.year}
                  to={`/history/${y.year}`}
                  className="no-underline rounded border px-3 py-1.5 text-sm transition-colors"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-ink)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-hover)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{y.year}</span>
                  <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem', marginLeft: 4 }}>{y.count}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

// ── Match list for a year ────────────────────────────────────────────────────

function YearMatchList({ matches }: { year: number; matches: HistoricalMatch[] }) {
  const navigate = useNavigate()

  // Group by month
  const byMonth: Record<number, HistoricalMatch[]> = {}
  for (const m of matches) {
    const month = m.date ? new Date(m.date).getMonth() : 12
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(m)
  }

  const monthName = (n: number) =>
    n === 12 ? 'Unknown date' :
    new Date(2000, n, 1).toLocaleDateString('en-GB', { month: 'long' })

  return (
    <div className="space-y-6">
      {Object.entries(byMonth)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([monthIdx, ms]) => (
          <div key={monthIdx}>
            <div
              className="mb-2"
              style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}
            >
              {monthName(Number(monthIdx))}
            </div>
            <div className="space-y-1">
              {ms.map((match) => {
                const { label, color, bg } = resultLabel(match)
                const opp = opponent(match)
                const venue = match.home === 'Celtic' ? 'H' : 'A'

                return (
                  <button
                    key={match.slug}
                    onClick={() => navigate(`/history/match/${encodeURIComponent(match.slug)}`)}
                    className="w-full border rounded-lg px-3 py-2.5 text-left cursor-pointer transition-colors flex items-center gap-3"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-hover)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)'
                    }}
                  >
                    {/* Date */}
                    <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem', width: 36, flexShrink: 0 }}>
                      {formatDate(match.date)}
                    </span>

                    {/* Result badge */}
                    <span
                      className="font-mono font-bold rounded text-center"
                      style={{ color, backgroundColor: bg, fontSize: '0.65rem', width: 16, flexShrink: 0, padding: '1px 0' }}
                    >
                      {label}
                    </span>

                    {/* Score */}
                    <span
                      className="font-mono font-bold tabular-nums"
                      style={{ color: 'var(--color-ink)', fontSize: '0.85rem', width: 28, flexShrink: 0 }}
                    >
                      {scoreDisplay(match)}
                    </span>

                    {/* Venue */}
                    <span
                      style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem', width: 10, flexShrink: 0 }}
                    >
                      {venue}
                    </span>

                    {/* Opponent */}
                    <span style={{ color: 'var(--color-ink)', fontSize: '0.875rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opp}
                    </span>

                    {/* Competition */}
                    <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem', flexShrink: 0, maxWidth: 100, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {match.competition}
                    </span>

                    {/* Report indicator */}
                    {match.report && (
                      <span style={{ color: 'var(--color-accent)', fontSize: '0.6rem', flexShrink: 0 }}>●</span>
                    )}

                    <ChevronRight size={12} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function History() {
  const { year } = useParams<{ year?: string }>()
  const navigate = useNavigate()

  const [index, setIndex] = useState<YearMeta[] | null>(null)
  const [matches, setMatches] = useState<HistoricalMatch[] | null>(null)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load index on mount
  useEffect(() => {
    fetch('/history/index.json')
      .then(r => r.json())
      .then(data => { setIndex(data); setLoadingIndex(false) })
      .catch(() => { setError('Could not load history index'); setLoadingIndex(false) })
  }, [])

  // Load year data when year param changes (filter out deleted matches)
  useEffect(() => {
    if (!year) { setMatches(null); return }
    setLoadingMatches(true)
    setMatches(null)
    Promise.all([
      fetch(`/history/${year}.json`).then(r => { if (!r.ok) throw new Error('Not found'); return r.json() }),
      fetch('/api/notes?kind=deleted-slugs').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([data, deleted]: [HistoricalMatch[], string[]]) => {
      const deletedSet = new Set(deleted)
      setMatches(data.filter((m: HistoricalMatch) => !deletedSet.has(m.slug.replace(/^\//, ''))))
      setLoadingMatches(false)
    }).catch(() => { setError(`No data for ${year}`); setLoadingMatches(false) })
  }, [year])

  const yearNum = year ? parseInt(year) : null
  const yearMeta = yearNum ? index?.find(y => y.year === yearNum) : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back nav */}
      {year ? (
        <button
          onClick={() => navigate('/history')}
          className="inline-flex items-center gap-1.5 border-none cursor-pointer p-0 mb-6"
          style={{ background: 'none', color: 'var(--color-ink-muted)', fontSize: '0.875rem', fontFamily: 'inherit' }}
        >
          <ArrowLeft size={13} />
          All years
        </button>
      ) : null}

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-journal m-0 leading-tight" style={{ color: 'var(--color-ink)', fontSize: '1.5rem' }}>
          {year ? `${year}` : 'Match History'}
        </h1>
        {!year && (
          <p className="m-0 mt-1" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
            Celtic FC · 1960 – present
          </p>
        )}
        {yearMeta && (
          <p className="m-0 mt-1" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
            {yearMeta.count} matches
            {yearMeta.withReport > 0 && ` · ${yearMeta.withReport} with reports`}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: 'var(--color-loss)', fontSize: '0.875rem' }}>{error}</p>
      )}

      {/* Loading */}
      {(loadingIndex || loadingMatches) && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
          ))}
        </div>
      )}

      {/* Year grid */}
      {!year && !loadingIndex && index && <YearGrid index={index} />}

      {/* Match list */}
      {year && !loadingMatches && matches && (
        <YearMatchList year={parseInt(year)} matches={matches} />
      )}
    </div>
  )
}
