import { Link } from 'react-router-dom'
import { MapPin, ChevronRight } from 'lucide-react'
import type { MatchEntry } from '../types'
import { CompetitionBadge } from './CompetitionBadge'

function formatDate(iso: string) {
  const d = new Date(iso)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: d.toLocaleDateString('en-GB', { day: 'numeric' }),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }
}

function formatShortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function ResultScore({ match }: { match: MatchEntry }) {
  if (match.phase !== 'post' || match.celticScore === undefined) {
    const { time } = formatDate(match.kickoff)
    return (
      <span className="text-sm tabular-nums" style={{ color: 'var(--color-ink-muted)' }}>
        {time}
      </span>
    )
  }
  const pens = match.penalties
  const win = pens ? pens.celtic > pens.opponent : match.celticScore > match.opponentScore!
  const draw = !pens && match.celticScore === match.opponentScore
  const color = win
    ? 'var(--color-win)'
    : draw
    ? 'var(--color-draw)'
    : 'var(--color-loss)'
  const homeScore = match.venue === 'A' ? match.opponentScore : match.celticScore
  const awayScore = match.venue === 'A' ? match.celticScore : match.opponentScore
  const homePens = pens && (match.venue === 'A' ? pens.opponent : pens.celtic)
  const awayPens = pens && (match.venue === 'A' ? pens.celtic : pens.opponent)
  return (
    <span className="text-right">
      <span
        className="text-lg font-bold font-mono tabular-nums"
        style={{ color }}
      >
        {homeScore}–{awayScore}
      </span>
      {pens && (
        <span
          className="block font-mono tabular-nums"
          style={{ color: 'var(--color-ink-faint)', fontSize: '0.65rem' }}
        >
          ({homePens}–{awayPens} pens)
        </span>
      )}
    </span>
  )
}

export function FixtureCard({ match, isLast }: { match: MatchEntry; isLast: boolean }) {
  const { weekday, day, month } = formatDate(match.kickoff)
  const isPast = match.phase === 'post'

  return (
    <div className="flex gap-3">
      {/* Date column */}
      <div
        className="flex-shrink-0 text-right pt-4"
        style={{ width: 48, color: 'var(--color-ink-muted)', fontSize: '0.75rem' }}
      >
        <div className="uppercase tracking-wider" style={{ fontSize: '0.65rem' }}>{weekday}</div>
        <div
          className="font-bold leading-none mt-0.5"
          style={{ fontSize: '1.25rem', color: 'var(--color-ink-secondary)' }}
        >
          {day}
        </div>
        <div>{month}</div>
      </div>

      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0 pt-4" style={{ width: 18 }}>
        <div
          className="w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 mt-1"
          style={{
            borderColor: isPast ? 'var(--color-accent)' : 'var(--color-border)',
            backgroundColor: isPast ? 'var(--color-accent)' : 'var(--color-surface)',
          }}
        />
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ backgroundColor: 'var(--color-border-subtle)', minHeight: 20 }}
          />
        )}
      </div>

      {/* Card */}
      <Link
        to={`/match/${match.id}`}
        className="flex-1 mb-3 no-underline"
        style={{ textDecoration: 'none' }}
      >
        <div
          className="rounded-lg border px-4 py-3 transition-all duration-150 cursor-pointer group"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.borderColor = 'var(--color-ink-muted)'
            el.style.backgroundColor = 'var(--color-surface-hover)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.borderColor = 'var(--color-border)'
            el.style.backgroundColor = 'var(--color-surface)'
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <CompetitionBadge competition={match.competition} />
                {match.round && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--color-ink-muted)',
                      fontVariant: 'small-caps',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {match.round}
                  </span>
                )}
                <span
                  className="flex items-center gap-1 text-xs ml-auto"
                  style={{ color: 'var(--color-ink-faint)', fontSize: '0.7rem' }}
                >
                  <MapPin size={10} />
                  {match.stadiumName ?? (match.venue === 'H' ? 'Celtic Park' : match.venue === 'A' ? 'Away' : 'Neutral')}
                </span>
              </div>
              <div
                className="font-journal leading-snug"
                style={{ color: 'var(--color-ink)', fontSize: '1rem' }}
              >
                {match.venue === 'A' ? (
                  <>{match.opponent} <span style={{ color: 'var(--color-ink-muted)' }}>vs</span> Celtic</>
                ) : (
                  <>Celtic <span style={{ color: 'var(--color-ink-muted)' }}>vs</span> {match.opponent}</>
                )}
              </div>
              {match.rescheduledFrom && (
                <p
                  className="text-sm leading-relaxed mt-1 mb-0"
                  style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem', fontStyle: 'italic' }}
                >
                  Postponed from {formatShortDate(match.rescheduledFrom.date)} — {match.rescheduledFrom.reason}
                </p>
              )}
              {match.notes && (
                <p
                  className="text-sm leading-relaxed line-clamp-1 mt-1 m-0"
                  style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}
                >
                  {match.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <ResultScore match={match} />
              <ChevronRight
                size={14}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-ink-muted)' }}
              />
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
