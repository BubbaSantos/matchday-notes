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
// Two-column layout (Celtic / opponent) with a shared center gutter — minute
// for every row, plus the running score for goals, so the score-at-the-time
// reads naturally as you scan down the chronological list.

function minuteStr(inc: SSIncident) {
  if (inc.addedTime) return `${inc.minute}+${inc.addedTime}'`
  return `${inc.minute}'`
}

const ROW_GRID_COLUMNS = '1fr 52px 1fr'

function GoalRow({ inc, isCelticHome, score }: { inc: SSIncident; isCelticHome: boolean; score: string }) {
  const isCeltic = isCelticHome ? inc.isHome : !inc.isHome
  const isPen = inc.scoringType === 'penalty' || inc.incidentClass === 'penalty'
  const isOG = inc.incidentClass === 'ownGoal'

  const content = (
    <div
      className="flex items-start gap-2"
      style={{ flexDirection: isCeltic ? 'row-reverse' : 'row' }}
    >
      <span style={{ fontSize: '0.85rem', lineHeight: 1.5, flexShrink: 0 }}>⚽</span>
      <div style={{ textAlign: isCeltic ? 'right' : 'left' }}>
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

  return (
    <div className="grid items-center py-1.5" style={{ gridTemplateColumns: ROW_GRID_COLUMNS }}>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>{isCeltic ? content : null}</div>
      <div className="text-center">
        <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--color-ink-faint)' }}>
          {minuteStr(inc)}
        </div>
        <div className="font-mono font-bold tabular-nums" style={{ fontSize: '0.78rem', color: 'var(--color-accent)' }}>
          {score}
        </div>
      </div>
      <div className="flex" style={{ justifyContent: 'flex-start' }}>{!isCeltic ? content : null}</div>
    </div>
  )
}

function CardRow({ inc, isCelticHome }: { inc: SSIncident; isCelticHome: boolean }) {
  const isCeltic = isCelticHome ? inc.isHome : !inc.isHome
  const isRed = inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed'
  const icon = isRed ? '🟥' : '🟨'

  const content = (
    <div
      className="flex items-center gap-2"
      style={{ flexDirection: isCeltic ? 'row-reverse' : 'row' }}
    >
      <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          fontSize: '0.82rem',
          color: isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)',
          textAlign: isCeltic ? 'right' : 'left',
        }}
      >
        {inc.player ?? ''}
      </span>
    </div>
  )

  return (
    <div className="grid items-center py-1" style={{ gridTemplateColumns: ROW_GRID_COLUMNS }}>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>{isCeltic ? content : null}</div>
      <div className="text-center font-mono" style={{ fontSize: '0.62rem', color: 'var(--color-ink-faint)' }}>
        {minuteStr(inc)}
      </div>
      <div className="flex" style={{ justifyContent: 'flex-start' }}>{!isCeltic ? content : null}</div>
    </div>
  )
}

interface Props {
  data: SSMatchData
  opponentName: string
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <p className="text-center py-10 m-0" style={{ color: 'var(--color-ink-faint)', fontSize: '0.85rem' }}>
      {text}
    </p>
  )
}

export function MatchIncidents({ data, opponentName }: Props) {
  const isCelticHome = data.homeTeamName === 'Celtic'

  // Chronological (kickoff to full time), so the running score reads
  // naturally as you scan down — first goal, then an equaliser, etc.
  const displayIncidents = data.incidents
    .filter((i) => i.type === 'goal' || i.type === 'card')
    .sort((a, b) => (a.minute + (a.addedTime ?? 0) / 100) - (b.minute + (b.addedTime ?? 0) / 100))

  if (displayIncidents.length === 0) {
    return <EmptyPanel text="No goals or cards to show yet." />
  }

  // Running score at the time of each goal.
  const scoreAtGoal = new Map<SSIncident, string>()
  let celticGoals = 0
  let oppGoals = 0
  for (const inc of displayIncidents) {
    if (inc.type !== 'goal') continue
    if (isCelticHome ? inc.isHome : !inc.isHome) celticGoals++
    else oppGoals++
    scoreAtGoal.set(inc, `${celticGoals}–${oppGoals}`)
  }

  return (
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
          Celtic
        </span>
        <span
          style={{
            fontSize: '0.65rem',
            color: 'var(--color-ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {opponentName}
        </span>
      </div>
      {displayIncidents.map((inc, i) =>
        inc.type === 'goal' ? (
          <GoalRow key={i} inc={inc} isCelticHome={isCelticHome} score={scoreAtGoal.get(inc)!} />
        ) : (
          <CardRow key={i} inc={inc} isCelticHome={isCelticHome} />
        )
      )}
    </div>
  )
}

export function MatchStats({ data }: { data: SSMatchData }) {
  const isCelticHome = data.homeTeamName === 'Celtic'
  const statIndex = new Map(data.stats.map((s) => [s.name, s]))
  const visibleStats = STAT_KEYS.map((k) => statIndex.get(k)).filter(Boolean) as typeof data.stats

  if (visibleStats.length === 0) {
    return <EmptyPanel text="No stats to show yet." />
  }

  return (
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
  )
}
