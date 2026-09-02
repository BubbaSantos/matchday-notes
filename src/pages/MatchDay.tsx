import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
import { VoiceNoteList } from '../components/VoiceNoteList'
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
  const { fixtures } = useFixtures()
  const match = fixtures.find((m) => m.id === id)
  const { events, loadingEvents } = useMatchEvents(match)
  const { tables, loadingTables, phase, setPhase, isPremiership } = useMatchTables(match)
  const notes = useMatchNotes(match ? stableMatchKey(match) : undefined)

  if (!match && fixtures.length > 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: 'var(--color-ink-muted)' }}>
        <p>Match not found.</p>
        <Link to="/" style={{ color: 'var(--color-accent)', fontSize: '0.875rem' }}>← Back to diary</Link>
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
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 no-underline mb-6"
        style={{ color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}
      >
        <ArrowLeft size={13} />
        Back to diary
      </Link>

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
  text,
  postedAt,
  placeholder,
  onPost,
}: {
  text: string
  postedAt: string | undefined
  placeholder: string
  onPost: (text: string) => void
}) {
  const [editing, setEditing] = useState(!text)
  const [draft, setDraft] = useState(text)

  function handlePost() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onPost(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          className="font-journal w-full rounded border resize-y leading-relaxed"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-ink-secondary)',
            fontSize: '0.975rem',
            padding: '0.6rem 0.75rem',
            fontFamily: 'inherit',
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handlePost}
            disabled={!draft.trim()}
            className="rounded border-none cursor-pointer px-3 py-1.5"
            style={{
              backgroundColor: draft.trim() ? 'var(--color-accent)' : 'var(--color-border)',
              color: '#fff',
              fontSize: '0.8rem',
              fontFamily: 'inherit',
              opacity: draft.trim() ? 1 : 0.6,
            }}
          >
            Post
          </button>
          {text && (
            <button
              onClick={() => { setDraft(text); setEditing(false) }}
              className="rounded border cursor-pointer px-3 py-1.5"
              style={{
                background: 'none',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink-muted)',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="font-journal m-0 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-ink-secondary)', fontSize: '0.975rem' }}>
        {text}
      </p>
      <div className="flex items-center gap-2.5 mt-1.5">
        {postedAt && (
          <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem' }}>
            {formatPostedAt(postedAt)}
          </span>
        )}
        <button
          onClick={() => { setDraft(text); setEditing(true) }}
          className="border-none cursor-pointer p-0"
          style={{ background: 'none', color: 'var(--color-accent)', fontSize: '0.72rem', fontFamily: 'inherit' }}
        >
          Edit
        </button>
      </div>
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

  const activeRows = isPast ? (tables[phase] ?? tables.after) : tables.after
  const celticRow = activeRows?.find((r) => r.team === 'Celtic')
    ?? (activeRows && activeRows.length > 0
      ? { team: 'Celtic', position: activeRows.length + 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
      : undefined)

  // Build position-change map: team → delta (positive = moved up)
  const positionChanges = (() => {
    if (!tables.before || !tables.after || phase !== 'after') return undefined
    const beforeMap = new Map(tables.before.map((r) => [r.team, r.position]))
    const changes = new Map<string, number>()
    for (const row of tables.after) {
      const before = beforeMap.get(row.team)
      if (before != null) changes.set(row.team, before - row.position) // positive = moved up
    }
    return changes
  })()

  return (
    <div
      className="border-t mt-4 pt-3"
      style={{ borderColor: 'var(--color-border-subtle)', marginInline: '-1.25rem', paddingInline: '1.25rem' }}
    >
      {/* Phase toggle (before/after) — only for played Premiership games */}
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

      {loading ? (
        <div className="h-8 animate-pulse rounded" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      ) : (
        <>
          {/* Collapsed: just Celtic's row */}
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

          {/* Expanded: full table */}
          {expanded && activeRows && (
            <div>
              <LeagueTable rows={activeRows} secondaryHighlight={opponent} positionChanges={positionChanges} />
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

      <Block title="Pre-match notes">
        <NotesBlock
          text={notes.preNotes}
          postedAt={notes.preNotesPostedAt}
          placeholder="How are you feeling about this one…"
          onPost={notes.postPreNotes}
        />
        <div className="mt-2.5">
          <VoiceRecorder onSaved={(blob, transcript, duration) => notes.saveVoiceNote('pre', blob, transcript, duration)} />
        </div>
        {notes.preVoiceNotes.length > 0 && (
          <div className="mt-2.5">
            <VoiceNoteList notes={notes.preVoiceNotes} onDelete={(id) => notes.removeVoiceNote('pre', id)} />
          </div>
        )}
      </Block>

      {isPast && (
        <Block title="Post-match notes">
          <NotesBlock
            text={notes.postNotes}
            postedAt={notes.postNotesPostedAt}
            placeholder="What did you make of it…"
            onPost={notes.postPostNotes}
          />
          <div className="mt-2.5">
            <VoiceRecorder onSaved={(blob, transcript, duration) => notes.saveVoiceNote('post', blob, transcript, duration)} />
          </div>
          {notes.postVoiceNotes.length > 0 && (
            <div className="mt-2.5">
              <VoiceNoteList notes={notes.postVoiceNotes} onDelete={(id) => notes.removeVoiceNote('post', id)} />
            </div>
          )}
        </Block>
      )}
    </div>
  )
}
