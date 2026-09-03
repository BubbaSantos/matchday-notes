import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, Sparkles, Loader2, Clock, X } from 'lucide-react'
import { useFixtures } from '../hooks/useFixtures'
import { CompetitionBadge } from '../components/CompetitionBadge'
import type { MatchEntry, Competition } from '../types'
import type { PlayerStats } from '../../server/aiSearch'

// ── Search history ──────────────────────────────────────────────────────────

const HISTORY_KEY = 'cd-search-history'
const MAX_HISTORY = 8

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(q: string) {
  const h = loadHistory().filter((x) => x.toLowerCase() !== q.toLowerCase())
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...h].slice(0, MAX_HISTORY)))
}
function removeHistory(q: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadHistory().filter((x) => x !== q)))
}

// ── Keyword filter ───────────────────────────────────────────────────────────

function keywordFilter(fixtures: MatchEntry[], query: string): MatchEntry[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return fixtures
    .filter((f) => {
      if (f.phase !== 'post') return false
      return (
        f.opponent.toLowerCase().includes(q) ||
        f.competition.toLowerCase().includes(q) ||
        (f.round?.toLowerCase().includes(q) ?? false) ||
        f.notes?.toLowerCase().includes(q) ||
        f.voiceNotes?.some((vn) => vn.transcript.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ResultScore({ match }: { match: MatchEntry }) {
  const pens = match.penalties
  const win = pens ? pens.celtic > pens.opponent : match.celticScore! > match.opponentScore!
  const draw = !pens && match.celticScore === match.opponentScore
  const color = win ? 'var(--color-win)' : draw ? 'var(--color-draw)' : 'var(--color-loss)'
  const homeScore = match.venue === 'A' ? match.opponentScore : match.celticScore
  const awayScore = match.venue === 'A' ? match.celticScore : match.opponentScore
  const homePens = pens && (match.venue === 'A' ? pens.opponent : pens.celtic)
  const awayPens = pens && (match.venue === 'A' ? pens.celtic : pens.opponent)
  return (
    <span className="text-right flex-shrink-0">
      <span className="text-base font-bold font-mono tabular-nums" style={{ color }}>
        {homeScore}–{awayScore}
      </span>
      {pens && (
        <span className="block font-mono tabular-nums" style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem' }}>
          ({homePens}–{awayPens} pens)
        </span>
      )}
    </span>
  )
}

function MatchCard({ match, subtitle }: { match: MatchEntry; subtitle?: string }) {
  return (
    <Link to={`/match/${match.id}`} className="block no-underline mb-3">
      <div
        className="rounded-lg border p-4 transition-colors"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-ink-muted)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <CompetitionBadge competition={match.competition} />
          <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>
            {new Date(match.kickoff).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="font-journal" style={{ color: 'var(--color-ink)', fontSize: '0.975rem' }}>
            {match.venue === 'A' ? <>{match.opponent} vs Celtic</> : <>Celtic vs {match.opponent}</>}
          </div>
          {match.celticScore !== undefined && match.opponentScore !== undefined && (
            <ResultScore match={match} />
          )}
        </div>
        {subtitle && (
          <p className="m-0 mt-1" style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            {subtitle}
          </p>
        )}
      </div>
    </Link>
  )
}

function PlayerStatsCard({ stats }: { stats: PlayerStats }) {
  const comps = Object.entries(stats.byCompetition).sort((a, b) => b[1].apps - a[1].apps)
  const shortComp: Record<string, string> = {
    'Scottish Premiership': 'Premiership',
    'Scottish Cup': 'Scottish Cup',
    'League Cup': 'League Cup',
    'Europa League': 'Europa League',
    'Europa Conference League': 'Conference',
    'Champions League': 'UCL',
    'Friendly': 'Friendly',
  }
  return (
    <div
      className="rounded-lg border px-4 py-4 mb-5"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-journal" style={{ fontSize: '1.1rem', color: 'var(--color-ink)' }}>
          {stats.name}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Player summary
        </span>
      </div>
      <div className="flex gap-6 mb-4">
        {[
          { label: 'Apps', value: stats.appearances },
          { label: 'Goals', value: stats.goals },
          { label: 'Assists', value: stats.assists },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="font-mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--color-accent)', lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      {comps.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            By competition
          </div>
          <div className="flex flex-col gap-1">
            {comps.map(([comp, s]) => (
              <div key={comp} className="flex items-center justify-between">
                <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-secondary)' }}>
                  {shortComp[comp] ?? comp}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.apps} app{s.apps !== 1 ? 's' : ''}
                  {s.goals > 0 ? ` · ${s.goals}G` : ''}
                  {s.assists > 0 ? ` · ${s.assists}A` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<{ summary: string; results: Array<{ id: string; reason: string }>; playerStats?: PlayerStats } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [mode, setMode] = useState<'keyword' | 'ai'>(searchParams.get('mode') === 'ai' ? 'ai' : 'keyword')
  const [showDropdown, setShowDropdown] = useState(false)
  const [history, setHistory] = useState<string[]>(loadHistory)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { fixtures } = useFixtures()
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]))

  // Suggestions: unique opponent names + competitions
  const opponents = Array.from(new Set(fixtures.filter(f => f.phase === 'post').map(f => f.opponent))).sort()
  const competitions = Array.from(new Set(fixtures.map(f => f.competition))) as Competition[]

  const suggestions = [
    ...opponents.filter(o => query && o.toLowerCase().includes(query.toLowerCase()) && o.toLowerCase() !== query.toLowerCase()),
    ...competitions.filter(c => query && c.toLowerCase().includes(query.toLowerCase())),
  ].slice(0, 5)

  const dropdownItems = query
    ? suggestions
    : history.slice(0, 6)

  // Sync URL
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (query) next.set('q', query); else next.delete('q')
      if (mode === 'ai') next.set('mode', 'ai'); else next.delete('mode')
      return next
    }, { replace: true })
  }, [query, mode])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function runAiSearch(q: string) {
    q = q.trim()
    if (!q) return
    setMode('ai')
    setAiLoading(true)
    setAiError(null)
    setAiResponse(null)
    setShowDropdown(false)
    saveHistory(q)
    setHistory(loadHistory())

    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, fixtures }),
      })
      const data = await res.json() as typeof aiResponse & { error?: string }
      if (!res.ok) throw new Error(data?.error || 'Search failed')
      setAiResponse(data)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setAiLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') runAiSearch(query)
    if (e.key === 'Escape') setShowDropdown(false)
  }

  function handleChange(val: string) {
    setQuery(val)
    setShowDropdown(true)
    if (mode === 'ai') { setMode('keyword'); setAiResponse(null); setAiError(null) }
  }

  function selectSuggestion(item: string) {
    setQuery(item)
    setShowDropdown(false)
    setMode('keyword')
    setAiResponse(null)
  }

  const keywordResults = mode === 'keyword' ? keywordFilter(fixtures, query) : []
  const aiResults = mode === 'ai' && aiResponse
    ? aiResponse.results.map((r) => ({ match: fixtureMap.get(r.id), reason: r.reason }))
        .filter((r): r is { match: MatchEntry; reason: string } => !!r.match)
    : []

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-journal m-0 leading-tight" style={{ color: 'var(--color-ink)', fontSize: '1.75rem' }}>
          Search
        </h1>
        <p className="m-0 mt-0.5" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
          Filter by keyword or ask the AI anything.
        </p>
      </div>

      {/* Input + dropdown */}
      <div className="relative mb-1.5" ref={dropdownRef}>
        <div
          className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: query ? 'var(--color-accent)' : 'var(--color-border)',
            borderBottomLeftRadius: showDropdown && dropdownItems.length ? 0 : undefined,
            borderBottomRightRadius: showDropdown && dropdownItems.length ? 0 : undefined,
          }}
        >
          <SearchIcon size={15} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowDropdown(true)}
            placeholder="Opponent, competition, or ask anything…"
            className="flex-1 border-none outline-none bg-transparent"
            style={{ color: 'var(--color-ink)', fontFamily: 'inherit' }}
            autoFocus
          />
          {query.trim() && (
            <button
              onClick={() => runAiSearch(query)}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 border-none cursor-pointer transition-opacity"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                fontSize: '0.75rem',
                fontFamily: 'inherit',
                opacity: aiLoading ? 0.6 : 1,
              }}
            >
              {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Ask AI
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && dropdownItems.length > 0 && (
          <div
            className="absolute left-0 right-0 z-10 rounded-b-lg border border-t-0 overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: query ? 'var(--color-accent)' : 'var(--color-border)' }}
          >
            {!query && (
              <div className="flex items-center justify-between px-4 py-1.5" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Recent searches
                </span>
                {history.length > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]) }}
                    style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {dropdownItems.map((item) => (
              <div
                key={item}
                className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer"
                style={{ fontSize: '0.875rem', color: 'var(--color-ink-secondary)' }}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item) }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
              >
                <div className="flex items-center gap-2">
                  {!query && <Clock size={12} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />}
                  {query && <SearchIcon size={12} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />}
                  <span>{item}</span>
                </div>
                {!query && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeHistory(item); setHistory(loadHistory()) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-ink-faint)', lineHeight: 1 }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mb-6" style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem', textAlign: 'right' }}>
        Type to filter · Press Enter or Ask AI for AI search
      </p>

      {/* AI loading */}
      {aiLoading && (
        <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}>
          <Loader2 size={16} className="animate-spin" />
          Searching… first player search may take a minute while data loads
        </div>
      )}

      {/* AI error */}
      {!aiLoading && aiError && (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--color-loss)' }}>{aiError}</p>
      )}

      {/* AI results */}
      {!aiLoading && mode === 'ai' && aiResponse && (
        <>
          {/* Player stats card */}
          {aiResponse.playerStats && <PlayerStatsCard stats={aiResponse.playerStats} />}

          {/* AI summary */}
          <div
            className="flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-5"
            style={{ backgroundColor: 'var(--color-accent-faint)', borderColor: 'rgba(30,92,36,0.2)' }}
          >
            <Sparkles size={13} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }} />
            <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
              {aiResponse.summary}
            </p>
          </div>

          {aiResults.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--color-ink-faint)' }}>
              No matching games found.
            </p>
          ) : (
            aiResults.map(({ match, reason }) => <MatchCard key={match.id} match={match} subtitle={reason} />)
          )}
        </>
      )}

      {/* Keyword results */}
      {mode === 'keyword' && query && (
        <>
          {keywordResults.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--color-ink-faint)' }}>
              No matches found for "{query}"
            </p>
          ) : (
            <>
              <p className="mb-3" style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>
                {keywordResults.length} match{keywordResults.length !== 1 ? 'es' : ''} found
              </p>
              {keywordResults.map((match) => <MatchCard key={match.id} match={match} />)}
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!query && !aiLoading && !aiResponse && (
        <div className="text-center py-16" style={{ color: 'var(--color-ink-faint)' }}>
          <Sparkles size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm m-0 mb-1">Type to filter, or ask the AI anything</p>
          <p className="text-xs m-0" style={{ opacity: 0.7 }}>
            "Rangers" · "Hatate goals" · "Highest scoring games" · "Away wins"
          </p>
        </div>
      )}
    </div>
  )
}
