import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, AlertCircle, ChevronDown } from 'lucide-react'
import { useFixtures } from '../hooks/useFixtures'
import { FixtureCard } from '../components/FixtureCard'
import { LeagueTable } from '../components/LeagueTable'
import { fetchLeagueTable } from '../lib/table'
import type { Competition, LeagueStanding, TableRow } from '../types'

type Filter = 'all' | Competition
type Section = 'upcoming' | 'played'

export function Home() {
  const { fixtures, standing, loading, error, refresh } = useFixtures()

  // Filter/section/season live in the URL, not component state — otherwise
  // navigating to a match and back (which remounts Home) loses whatever you
  // had selected and resets to the defaults.
  const [searchParams, setSearchParams] = useSearchParams()
  const currentSeasonLabel = getSeason(new Date().toISOString())
  const filter = (searchParams.get('comp') as Filter) || 'all'
  const section = (searchParams.get('section') as Section) || 'upcoming'
  const selectedSeason = searchParams.get('season') || currentSeasonLabel

  function setFilter(f: Filter) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (f === 'all') next.delete('comp'); else next.set('comp', f)
      return next
    }, { replace: true })
  }

  function setSection(s: Section) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (s === 'upcoming') next.delete('section'); else next.set('section', s)
      return next
    }, { replace: true })
  }

  function setSelectedSeason(s: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (s === currentSeasonLabel) next.delete('season'); else next.set('season', s)
      return next
    }, { replace: true })
  }

  const competitions = Array.from(new Set(fixtures.map((f) => f.competition))) as Competition[]
  const filtered = filter === 'all' ? fixtures : fixtures.filter((m) => m.competition === filter)
  const upcoming = filtered.filter((m) => m.phase === 'pre' || m.phase === 'live')
  const past = filtered
    .filter((m) => m.phase === 'post')
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()) // newest first
  const currentSeasonCount = past.filter((m) => getSeason(m.kickoff) === currentSeasonLabel).length

  // All seasons present in the played fixtures, newest first
  const seasons = useMemo(() => {
    const set = new Set<string>()
    for (const m of past) set.add(getSeason(m.kickoff))
    return [...set]
  }, [past])

  const seasonFixtures = past.filter((m) => getSeason(m.kickoff) === selectedSeason)

  // If upcoming is empty (e.g. end of season) and we haven't manually picked a section, switch to played
  useEffect(() => {
    if (!loading && upcoming.length === 0 && past.length > 0) {
      setSection('played')
    }
  }, [loading, upcoming.length, past.length])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-baseline gap-3 mb-0.5">
            <h1
              className="font-journal m-0 leading-tight"
              style={{ color: 'var(--color-ink)', fontSize: '1.75rem' }}
            >
              The Diary
            </h1>
            <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>2026–27</span>
          </div>
          <p className="m-0 mt-0.5" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
            A record of every matchday — before, during, and after.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh"
          className="mt-1 p-1.5 rounded border-none cursor-pointer"
          style={{ background: 'transparent', color: 'var(--color-ink-faint)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 rounded border px-3 py-2 mb-5 text-sm"
          style={{ borderColor: '#dca', backgroundColor: '#fffbf0', color: '#7a5c00' }}
        >
          <AlertCircle size={13} />
          <span>Couldn't load live data — showing cache. {error}</span>
        </div>
      )}

      {/* Standing */}
      {standing && <StandingRow standing={standing} />}

      {/* Filters */}
      {!loading && competitions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-7">
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          {competitions.map((c) => (
            <FilterChip
              key={c}
              label={shortName(c)}
              active={filter === c}
              onClick={() => setFilter(c as Filter)}
            />
          ))}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg h-16 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
          ))}
        </div>
      )}

      {/* Section toggle tabs */}
      {!loading && (upcoming.length > 0 || past.length > 0) && (
        <div
          className="flex items-center justify-between gap-3 mb-6"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div className="flex gap-0">
            <SectionTab
              label="Upcoming"
              count={upcoming.length}
              active={section === 'upcoming'}
              onClick={() => setSection('upcoming')}
            />
            <SectionTab
              label="Played"
              count={section === 'played' ? seasonFixtures.length : currentSeasonCount}
              active={section === 'played'}
              onClick={() => setSection('played')}
            />
          </div>
          {section === 'played' && seasons.length > 1 && (
            <SeasonPicker seasons={seasons} value={selectedSeason} onChange={setSelectedSeason} />
          )}
        </div>
      )}

      {/* Upcoming */}
      {!loading && section === 'upcoming' && (
        <section className="mb-7">
          {upcoming.length === 0 ? (
            <p className="text-center py-12" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>
              No upcoming fixtures.
            </p>
          ) : (
            upcoming.map((m, i) => (
              <FixtureCard key={m.id} match={m} isLast={i === upcoming.length - 1} />
            ))
          )}
        </section>
      )}

      {/* Past — filtered to the selected season */}
      {!loading && section === 'played' && (
        <section>
          {seasonFixtures.length === 0 ? (
            <p className="text-center py-12" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>
              No played fixtures{selectedSeason ? ` in ${selectedSeason}` : ''}.
            </p>
          ) : (
            seasonFixtures.map((m, i) => (
              <FixtureCard key={m.id} match={m} isLast={i === seasonFixtures.length - 1} />
            ))
          )}
        </section>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-center py-16" style={{ color: 'var(--color-ink-faint)' }}>
          No fixtures yet.
        </p>
      )}
    </div>
  )
}

