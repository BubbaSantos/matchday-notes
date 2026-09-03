import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, MapPin, ChevronDown } from 'lucide-react'
import { useFixtures } from '../hooks/useFixtures'
import { useMatchNotes, type MatchNotes } from '../hooks/useMatchNotes'
import { fetchLeagueTable } from '../lib/table'
import { fetchMatchEvents } from '../lib/matchEvents'
import { stableMatchKey } from '../lib/matchKey'
import { CompetitionBadge } from '../components/CompetitionBadge'
import { LeagueTable } from '../components/LeagueTable'
import { MatchIncidents, MatchStats } from '../components/MatchEvents'
import { Lineups } from '../components/Lineups'
import { VoiceRecorder } from '../components/VoiceRecorder'
import type { MatchEntry, SSMatchData, TableRow } from '../types'

function formatFullDate(iso: string) {
  const d = new Date(iso)
  return {
    long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }
}

// Clubs typically release lineups 60-75 minutes before kickoff. Once a match
// enters that window, poll every 5 minutes until the lineup actually shows up
// (rather than only fetching once full time has passed).
const LINEUP_POLL_WINDOW_MS = 75 * 60 * 1000
const LINEUP_POLL_INTERVAL_MS = 5 * 60 * 1000
const LINEUP_POLL_MAX_WAIT_MS = 6 * 60 * 60 * 1000 // cap setTimeout delay well under its ~24.8-day limit

function useMatchEvents(match: MatchEntry | undefined) {
  const [events, setEvents] = useState<SSMatchData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!match) return
    const isPast = match.phase === 'post'
    const kickoffMs = new Date(match.kickoff).getTime()
    const date = match.kickoff.slice(0, 10)

    let cancelled = false
    let timer: number | undefined
    let firstFetchDone = false

    async function fetchOnce() {
      if (!firstFetchDone) setLoading(true)
      let data: SSMatchData | null = null
      try {
        data = await fetchMatchEvents(date)
        if (!cancelled) setEvents(data)
      } catch { /* no events yet */ }
      finally {
        if (!cancelled && !firstFetchDone) {
          setLoading(false)
          firstFetchDone = true
        }
      }
      return data
    }

    function scheduleNext(delayMs: number) {
      timer = window.setTimeout(tick, Math.min(Math.max(delayMs, 0), LINEUP_POLL_MAX_WAIT_MS))
    }

    async function tick() {
      if (cancelled) return
      const msUntilKickoff = kickoffMs - Date.now()

      if (!isPast && msUntilKickoff > LINEUP_POLL_WINDOW_MS) {
        // Not yet in the pre-kickoff window — check back once it opens.
        scheduleNext(msUntilKickoff - LINEUP_POLL_WINDOW_MS)
        return
      }

      const data = await fetchOnce()
      const lineupsShown = !!data && (data.homeLineup.players.length > 0 || data.awayLineup.players.length > 0)
      if (!isPast && !lineupsShown) scheduleNext(LINEUP_POLL_INTERVAL_MS)
    }

    if (isPast) {
      fetchOnce()
    } else {
      tick()
    }

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [match?.id, match?.phase, match?.kickoff])

  return { events, loadingEvents: loading }
}

type TablePhase = 'before' | 'after'

