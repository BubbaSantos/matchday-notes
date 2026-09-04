import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, Star } from 'lucide-react'
import { useMatchNotes } from '../hooks/useMatchNotes'
import { useFavourites } from '../hooks/useFavourites'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { parseTeamsSection, buildTeamsText, cleanReportText } from '../lib/historicalData'
import type { HistoricalLineup, HistoricalEvent, HistoricalPlayer } from '../lib/historicalData'
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

const ROW_GRID = '1fr 52px 1fr'

function WikiGoalRow({ ev, score, isAway }: { ev: HistoricalEvent; score: string; isAway: boolean }) {
  const icon = ev.type === 'ownGoal' ? '⚽' : '⚽'
  // For away games: Celtic is right column, opponent is left column
  const onLeft = isAway ? !ev.isCeltic : ev.isCeltic
  const content = (
    <div className="flex items-start gap-2" style={{ flexDirection: onLeft ? 'row-reverse' : 'row' }}>
      <span style={{ fontSize: '0.85rem', lineHeight: 1.5, flexShrink: 0 }}>{icon}</span>
      <div style={{ textAlign: onLeft ? 'right' : 'left' }}>
        <span style={{ fontSize: '0.82rem', color: ev.isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)' }}>
          {ev.player}
          {ev.type === 'ownGoal' && <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)' }}> (OG)</span>}
        </span>
      </div>
    </div>
  )
  return (
    <div className="grid items-center py-1.5" style={{ gridTemplateColumns: ROW_GRID }}>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>{onLeft ? content : null}</div>
      <div className="text-center">
        {ev.minute != null && (
          <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--color-ink-faint)' }}>{ev.minute}'</div>
        )}
        <div className="font-mono font-bold tabular-nums" style={{ fontSize: '0.78rem', color: 'var(--color-accent)' }}>{score}</div>
      </div>
      <div className="flex" style={{ justifyContent: 'flex-start' }}>{!onLeft ? content : null}</div>
    </div>
  )
}

function WikiCardRow({ ev, isAway }: { ev: HistoricalEvent; isAway: boolean }) {
  const icon = ev.type === 'redCard' ? '🟥' : '🟨'
  const onLeft = isAway ? !ev.isCeltic : ev.isCeltic
  const content = (
    <div className="flex items-center gap-2" style={{ flexDirection: onLeft ? 'row-reverse' : 'row' }}>
      <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '0.82rem', color: ev.isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)', textAlign: onLeft ? 'right' : 'left' }}>
        {ev.player}
      </span>
    </div>
  )
  return (
    <div className="grid items-center py-1" style={{ gridTemplateColumns: ROW_GRID }}>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>{onLeft ? content : null}</div>
      <div className="text-center font-mono" style={{ fontSize: '0.62rem', color: 'var(--color-ink-faint)' }}>
        {ev.minute != null ? `${ev.minute}'` : ''}
      </div>
      <div className="flex" style={{ justifyContent: 'flex-start' }}>{!onLeft ? content : null}</div>
    </div>
  )
}

