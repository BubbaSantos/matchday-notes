import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft } from 'lucide-react'
import { useMatchNotes } from '../hooks/useMatchNotes'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { parseTeamsSection } from '../lib/historicalData'
import type { HistoricalLineup, HistoricalEvent } from '../lib/historicalData'
import type { MatchNotes } from '../hooks/useMatchNotes'

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

function formatFullDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function opponent(match: HistoricalMatch) {
  return match.home === 'Celtic' ? match.away : match.home
}

function resultColors(match: HistoricalMatch) {
  const celtic = match.home === 'Celtic' ? match.homeScore : match.awayScore
  const opp   = match.home === 'Celtic' ? match.awayScore : match.homeScore
  if (celtic == null || opp == null) return { color: 'var(--color-ink)', bg: 'transparent', label: '' }
  if (celtic > opp) return { color: 'var(--color-win)', bg: 'var(--color-win-bg)', label: 'Win' }
  if (celtic === opp) return { color: 'var(--color-draw)', bg: 'var(--color-draw-bg)', label: 'Draw' }
  return { color: 'var(--color-loss)', bg: 'var(--color-loss-bg)', label: 'Loss' }
}

// ── Events tab ────────────────────────────────────────────────────────────────

function EventsTab({ events, celticName, opponentName, report }: {
  events: HistoricalEvent[]
  celticName: string
  opponentName: string
  report: { sections: Record<string, string> } | null
}) {
  if (!events.length && !report?.sections?.review && !report?.sections?.trivia) {
    return <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No events recorded for this match.</p>
  }

  const ICONS: Record<HistoricalEvent['type'], string> = {
    goal: '⚽',
    ownGoal: '⚽',
    yellowCard: '🟨',
    redCard: '🟥',
  }

  return (
    <div className="space-y-5">
      {events.length > 0 && (
        <div>
          {/* Team headers */}
          <div className="flex justify-between mb-2 px-1" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>
            <span>{celticName}</span>
            <span>{opponentName}</span>
          </div>

          <div className="space-y-1">
            {events.map((ev, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1.5 px-2 rounded"
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                {ev.isCeltic ? (
                  <>
                    <span style={{ fontSize: '0.75rem' }}>{ICONS[ev.type]}</span>
                    <span style={{ color: 'var(--color-ink)', fontSize: '0.85rem' }}>{ev.player}</span>
                    {ev.type === 'ownGoal' && <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}>(og)</span>}
                    <span className="ml-auto font-mono" style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>
                      {ev.minute != null ? `${ev.minute}'` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono" style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>
                      {ev.minute != null ? `${ev.minute}'` : ''}
                    </span>
                    <span className="ml-auto" style={{ color: 'var(--color-ink)', fontSize: '0.85rem' }}>{ev.player}</span>
                    {ev.type === 'ownGoal' && <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}>(og)</span>}
                    <span style={{ fontSize: '0.75rem' }}>{ICONS[ev.type]}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match report text */}
      {report?.sections?.trivia && (
        <div>
          <div className="mb-1.5" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>Trivia</div>
          <p className="m-0 leading-relaxed font-journal" style={{ color: 'var(--color-ink-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{report.sections.trivia}</p>
        </div>
      )}

      {report?.sections?.review && (
        <div>
          <div className="mb-1.5" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>Match Report</div>
          <p className="m-0 leading-relaxed font-journal" style={{ color: 'var(--color-ink-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{report.sections.review}</p>
        </div>
      )}

      {/* Other named report sections (e.g. newspaper articles) */}
      {report?.sections && Object.entries(report.sections)
        .filter(([k]) => !['trivia', 'review', 'teams', 'articles', 'pictures', 'intro'].includes(k))
        .map(([key, text]) => (
          <div key={key}>
            <div className="mb-1.5" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>
              {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
            <p className="m-0 leading-relaxed font-journal" style={{ color: 'var(--color-ink-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{text}</p>
          </div>
        ))
      }
    </div>
  )
}

// ── Lineups tab ───────────────────────────────────────────────────────────────

function LineupColumn({ lineup, align }: { lineup: HistoricalLineup; align: 'left' | 'right' }) {
  const starters = lineup.players.filter(p => p.starter)
  const subs = lineup.players.filter(p => !p.starter)

  const row = (player: (typeof starters)[0], i: number) => (
    <div
      key={i}
      className="flex items-center gap-2 py-1"
      style={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}
    >
      <span
        style={{
          color: 'var(--color-ink)',
          fontSize: '0.82rem',
          textAlign: align,
          lineHeight: 1.3,
        }}
      >
        {player.name}
      </span>
      {player.subbedOff && (
        <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem' }}>↓{player.subbedOff}'</span>
      )}
      {player.subbedOn && (
        <span style={{ color: 'var(--color-accent)', fontSize: '0.65rem' }}>↑{player.subbedOn}'</span>
      )}
    </div>
  )

  return (
    <div style={{ flex: 1 }}>
      <div
        className="mb-1.5 text-center"
        style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}
      >
        {lineup.teamName}
      </div>
      <div style={{ textAlign: align }}>
        {starters.map((p, i) => row(p, i))}
        {subs.length > 0 && (
          <>
            <div className="my-2" style={{ height: 1, backgroundColor: 'var(--color-border-subtle)' }} />
            {subs.map((p, i) => row(p, i + 100))}
          </>
        )}
        {lineup.subsNotUsed.length > 0 && (
          <div className="mt-2" style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem', textAlign: align }}>
            Not used: {lineup.subsNotUsed.join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

function LineupsTab({ celtic, opponent }: { celtic: HistoricalLineup | null; opponent: HistoricalLineup | null }) {
  if (!celtic && !opponent) {
    return <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No lineup data available for this match.</p>
  }

  return (
    <div className="flex gap-4">
      {celtic && <LineupColumn lineup={celtic} align="left" />}
      {celtic && opponent && <div style={{ width: 1, backgroundColor: 'var(--color-border-subtle)', flexShrink: 0 }} />}
      {opponent && <LineupColumn lineup={opponent} align="right" />}
    </div>
  )
}

// ── Pictures tab ──────────────────────────────────────────────────────────────

function PicturesTab({ pictures, pictureUrl }: { pictures: string[]; pictureUrl: string | null }) {
  if (!pictures?.length) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>
        <p className="m-0">No pictures available for this match.</p>
        {pictureUrl && (
          <a href={pictureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 no-underline" style={{ color: 'var(--color-accent)', fontSize: '0.8rem' }}>
            View on Celtic Wiki ↗
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {pictures.map((src, i) => (
        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
          <img
            src={src}
            alt={`Match picture ${i + 1}`}
            className="w-full rounded-lg"
            style={{ aspectRatio: '4/3', objectFit: 'cover', display: 'block', border: '1px solid var(--color-border)' }}
            loading="lazy"
          />
        </a>
      ))}
    </div>
  )
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ notes }: { notes: MatchNotes }) {
  const [editing, setEditing] = useState(!notes.draft)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (editing) { autoResize(); textareaRef.current?.focus() }
  }, [editing, autoResize])

  useEffect(() => { if (editing) autoResize() }, [notes.draft, editing, autoResize])

  const prevDraft = useRef(notes.draft)
  useEffect(() => {
    if (notes.draft !== prevDraft.current && !editing) setEditing(true)
    prevDraft.current = notes.draft
  }, [notes.draft, editing])

  function formatPostedAt(iso: string) {
    const d = new Date(iso)
    return `Posted ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <textarea
          ref={textareaRef}
          value={notes.draft}
          onChange={e => notes.setDraft(e.target.value)}
          onBlur={() => { if (notes.draft.trim()) setEditing(false) }}
          placeholder="Your thoughts on this match…"
          rows={1}
          className="font-journal block w-full resize-none leading-relaxed"
          style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--color-ink-secondary)', padding: 0, fontSize: '0.975rem', overflow: 'hidden' }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="font-journal cursor-text notes-rendered leading-relaxed"
          style={{ color: 'var(--color-ink-secondary)', fontSize: '0.975rem', minHeight: '1.5em' }}
        >
          <ReactMarkdown>{notes.draft}</ReactMarkdown>
        </div>
      )}
      {(notes.saving || notes.notesPostedAt) && (
        <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem' }}>
          {notes.saving ? 'Saving…' : notes.notesPostedAt && formatPostedAt(notes.notesPostedAt)}
        </div>
      )}
      <VoiceRecorder
        onTranscribed={text => {
          const current = notes.draft.trim()
          notes.setDraft(current ? current + '\n\n' + text : text)
        }}
      />
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'events' | 'lineups' | 'notes' | 'pictures'

function MatchTabs({ match, parsed, notes }: {
  match: HistoricalMatch
  parsed: ReturnType<typeof parseTeamsSection>
  notes: MatchNotes
}) {
  const hasPictures = (match.pictures?.length ?? 0) > 0
  const [tab, setTab] = useState<Tab>('events')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'lineups', label: 'Lineups' },
    { key: 'pictures', label: hasPictures ? `Pictures (${match.pictures.length})` : 'Pictures' },
    { key: 'notes', label: 'Notes' },
  ]

  const celticName = match.home === 'Celtic' ? match.home : match.away
  const oppName    = match.home === 'Celtic' ? match.away : match.home

  return (
    <div className="mt-4">
      <div className="flex" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="border-none cursor-pointer px-0 py-2 mr-5"
            style={{
              background: 'none', fontFamily: 'inherit', fontSize: '0.68rem',
              textTransform: 'uppercase', letterSpacing: '0.08em',
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
          <EventsTab
            events={parsed.events}
            celticName={celticName}
            opponentName={oppName}
            report={match.report}
          />
        )}
        {tab === 'lineups' && (
          <LineupsTab celtic={parsed.celticLineup} opponent={parsed.opponentLineup} />
        )}
        {tab === 'pictures' && (
          <PicturesTab pictures={match.pictures ?? []} pictureUrl={match.pictureUrl} />
        )}
        {tab === 'notes' && <NotesTab notes={notes} />}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function HistoricalMatch() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [match, setMatch] = useState<HistoricalMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    const decoded = decodeURIComponent(slug)
    const year = decoded.replace(/^\//, '').slice(0, 4)
    if (isNaN(parseInt(year))) { setError('Invalid match'); setLoading(false); return }

    fetch(`/history/${year}.json`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() })
      .then((data: HistoricalMatch[]) => {
        const found = data.find(m =>
          m.slug === decoded || m.slug === '/' + decoded || encodeURIComponent(m.slug) === slug
        )
        if (!found) throw new Error('Match not found')
        setMatch(found)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [slug])

  const notesKey = slug ? `hist:${decodeURIComponent(slug).replace(/\//g, '')}` : undefined
  const notes = useMatchNotes(notesKey)

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg h-20 animate-pulse" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
        ))}
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: 'var(--color-ink-muted)' }}>
        <p>{error ?? 'Match not found.'}</p>
        <Link to="/" style={{ color: 'var(--color-accent)', fontSize: '0.875rem' }}>← Back to archive</Link>
      </div>
    )
  }

  const parsed = parseTeamsSection(match.report?.sections?.teams ?? '')
  const { color: resultColor, bg: resultBg, label: resultLabel } = resultColors(match)
  const opp = opponent(match)
  const venue = match.home === 'Celtic' ? 'H' : 'A'
  const celticScore = match.home === 'Celtic' ? match.homeScore : match.awayScore
  const oppScore   = match.home === 'Celtic' ? match.awayScore  : match.homeScore

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 border-none cursor-pointer p-0 mb-6"
        style={{ background: 'none', color: 'var(--color-ink-muted)', fontSize: '0.875rem', fontFamily: 'inherit' }}
      >
        <ArrowLeft size={13} />
        Back
      </button>

      <div className="rounded-xl border p-5 mb-1" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--color-ink-muted)', background: 'var(--color-border-subtle)', padding: '2px 8px', borderRadius: 4 }}>
            {match.competition}
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}>
            {venue === 'H' ? 'Celtic Park' : 'Away'}
          </span>
        </div>

        <h1 className="font-journal m-0 leading-tight" style={{ color: 'var(--color-ink)', fontSize: '1.5rem' }}>
          {venue === 'A' ? (
            <>{opp} <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.9em' }}>vs</span> Celtic</>
          ) : (
            <>Celtic <span style={{ color: 'var(--color-ink-muted)', fontSize: '0.9em' }}>vs</span> {opp}</>
          )}
        </h1>

        {match.date && (
          <p className="m-0 mt-1" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
            {formatFullDate(match.date)}
          </p>
        )}

        {celticScore != null && oppScore != null && (
          <div
            className="mt-4 pt-4 border-t rounded-lg text-center py-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: resultBg, marginInline: '-1.25rem', paddingInline: '1.25rem' }}
          >
            <div className="font-bold font-mono tabular-nums" style={{ color: resultColor, fontSize: '3rem', lineHeight: 1 }}>
              {celticScore}–{oppScore}
            </div>
            {parsed.attendance && (
              <div style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem', marginTop: 4 }}>
                Att: {Number(parsed.attendance).toLocaleString('en-GB')}
              </div>
            )}
            <div style={{ color: 'var(--color-ink-muted)', fontSize: '0.75rem', marginTop: 2 }}>
              {resultLabel} · Full time
            </div>
          </div>
        )}
      </div>

      <MatchTabs match={match} parsed={parsed} notes={notes} />
    </div>
  )
}
