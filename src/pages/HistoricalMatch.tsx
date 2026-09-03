import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useMatchNotes, type MatchNotes } from '../hooks/useMatchNotes'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { useRef, useCallback } from 'react'

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

// ── Result colours ────────────────────────────────────────────────────────────

function resultColors(match: HistoricalMatch) {
  const celtic = match.home === 'Celtic' ? match.homeScore : match.awayScore
  const opp   = match.home === 'Celtic' ? match.awayScore : match.homeScore
  if (celtic == null || opp == null) return { color: 'var(--color-ink)', bg: 'transparent', label: '' }
  if (celtic > opp) return { color: 'var(--color-win)', bg: 'var(--color-win-bg)', label: 'Win' }
  if (celtic === opp) return { color: 'var(--color-draw)', bg: 'var(--color-draw-bg)', label: 'Draw' }
  return { color: 'var(--color-loss)', bg: 'var(--color-loss-bg)', label: 'Loss' }
}

// ── Notes tab (same pattern as MatchDay) ─────────────────────────────────────

function NotesBlock({
  draft,
  setDraft,
  postedAt,
  saving,
}: {
  draft: string
  setDraft: (t: string) => void
  postedAt: string | undefined
  saving: boolean
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
    if (editing) { autoResize(); textareaRef.current?.focus() }
  }, [editing, autoResize])

  useEffect(() => { if (editing) autoResize() }, [draft, editing, autoResize])

  const prevDraft = useRef(draft)
  useEffect(() => {
    if (draft !== prevDraft.current && !editing) setEditing(true)
    prevDraft.current = draft
  }, [draft, editing])

  function formatPostedAt(iso: string) {
    const d = new Date(iso)
    return `Posted ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim()) setEditing(false) }}
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

// ── Report section ────────────────────────────────────────────────────────────

function ReportSection({ report, reportUrl }: {
  report: { sections: Record<string, string>; images: string[] } | null
  reportUrl: string | null
}) {
  if (!report?.sections) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>
        <p className="m-0">No report available for this match.</p>
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 no-underline"
            style={{ color: 'var(--color-accent)', fontSize: '0.8rem' }}
          >
            View on The Celtic Wiki <ExternalLink size={11} />
          </a>
        )}
      </div>
    )
  }

  const { sections } = report

  // Preferred display order
  const orderedKeys = ['trivia', 'review', 'teams']
  const allKeys = [...orderedKeys.filter(k => sections[k]), ...Object.keys(sections).filter(k => !orderedKeys.includes(k) && k !== 'pictures')]

  const sectionLabel: Record<string, string> = {
    trivia: 'Trivia',
    review: 'Match Report',
    teams: 'Teams',
    articles: 'Articles',
  }

  return (
    <div className="space-y-5">
      {allKeys.map(key => {
        const text = sections[key]
        if (!text) return null
        const label = sectionLabel[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

        return (
          <div key={key}>
            <div
              className="mb-1.5"
              style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}
            >
              {label}
            </div>
            <p
              className="m-0 leading-relaxed font-journal"
              style={{ color: 'var(--color-ink-secondary)', fontSize: '0.925rem', whiteSpace: 'pre-wrap' }}
            >
              {text}
            </p>
          </div>
        )
      })}

      {reportUrl && (
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 no-underline"
          style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}
        >
          Full page on The Celtic Wiki <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

// ── Pictures section ──────────────────────────────────────────────────────────

function PicturesSection({ pictures, pictureUrl }: { pictures: string[]; pictureUrl: string | null }) {
  if (!pictures?.length) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>
        <p className="m-0">No pictures available for this match.</p>
        {pictureUrl && (
          <a
            href={pictureUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 no-underline"
            style={{ color: 'var(--color-accent)', fontSize: '0.8rem' }}
          >
            Check Celtic Wiki pictures page <ExternalLink size={11} />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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
      {pictureUrl && (
        <a
          href={pictureUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 no-underline"
          style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}
        >
          More on The Celtic Wiki <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'report' | 'pictures' | 'notes'

function Tabs({ match, notes }: { match: HistoricalMatch; notes: MatchNotes }) {
  const hasPictures = (match.pictures?.length ?? 0) > 0

  const [tab, setTab] = useState<Tab>('report')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'report', label: 'Report' },
    { key: 'pictures', label: `Pictures${hasPictures ? ` (${match.pictures.length})` : ''}` },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <div className="mt-4">
      <div className="flex" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(t => (
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
        {tab === 'report' && (
          <ReportSection report={match.report} reportUrl={match.reportUrl} />
        )}

        {tab === 'pictures' && (
          <PicturesSection pictures={match.pictures ?? []} pictureUrl={match.pictureUrl} />
        )}

        {tab === 'notes' && (
          <div className="space-y-4">
            <div
              style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500, marginBottom: '0.5rem' }}
            >
              Notes
            </div>
            <NotesBlock
              draft={notes.draft}
              setDraft={notes.setDraft}
              postedAt={notes.notesPostedAt}
              saving={notes.saving}
            />
            <VoiceRecorder
              onTranscribed={text => {
                const current = notes.draft.trim()
                notes.setDraft(current ? current + '\n\n' + text : text)
              }}
            />
          </div>
        )}
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

    // Slug format: /2002-01-02-celtic-2-0-motherwell-spl
    // Year is first 4 chars
    const yearStr = decodeURIComponent(slug).replace(/^\//, '').slice(0, 4)
    const year = parseInt(yearStr)
    if (!year || isNaN(year)) { setError('Invalid match slug'); setLoading(false); return }

    fetch(`/history/${year}.json`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() })
      .then((data: HistoricalMatch[]) => {
        const decoded = decodeURIComponent(slug)
        const found = data.find(m => m.slug === decoded || m.slug === '/' + decoded || encodeURIComponent(m.slug) === slug)
        if (!found) throw new Error(`Match not found in ${year}`)
        setMatch(found)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [slug])

  // Stable notes key based on slug
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
        <Link to="/history" style={{ color: 'var(--color-accent)', fontSize: '0.875rem' }}>← Back to history</Link>
      </div>
    )
  }

  const { color: resultColor, bg: resultBg, label: resultLabel } = resultColors(match)
  const opp = opponent(match)
  const venue = match.home === 'Celtic' ? 'H' : 'A'
  const celticScore = match.home === 'Celtic' ? match.homeScore : match.awayScore
  const oppScore   = match.home === 'Celtic' ? match.awayScore  : match.homeScore

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(match.date ? `/history/${match.date.slice(0, 4)}` : '/history')}
        className="inline-flex items-center gap-1.5 border-none cursor-pointer p-0 mb-6"
        style={{ background: 'none', color: 'var(--color-ink-muted)', fontSize: '0.875rem', fontFamily: 'inherit' }}
      >
        <ArrowLeft size={13} />
        {match.date?.slice(0, 4) ?? 'History'}
      </button>

      {/* Header card */}
      <div
        className="rounded-xl border p-5 mb-1"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            style={{
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--color-ink-muted)',
              background: 'var(--color-border-subtle)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
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
            <div
              className="font-bold font-mono tabular-nums"
              style={{ color: resultColor, fontSize: '3rem', lineHeight: 1 }}
            >
              {celticScore}–{oppScore}
            </div>
            <div style={{ color: 'var(--color-ink-muted)', fontSize: '0.75rem', marginTop: 4 }}>
              {resultLabel} · Full time
            </div>
          </div>
        )}
      </div>

      <Tabs match={match} notes={notes} />
    </div>
  )
}
