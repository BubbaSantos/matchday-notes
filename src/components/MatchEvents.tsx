import type { SSMatchData, SSIncident } from '../types'

// ── Stat display keys from Sofascore ─────────────────────────────────────────

const STAT_KEYS: string[] = [
  'Expected goals',
  'Total shots',
  'Shots on target',
  'Ball possession',
  'Corner kicks',
  'Yellow cards',
  'Red cards',
  'Goalkeeper saves',
  'Fouls',
  'Offsides',
  'Passes',
  'Accurate passes',
  'Big chances',
]

function StatBar({
  label,
  homeVal,
  awayVal,
  isCelticHome,
}: {
  label: string
  homeVal: string
  awayVal: string
  isCelticHome: boolean
}) {
  const celticVal = isCelticHome ? homeVal : awayVal
  const oppVal = isCelticHome ? awayVal : homeVal

  const toNum = (v: string) => parseFloat(v.replace('%', ''))
  const cn = toNum(celticVal)
  const on = toNum(oppVal)
  const total = cn + on
  const celticPct = total > 0 ? (cn / total) * 100 : 50
  const isXG = label === 'Expected goals'

  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1" style={{ fontSize: '0.72rem' }}>
        <span style={{ color: 'var(--color-accent)', fontWeight: isXG ? 700 : 600 }}>
          {celticVal}
        </span>
        <span
          style={{
            color: 'var(--color-ink-faint)',
            textTransform: 'uppercase',
            fontSize: '0.62rem',
            letterSpacing: '0.06em',
            fontWeight: isXG ? 600 : 400,
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--color-ink-muted)' }}>{oppVal}</span>
      </div>
      {total > 0 && (
        <div
          className="flex rounded overflow-hidden"
          style={{ height: 4, backgroundColor: 'var(--color-border-subtle)' }}
        >
          <div
            style={{
              width: `${celticPct}%`,
              backgroundColor: 'var(--color-accent)',
              opacity: 0.7,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Incident timeline ─────────────────────────────────────────────────────────

function minuteStr(inc: SSIncident) {
  if (inc.addedTime) return `${inc.minute}+${inc.addedTime}'`
  return `${inc.minute}'`
}

function GoalRow({ inc, isCelticHome }: { inc: SSIncident; isCelticHome: boolean }) {
  const isCeltic = isCelticHome ? inc.isHome : !inc.isHome
  const isPen = inc.scoringType === 'penalty' || inc.incidentClass === 'penalty'
  const isOG = inc.incidentClass === 'ownGoal'

  return (
    <div
      className="flex items-start gap-2 py-1.5"
      style={{ flexDirection: isCeltic ? 'row' : 'row-reverse' }}
    >
      <span
        className="font-mono flex-shrink-0 pt-0.5"
        style={{
          fontSize: '0.7rem',
          color: 'var(--color-ink-faint)',
          width: 34,
          textAlign: isCeltic ? 'left' : 'right',
        }}
      >
        {minuteStr(inc)}
      </span>
      <span style={{ fontSize: '0.85rem', lineHeight: 1.5, flexShrink: 0 }}>
        {'⚽'}
      </span>
      <div style={{ flex: 1, textAlign: isCeltic ? 'left' : 'right' }}>
        <span
          style={{
            fontSize: '0.82rem',
            color: isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)',
          }}
        >
          {inc.player ?? ''}
          {isPen && <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)' }}> (pen)</span>}
          {isOG && <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)' }}> (OG)</span>}
        </span>
        {inc.assist && (
          <div style={{ fontSize: '0.7rem', color: 'var(--color-ink-faint)', marginTop: 1 }}>
            Assist: {inc.assist}
          </div>
        )}
      </div>
    </div>
  )
}

function CardRow({ inc, isCelticHome }: { inc: SSIncident; isCelticHome: boolean }) {
  const isCeltic = isCelticHome ? inc.isHome : !inc.isHome
  const isRed = inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed'
  const icon = isRed ? '🟥' : '🟨'

  return (
    <div
      className="flex items-center gap-2 py-1"
      style={{ flexDirection: isCeltic ? 'row' : 'row-reverse' }}
    >
      <span
        className="font-mono flex-shrink-0"
        style={{
          fontSize: '0.7rem',
          color: 'var(--color-ink-faint)',
          width: 34,
          textAlign: isCeltic ? 'left' : 'right',
        }}
      >
        {minuteStr(inc)}
      </span>
      <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          fontSize: '0.82rem',
          color: isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)',
          flex: 1,
          textAlign: isCeltic ? 'left' : 'right',
        }}
      >
        {inc.player ?? ''}
      </span>
    </div>
  )
}

interface Props {
  data: SSMatchData
  opponentName: string
}

export function MatchEvents({ data, opponentName }: Props) {
  const isCelticHome = data.homeTeamName === 'Celtic'
  const celticLabel = 'Celtic'
  const oppLabel = opponentName

  const displayIncidents = data.incidents.filter(
    (i) => i.type === 'goal' || i.type === 'card'
  )

  // Find stats to show
  const statIndex = new Map(data.stats.map((s) => [s.name, s]))
  const visibleStats = STAT_KEYS.map((k) => statIndex.get(k)).filter(Boolean) as typeof data.stats

  return (
    <div className="space-y-5">
      {/* Incident timeline */}
      {displayIncidents.length > 0 && (
        <div>
          <div
            className="mb-2"
            style={{
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-ink-faint)',
              fontWeight: 500,
            }}
          >
            Timeline
          </div>
          <div
            className="rounded border px-3 py-1"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div
              className="flex justify-between pb-1 mb-1"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <span
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--color-accent)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {celticLabel}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--color-ink-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {oppLabel}
              </span>
            </div>
            {displayIncidents.map((inc, i) =>
              inc.type === 'goal' ? (
                <GoalRow key={i} inc={inc} isCelticHome={isCelticHome} />
              ) : (
                <CardRow key={i} inc={inc} isCelticHome={isCelticHome} />
              )
            )}
          </div>
        </div>
      )}

      {/* Stats bars */}
      {visibleStats.length > 0 && (
        <div>
          <div
            className="mb-3"
            style={{
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-ink-faint)',
              fontWeight: 500,
            }}
          >
            Stats
          </div>
          <div
            className="rounded border px-4 py-3"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            {visibleStats.map((s) => (
              <StatBar
                key={s.name}
                label={s.name}
                homeVal={s.home}
                awayVal={s.away}
                isCelticHome={isCelticHome}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