function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: string[]
  value: string
  onChange: (season: string) => void
}) {
  return (
    <div className="relative mb-2" style={{ flexShrink: 0 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded border cursor-pointer pl-2.5 pr-6 py-1 text-xs"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-ink-muted)',
          fontFamily: 'inherit',
        }}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        style={{
          position: 'absolute',
          right: 7,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-ink-faint)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function StandingRow({ standing }: { standing: LeagueStanding }) {
  const [expanded, setExpanded] = useState(false)
  const [table, setTable] = useState<TableRow[] | null>(null)
  const [loadingTable, setLoadingTable] = useState(false)

  async function toggle() {
    if (!expanded && !table) {
      setLoadingTable(true)
      try {
        const rows = await fetchLeagueTable()
        setTable(rows)
      } catch { /* ignore */ }
      finally { setLoadingTable(false) }
    }
    setExpanded((v) => !v)
  }

  const sfx = standing.position === 1 ? 'st' : standing.position === 2 ? 'nd' : standing.position === 3 ? 'rd' : 'th'

  return (
    <div className="mb-6">
      <button
        onClick={toggle}
        className="w-full text-left border-none cursor-pointer p-0"
        style={{ background: 'none' }}
      >
        <div
          className="flex items-center gap-5 rounded-lg border px-5 py-3 text-sm transition-all"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            borderBottomLeftRadius: expanded ? 0 : undefined,
            borderBottomRightRadius: expanded ? 0 : undefined,
            borderBottom: expanded ? 'none' : undefined,
          }}
        >
          <div>
            <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Position
            </div>
            <div
              className="font-bold font-mono leading-none mt-0.5"
              style={{ color: 'var(--color-accent)', fontSize: '1.5rem' }}
            >
              {standing.position}
              <span className="font-normal ml-0.5" style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)' }}>{sfx}</span>
            </div>
          </div>
          <div className="h-7 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <div className="flex gap-4 flex-1">
            {[
              { l: 'P', v: standing.played },
              { l: 'W', v: standing.won },
              { l: 'D', v: standing.drawn },
              { l: 'L', v: standing.lost },
              { l: 'GD', v: standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference },
              { l: 'Pts', v: standing.points },
            ].map(({ l, v }) => (
              <div key={l} className="text-center">
                <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem', textTransform: 'uppercase' }}>{l}</div>
                <div className="font-mono font-medium" style={{ color: 'var(--color-ink-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--color-ink-faint)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {expanded && (
        <div
          className="border rounded-b-lg overflow-hidden"
          style={{ borderColor: 'var(--color-border)', borderTop: 'none' }}
        >
          {loadingTable ? (
            <div className="py-8 text-center" style={{ color: 'var(--color-ink-faint)', fontSize: '0.8rem' }}>
              Loading table…
            </div>
          ) : table ? (
            <LeagueTable rows={table} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function SectionTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-0 py-2 mr-6 border-none cursor-pointer transition-all"
      style={{
        background: 'transparent',
        color: active ? 'var(--color-ink)' : 'var(--color-ink-faint)',
        fontSize: '0.72rem',
        fontFamily: 'inherit',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontWeight: active ? 600 : 400,
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        marginBottom: -1,
      }}
    >
      {label}
      <span
        style={{
          fontSize: '0.65rem',
          color: active ? 'var(--color-accent)' : 'var(--color-ink-faint)',
          fontWeight: 500,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded border text-xs cursor-pointer transition-all"
      style={{
        backgroundColor: active ? 'var(--color-accent)' : 'transparent',
        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
        color: active ? '#fff' : 'var(--color-ink-muted)',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

function shortName(c: Competition): string {
  const map: Record<Competition, string> = {
    'Scottish Premiership': 'Premiership',
    'Scottish Cup': 'Scottish Cup',
    'League Cup': 'League Cup',
    'Europa League': 'Europa',
    'Europa Conference League': 'Conference',
    'Champions League': 'UCL',
    'Friendly': 'Friendly',
  }
  return map[c] ?? c
}

function getSeason(kickoff: string): string {
  const d = new Date(kickoff)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const start = m >= 7 ? y : y - 1
  return `${start}–${String(start + 1).slice(2)}`
}