export function WikiEventsDisplay({ events, celticName, opponentName, isAway = false }: {
  events: HistoricalEvent[]
  celticName: string
  opponentName: string
  isAway?: boolean
}) {
  if (!events.length) return null

  // Compute running score for goals — always in home–away order
  let celticGoals = 0, oppGoals = 0
  const scoreAtGoal = new Map<HistoricalEvent, string>()
  for (const ev of events) {
    if (ev.type === 'goal' || ev.type === 'ownGoal') {
      if ((ev.type === 'goal' && ev.isCeltic) || (ev.type === 'ownGoal' && !ev.isCeltic)) celticGoals++
      else oppGoals++
      // Score displayed as home–away: for home matches Celtic is home; for away matches opp is home
      scoreAtGoal.set(ev, isAway ? `${oppGoals}–${celticGoals}` : `${celticGoals}–${oppGoals}`)
    }
  }

  // Column headers: left is home team, right is away team
  const leftName = isAway ? opponentName : celticName
  const rightName = isAway ? celticName : opponentName

  return (
    <div className="rounded border px-3 py-1" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div className="flex justify-between pb-1 mb-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: '0.65rem', color: isAway ? 'var(--color-ink-muted)' : 'var(--color-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {leftName}
        </span>
        <span style={{ fontSize: '0.65rem', color: isAway ? 'var(--color-accent)' : 'var(--color-ink-muted)', fontWeight: isAway ? 600 : undefined, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {rightName}
        </span>
      </div>
      {events.map((ev, i) =>
        ev.type === 'goal' || ev.type === 'ownGoal'
          ? <WikiGoalRow key={i} ev={ev} score={scoreAtGoal.get(ev)!} isAway={isAway} />
          : <WikiCardRow key={i} ev={ev} isAway={isAway} />
      )}
    </div>
  )
}

export function WikiLineupsDisplay({ celtic, opponent }: {
  celtic: HistoricalLineup | null
  opponent: HistoricalLineup | null
}) {
  if (!celtic && !opponent) return (
    <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No lineup available for this match.</p>
  )
  return <LineupsTab celtic={celtic} opponent={opponent} />
}

function EventsTab({ events, celticName, opponentName, isAway }: {
  events: HistoricalEvent[]
  celticName: string
  opponentName: string
  isAway: boolean
}) {
  if (!events.length) {
    return <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No events recorded for this match.</p>
  }
  return <WikiEventsDisplay events={events} celticName={celticName} opponentName={opponentName} isAway={isAway} />
}

// Keys to completely hide from the Report tab
const SKIP_REPORT_KEYS = new Set([
  'trivia', 'review', 'teams', 'pictures', 'intro',
  'forum', 'motm', 'man_of_the_match', 'stats', 'statistics',
  'lineups', 'lineup', 'squads', 'squad', 'scorers',
])

// Keys that have digits but are actual content (press articles stored under score-string keys)
// Any key with a digit that isn't in SKIP_REPORT_KEYS goes into the Press section
function isPressKey(key: string) {
  return /\d/.test(key) && !SKIP_REPORT_KEYS.has(key)
}

const ARTICLE_STUB_RE = /^(match report|audio report|video|watch|listen|read more|see end of page|paradise report)/i

// Parse a block of article text into structured fields
interface ParsedArticle {
  title: string | null
  source: string | null
  author: string | null
  dateTime: string | null
  body: string
}

function parseArticleText(raw: string): ParsedArticle {
  const lines = cleanReportText(raw)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !ARTICLE_STUB_RE.test(l))

  if (!lines.length) return { title: null, source: null, author: null, dateTime: null, body: '' }

  let title: string | null = null
  let source: string | null = null
  let author: string | null = null
  let dateTime: string | null = null
  const bodyLines: string[] = []

  // The header block is the first few contiguous lines before body text begins.
  // Body text = longer lines (>120 chars) or lines that follow body text.
  let headerDone = false

  for (const line of lines) {
    if (headerDone) { bodyLines.push(line); continue }

    // Author line: starts with "By "
    if (/^by\s/i.test(line)) { author = line; continue }

    // Date line: starts with "Published" or has HH:MM time pattern
    if (/^published/i.test(line) || /\b\d{1,2}:\d{2}\b/.test(line)) {
      dateTime = line.replace(/^published\s+on\s+/i, '').trim()
      continue
    }

    // Title: first line, short enough, no trailing full-stop
    if (!title && line.length < 200 && !/\.\s*$/.test(line)) {
      title = line
      continue
    }

    // Source: short line after title, before author/date
    if (title && !source && !author && !dateTime && line.length < 80 && !/\.\s*$/.test(line)) {
      source = line
      continue
    }

    // Anything longer or that doesn't fit header structure → body begins
    headerDone = true
    bodyLines.push(line)
  }

  return { title, source, author, dateTime, body: bodyLines.join('\n\n') }
}

function ArticleCard({ article }: { article: ParsedArticle }) {
  if (!article.title && !article.body) return null
  const hasMeta = article.source || article.author || article.dateTime
  return (
    <div>
      {article.title && (
        <div className="mb-1" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-ink)', lineHeight: 1.35, overflowWrap: 'break-word' }}>
          {article.title}
        </div>
      )}
      {hasMeta && (
        <div className="mb-3 space-y-0.5">
          {article.source && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)', fontWeight: 600 }}>{article.source}</div>
          )}
          {article.author && (
            <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-faint)' }}>{article.author}</div>
          )}
          {article.dateTime && (
            <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-faint)' }}>{article.dateTime}</div>
          )}
        </div>
      )}
      {article.body && (
        <div className="report-prose" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          <ReactMarkdown>{article.body}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function ReportTab({ report }: { report: { sections: Record<string, string> } }) {
  const { sections } = report

  // Narrative keys shown as prose
  const narrativeKeys = ['trivia', 'review'].filter(k => sections[k])

  // Press: 'articles' key + any section key that contains digits (score-string headings)
  // These hold newspaper match reports saved under keys like "dunfermline_0_-_3_celtic:"
  const pressTexts: string[] = []
  if (sections.articles) {
    const cleaned = cleanReportText(sections.articles)
      .split('\n').filter(l => !ARTICLE_STUB_RE.test(l.trim())).join('\n').trim()
    if (cleaned) pressTexts.push(cleaned)
  }
  for (const k of Object.keys(sections)) {
    if (isPressKey(k) && sections[k]?.trim()) pressTexts.push(sections[k])
  }

  const pressArticles = pressTexts.map(parseArticleText).filter(a => a.title || a.body)

  if (!narrativeKeys.length && !pressArticles.length) return (
    <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No report text available.</p>
  )

  const labels: Record<string, string> = { trivia: 'Trivia', review: 'Match Report' }
  const sectionLabel = (key: string) => labels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-5">
      {narrativeKeys.map(key => (
        <div key={key}>
          <div className="mb-1.5" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>
            {sectionLabel(key)}
          </div>
          <div className="report-prose" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <ReactMarkdown>{sections[key]}</ReactMarkdown>
          </div>
        </div>
      ))}
      {pressArticles.length > 0 && (
        <div>
          <div className="mb-2" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)', fontWeight: 500 }}>
            Press
          </div>
          <div className="space-y-5">
            {pressArticles.map((article, i) => <ArticleCard key={i} article={article} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lineups tab ───────────────────────────────────────────────────────────────

function WikiPlayerRow({ player, isCeltic }: { player: HistoricalPlayer; isCeltic: boolean }) {
  const subbedOff = player.subbedOff != null
  return (
    <div className="flex items-center gap-2 py-1" style={{ opacity: subbedOff ? 0.6 : 1 }}>
      <div className="flex-1 min-w-0">
        <span style={{ fontSize: '0.82rem', color: isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)' }}>
          {player.name}
        </span>
        {player.subbedOff != null && (
          <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)', marginLeft: 4 }}>
            ↓ Off {player.subbedOff}'
          </span>
        )}
        {player.subbedOn != null && (
          <span style={{ fontSize: '0.68rem', color: 'var(--color-accent)', marginLeft: 4 }}>
            ↑ On {player.subbedOn}'
          </span>
        )}
      </div>
    </div>
  )
}

function WikiSectionHeading({ text }: { text: string }) {
  return (
    <div className="mt-3 mb-1" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-ink-faint)' }}>
      {text}
    </div>
  )
}

function LineupsTab({ celtic, opponent }: { celtic: HistoricalLineup | null; opponent: HistoricalLineup | null }) {
  if (!celtic && !opponent) {
    return <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.875rem' }}>No lineup data available for this match.</p>
  }

  const celticStarters  = celtic?.players.filter(p => p.starter) ?? []
  const celticSubsUsed  = celtic?.players.filter(p => !p.starter && p.subbedOn != null) ?? []
  const celticUnused    = celtic?.players.filter(p => !p.starter && p.subbedOn == null) ?? []
  const oppStarters     = opponent?.players.filter(p => p.starter) ?? []
  const oppSubsUsed     = opponent?.players.filter(p => !p.starter && p.subbedOn != null) ?? []
  const oppUnused       = opponent?.players.filter(p => !p.starter && p.subbedOn == null) ?? []

  return (
    <div>
      {/* Team headers */}
      <div className="grid grid-cols-2 gap-4">
        {[celtic, opponent].map((lu, i) => (
          <div key={i} className="flex items-center justify-between pb-1 mb-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: i === 0 ? 'var(--color-accent)' : 'var(--color-ink-muted)', fontWeight: 600 }}>
              {lu?.teamName ?? ''}
            </span>
          </div>
        ))}
      </div>

      {/* Starters */}
      <div className="grid grid-cols-2 gap-4">
        <div>{celticStarters.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic />)}</div>
        <div>{oppStarters.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic={false} />)}</div>
      </div>

      {/* Substitutes used */}
      {(celticSubsUsed.length > 0 || oppSubsUsed.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            {celticSubsUsed.length > 0 && <WikiSectionHeading text="Substitutes used" />}
            {celticSubsUsed.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic />)}
          </div>
          <div>
            {oppSubsUsed.length > 0 && <WikiSectionHeading text="Substitutes used" />}
            {oppSubsUsed.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic={false} />)}
          </div>
        </div>
      )}

      {/* Unused */}
      {(celticUnused.length > 0 || oppUnused.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            {celticUnused.length > 0 && <WikiSectionHeading text="Unused" />}
            {celticUnused.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic />)}
          </div>
          <div>
            {oppUnused.length > 0 && <WikiSectionHeading text="Unused" />}
            {oppUnused.map((p, i) => <WikiPlayerRow key={i} player={p} isCeltic={false} />)}
          </div>
        </div>
      )}
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

type Tab = 'events' | 'lineups' | 'report' | 'pictures' | 'notes'

function MatchTabs({ match, parsed, notes }: {
  match: HistoricalMatch
  parsed: ReturnType<typeof parseTeamsSection>
  notes: MatchNotes
}) {
  const hasPictures = (match.pictures?.length ?? 0) > 0
  const hasReport = !!(match.report?.sections && (
    match.report.sections.review ||
    match.report.sections.trivia ||
    Object.keys(match.report.sections).some(k => isPressKey(k) && match.report!.sections[k]?.trim()) ||
    (match.report.sections.articles && match.report.sections.articles.trim().length > 30)
  ))
  const [tab, setTab] = useState<Tab>('events')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'lineups', label: 'Lineups' },
    ...(hasReport ? [{ key: 'report' as Tab, label: 'Report' }] : []),
    { key: 'pictures', label: hasPictures ? `Pictures (${match.pictures.length})` : 'Pictures' },
    { key: 'notes', label: 'Notes' },
  ]

  const celticName = match.home === 'Celtic' ? match.home : match.away
  const oppName    = match.home === 'Celtic' ? match.away : match.home

  return (
    <div className="mt-4">
      <div className="flex flex-wrap" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
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
        {tab === 'events' && <EventsTab events={parsed.events} celticName={celticName} opponentName={oppName} isAway={match.home !== 'Celtic'} />}
        {tab === 'lineups' && <LineupsTab celtic={parsed.celticLineup} opponent={parsed.opponentLineup} />}
        {tab === 'report' && match.report && <ReportTab report={match.report} />}
        {tab === 'pictures' && <PicturesTab pictures={match.pictures ?? []} pictureUrl={match.pictureUrl} />}
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
  const { isFavourited, toggle: toggleFav } = useFavourites()

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

  const parsed = parseTeamsSection(buildTeamsText(match.report?.sections ?? {}))
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
          <div className="flex items-center gap-2 ml-auto">
            <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}>
              {venue === 'H' ? 'Celtic Park' : 'Away'}
            </span>
            <button
              onClick={() => toggleFav({
                id: `hist:${match.slug}`,
                date: match.date,
                home: match.home,
                away: match.away,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                competition: match.competition,
                path: `/history/match/${encodeURIComponent(match.slug)}`,
              })}
              className="border-none cursor-pointer p-0 flex items-center"
              style={{ background: 'none', color: isFavourited(`hist:${match.slug}`) ? 'var(--color-draw)' : 'var(--color-ink-faint)', lineHeight: 1 }}
              aria-label={isFavourited(`hist:${match.slug}`) ? 'Remove from starred' : 'Add to starred'}
            >
              <Star size={14} fill={isFavourited(`hist:${match.slug}`) ? 'currentColor' : 'none'} strokeWidth={1.5} />
            </button>
          </div>
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