function useMatchTables(match: MatchEntry | undefined) {
  const [tables, setTables] = useState<Record<TablePhase, TableRow[] | null>>({ before: null, after: null })
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<TablePhase>('after')

  const isPremiership = match?.competition === 'Scottish Premiership'

  useEffect(() => {
    if (!match || !isPremiership) return
    let cancelled = false
    const date = match.kickoff.slice(0, 10)
    setLoading(true)
    ;(async () => {
      try {
        const [before, after] = await Promise.all([
          fetchLeagueTable({ cutoff: date, inclusive: false }),
          fetchLeagueTable({ cutoff: date, inclusive: true }),
        ])
        if (!cancelled) setTables({ before, after })
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [match?.id])

  return { tables, loadingTables: loading, phase, setPhase, isPremiership }
}

export function MatchDay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fixtures } = useFixtures()
  const match = fixtures.find((m) => m.id === id)
  const { events, loadingEvents } = useMatchEvents(match)
  const { tables, loadingTables, phase, setPhase, isPremiership } = useMatchTables(match)
  const notes = useMatchNotes(match ? stableMatchKey(match) : undefined)

  if (!match && fixtures.length > 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: 'var(--color-ink-muted)' }}>
        <p>Match not found.</p>
        <Link to="/" style={{ color: 'var(--color-accent)', fontSize: '0.875rem' }}>← Back to archive</Link>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg h-20 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
        ))}
      </div>
    )
  }

  const { long, time } = formatFullDate(match.kickoff)
  const isPast = match.phase === 'post'
  const venueLabel = match.stadiumName ?? (match.venue === 'H' ? 'Celtic Park' : match.venue === 'A' ? 'Away' : 'Neutral')

  const decidedOnPenalties = isPast && match.penalties !== undefined
  const win = isPast && (decidedOnPenalties ? match.penalties!.celtic > match.penalties!.opponent : match.celticScore! > match.opponentScore!)
  const draw = isPast && !decidedOnPenalties && match.celticScore === match.opponentScore
  const resultColor = win ? 'var(--color-win)' : draw ? 'var(--color-draw)' : isPast ? 'var(--color-loss)' : 'var(--color-ink)'
  const resultBg = win ? 'var(--color-win-bg)' : draw ? 'var(--color-draw-bg)' : isPast ? 'var(--color-loss-bg)' : 'transparent'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 border-none cursor-pointer p-0"
        style={{ background: 'none', color: 'var(--color-ink-muted)', fontSize: '0.875rem', fontFamily: 'inherit', marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={13} />
        Back
      </button>

      {/* Header card */}
      <div
        className="rounded-xl border p-5 mb-1"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <CompetitionBadge competition={match.competition} />
          {match.round && (
            <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.75rem' }}>
              {match.round}
            </span>
          )}
          <span
            className="flex items-center gap-1 ml-auto"
            style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}
          >
            <MapPin size={10} />
            {venueLabel}
          </span>
        </div>
        <h1 className="font-journal m-0 leading-tight" style={{ color: 'var(--color-ink)', fontSize: '1.5rem' }}>
          {match.venue === 'A' ? (
            <>{match.opponent} <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.9em' }}>vs</span> Celtic</>
          ) : (
            <>Celtic <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.9em' }}>vs</span> {match.opponent}</>
          )}
        </h1>
        <p className="m-0 mt-1" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
          {long} · KO {time}
        </p>

        {isPast && match.celticScore !== undefined && (
          <div
            className="mt-4 pt-4 border-t rounded-lg text-center py-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: resultBg, marginInline: '-1.25rem', paddingInline: '1.25rem' }}
          >
            <div
              className="font-bold font-mono tabular-nums"
              style={{ color: resultColor, fontSize: '3rem', lineHeight: 1 }}
            >
              {match.venue === 'A' ? match.opponentScore : match.celticScore}
              –
              {match.venue === 'A' ? match.celticScore : match.opponentScore}
            </div>
            <div style={{ color: decidedOnPenalties ? resultColor : 'var(--color-ink-muted)', fontSize: decidedOnPenalties ? '0.9rem' : '0.75rem', marginTop: decidedOnPenalties ? 2 : 4 }}>
              {decidedOnPenalties
                ? `Celtic ${win ? 'win' : 'lose'} ${match.penalties!.celtic}–${match.penalties!.opponent} on penalties`
                : `${win ? 'Win' : draw ? 'Draw' : 'Loss'} · Full time`}
            </div>
          </div>
        )}

        {/* Inline league table — Celtic row by default, expandable */}
        {isPremiership && (tables.before || tables.after || loadingTables) && (
          <InlineLeagueTable
            tables={tables}
            loading={loadingTables}
            isPast={isPast}
            phase={phase}
            setPhase={setPhase}
            opponent={match.opponent}
          />
        )}

      </div>

      {/* Events / Stats / Lineups / Notes */}
      <MatchTabs
        key={match.id}
        match={match}
        events={events}
        loadingEvents={loadingEvents}
        isPast={isPast}
        notes={notes}
      />
    </div>
  )
}

function formatPostedAt(iso: string) {
  const d = new Date(iso)
  return `Posted ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

function NotesBlock({
  draft,
  setDraft,
  postedAt,
  saving,
  placeholder,
}: {
  draft: string
  setDraft: (text: string) => void
  postedAt: string | undefined
  saving: boolean
  placeholder: string
}) {
  const [editing, setEditing] = useState(!draft)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (editing) {
      autoResize()
      textareaRef.current?.focus()
    }
  }, [editing, autoResize])

  useEffect(() => {
    if (editing) autoResize()
  }, [draft, editing, autoResize])

  // Switch to edit mode when transcript arrives (draft changes externally)
  const prevDraft = useRef(draft)
  useEffect(() => {
    if (draft !== prevDraft.current && !editing) setEditing(true)
    prevDraft.current = draft
  }, [draft, editing])

  return (
    <div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim()) setEditing(false) }}
          placeholder={placeholder}
          rows={1}
          className="font-journal block w-full resize-none leading-relaxed"
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--color-ink-secondary)',
            padding: 0,
            fontSize: '0.975rem',
            overflow: 'hidden',
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="font-journal cursor-text notes-rendered leading-relaxed"
          style={{ color: 'var(--color-ink-secondary)', fontSize: '0.975rem', minHeight: '1.5em' }}
        >
          <ReactMarkdown>{draft}</ReactMarkdown>
        </div>
      )}
      {(saving || postedAt) && (
        <div className="mt-1.5" style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem' }}>
          {saving ? 'Saving…' : postedAt && formatPostedAt(postedAt)}
        </div>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1.5"
        style={{
          color: 'var(--color-ink-faint)',
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function InlineLeagueTable({
  tables,
  loading,
  isPast,
  phase,
  setPhase,
  opponent,
}: {
  tables: Record<'before' | 'after', TableRow[] | null>
  loading: boolean
  isPast: boolean
  phase: 'before' | 'after'
  setPhase: (p: 'before' | 'after') => void
  opponent: string
}) {
  const [expanded, setExpanded] = useState(false)

  const currentRows = tables.after
  const expandedRows = isPast ? (tables[phase] ?? tables.after) : tables.after
  const celticRow = currentRows?.find((r) => r.team === 'Celtic')
    ?? (currentRows && currentRows.length > 0
      ? { team: 'Celtic', position: currentRows.length + 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
      : undefined)

  // Build position-change map: team → delta (positive = moved up)
  const positionChanges = (() => {
    if (!tables.before || !tables.after || phase !== 'after') return undefined
    const beforeMap = new Map(tables.before.map((r) => [r.team, r.position]))
    const changes = new Map<string, number>()
    for (const row of tables.after) {
      const before = beforeMap.get(row.team)
      if (before != null) changes.set(row.team, before - row.position)
    }
    return changes
  })()

  return (
    <div
      className="border-t mt-4 pt-3"
      style={{ borderColor: 'var(--color-border-subtle)', marginInline: '-1.25rem', paddingInline: '1.25rem' }}
    >
      {loading ? (
        <div className="h-8 animate-pulse rounded" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      ) : (
        <>
          {/* Collapsed: just Celtic's current standing */}
          {!expanded && celticRow && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full border-none cursor-pointer p-0 text-left"
              style={{ background: 'none' }}
            >
              <div className="flex items-center gap-3 py-1.5" style={{ fontSize: '0.8rem' }}>
                <span
                  className="font-mono font-bold"
                  style={{ color: 'var(--color-accent)', width: 20, textAlign: 'center', fontSize: '1rem' }}
                >
                  {celticRow.position}
                </span>
                <span style={{ flex: 1, color: 'var(--color-accent)', fontWeight: 600 }}>Celtic</span>
                {[
                  { l: 'P', v: celticRow.played },
                  { l: 'W', v: celticRow.won },
                  { l: 'D', v: celticRow.drawn },
                  { l: 'L', v: celticRow.lost },
                  { l: 'GD', v: celticRow.goalDifference > 0 ? `+${celticRow.goalDifference}` : celticRow.goalDifference },
                  { l: 'Pts', v: celticRow.points },
                ].map(({ l, v }) => (
                  <div key={l} className="text-center" style={{ width: 28 }}>
                    <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.58rem', textTransform: 'uppercase' }}>{l}</div>
                    <div className="font-mono" style={{ color: l === 'Pts' ? 'var(--color-accent)' : 'var(--color-ink-muted)', fontWeight: l === 'Pts' ? 700 : 400, fontSize: '0.78rem' }}>{v}</div>
                  </div>
                ))}
                <ChevronDown size={12} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />
              </div>
            </button>
          )}

          {/* Expanded: before/after toggle + full table */}
          {expanded && expandedRows && (
            <div>
              {isPast && (
                <div className="flex gap-0 mb-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {(['before', 'after'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPhase(p)}
                      className="border-none cursor-pointer px-0 py-1 mr-4"
                      style={{
                        background: 'none',
                        fontFamily: 'inherit',
                        fontSize: '0.62rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: phase === p ? 'var(--color-ink)' : 'var(--color-ink-faint)',
                        fontWeight: phase === p ? 600 : 400,
                        borderBottom: phase === p ? '2px solid var(--color-accent)' : '2px solid transparent',
                        marginBottom: -1,
                      }}
                    >
                      {p === 'before' ? 'Before match' : 'After match'}
                    </button>
                  ))}
                </div>
              )}
              <LeagueTable rows={expandedRows} secondaryHighlight={opponent} positionChanges={positionChanges} />
              <button
                onClick={() => setExpanded(false)}
                className="w-full text-center border-none cursor-pointer mt-2 py-1"
                style={{ background: 'none', color: 'var(--color-ink-faint)', fontSize: '0.72rem', fontFamily: 'inherit' }}
              >
                Show less ↑
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

type MatchTab = 'events' | 'stats' | 'lineups' | 'notes'

function MatchTabs({
  match,
  events,
  loadingEvents,
  isPast,
  notes,
}: {
  match: MatchEntry
  events: SSMatchData | null
  loadingEvents: boolean
  isPast: boolean
  notes: MatchNotes
}) {
  const hasLineups = !!events && (events.homeLineup.players.length > 0 || events.awayLineup.players.length > 0)

  const [tab, setTab] = useState<MatchTab>(isPast ? 'events' : 'notes')

  // Pre-match, the whole point of polling is to surface the lineup the
  // moment it's out — jump straight to it instead of making the user notice
  // and click through.
  useEffect(() => {
    if (!isPast && hasLineups) setTab('lineups')
  }, [isPast, hasLineups])

  const tabs: { key: MatchTab; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'stats', label: 'Stats' },
    { key: 'lineups', label: 'Lineups' },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <div className="mt-4">
      <div className="flex" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="border-none cursor-pointer px-0 py-2 mr-5"
            style={{
              background: 'none',
              fontFamily: 'inherit',
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: tab === t.key ? 'var(--color-ink)' : 'var(--color-ink-faint)',
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === 'events' && (
          loadingEvents ? (
            <div className="rounded h-20 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
          ) : events ? (
            <MatchIncidents data={events} opponentName={match.opponent} />
          ) : (
            <EmptyTabMessage isPast={isPast} thing="events" />
          )
        )}

        {tab === 'stats' && (
          loadingEvents ? (
            <div className="rounded h-24 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
          ) : events ? (
            <MatchStats data={events} />
          ) : (
            <EmptyTabMessage isPast={isPast} thing="stats" />
          )
        )}

        {tab === 'lineups' && (
          loadingEvents ? (
            <div className="rounded h-40 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
          ) : hasLineups ? (
            <Lineups data={events!} />
          ) : (
            <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.85rem' }}>
              {isPast ? 'No lineup available for this match.' : "Lineup isn't out yet — checking automatically every 5 minutes from 75 minutes before kickoff."}
            </p>
          )
        )}

        {tab === 'notes' && <NotesTab match={match} isPast={isPast} notes={notes} />}
      </div>
    </div>
  )
}

function MarkdownHelp() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const shortcuts = [
    { syntax: '## Heading', result: 'Section heading' },
    { syntax: '**bold**', result: 'Bold text' },
    { syntax: '*italic*', result: 'Italic text' },
    { syntax: '- item', result: 'Bullet list' },
    { syntax: '1. item', result: 'Numbered list' },
  ]

  const voiceCues = [
    'pre-match', 'post-match', 'half-time', 'full-time',
    'first half', 'second half', 'man of the match', 'key moments', 'summary',
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Markdown help"
        className="border-none cursor-pointer rounded-full flex items-center justify-center"
        style={{
          width: 16, height: 16, padding: 0,
          background: 'var(--color-border)',
          color: 'var(--color-ink-faint)',
          fontSize: '0.6rem', fontWeight: 700, fontFamily: 'inherit',
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && (
        <div
          className="absolute right-0 rounded-lg border shadow-md z-50"
          style={{
            top: 'calc(100% + 6px)',
            width: 240,
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            padding: '0.875rem',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', marginBottom: '0.5rem' }}>
            Formatting
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <tbody>
              {shortcuts.map(({ syntax, result }) => (
                <tr key={syntax}>
                  <td style={{ padding: '2px 8px 2px 0', fontFamily: 'monospace', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>{syntax}</td>
                  <td style={{ padding: '2px 0', color: 'var(--color-ink-muted)' }}>{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', margin: '0.75rem 0 0.4rem' }}>
            Voice cues → headings
          </div>
          <div className="flex flex-wrap gap-1">
            {voiceCues.map((cue) => (
              <span
                key={cue}
                style={{
                  fontSize: '0.65rem', padding: '1px 6px', borderRadius: 3,
                  backgroundColor: 'var(--color-accent-faint)',
                  color: 'var(--color-accent)',
                }}
              >
                {cue}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyTabMessage({ isPast, thing }: { isPast: boolean; thing: string }) {
  return (
    <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.85rem' }}>
      {isPast ? `No ${thing} available for this match.` : `No ${thing} to show yet.`}
    </p>
  )
}

function NotesTab({
  match,
  isPast,
  notes,
}: {
  match: MatchEntry
  isPast: boolean
  notes: MatchNotes
}) {
  return (
    <div className="space-y-6">
      {match.injuries && match.injuries.length > 0 && (
        <Block title="Injury News">
          <div className="space-y-1.5">
            {match.injuries.map((inj) => (
              <div
                key={inj.playerName}
                className="flex justify-between rounded border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              >
                <span>
                  <span style={{ color: 'var(--color-ink)' }}>{inj.playerName}</span>
                  <span className="ml-1.5" style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>{inj.position}</span>
                </span>
                <span style={{ color: 'var(--color-draw)', fontSize: '0.8rem' }}>
                  {inj.injury}{inj.returnDate ? ` · ${inj.returnDate}` : ''}
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
            Notes
          </div>
          <MarkdownHelp />
        </div>
        <NotesBlock
          draft={notes.draft}
          setDraft={notes.setDraft}
          postedAt={notes.notesPostedAt}
          saving={notes.saving}
          placeholder={isPast ? 'What did you make of it…' : 'How are you feeling about this one…'}
        />
        <div className="mt-2.5">
          <VoiceRecorder
            onTranscribed={(text) => {
              const current = notes.draft.trim()
              notes.setDraft(current ? current + '\n\n' + text : text)
            }}
          />
        </div>
      </div>
    </div>
  )
}
