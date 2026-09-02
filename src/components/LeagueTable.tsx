import type { TableRow } from '../types'

interface Props {
  rows: TableRow[]
  highlightTeam?: string
  secondaryHighlight?: string
  compact?: boolean
  positionChanges?: Map<string, number>
}

export function LeagueTable({ rows, highlightTeam = 'Celtic', secondaryHighlight, compact = false, positionChanges }: Props) {
  return (
    <div
      className="rounded border overflow-hidden text-sm"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center px-3 py-1.5 border-b"
        style={{
          backgroundColor: 'var(--color-surface-raised)',
          borderColor: 'var(--color-border-subtle)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-ink-faint)',
        }}
      >
        <span style={{ width: 20, textAlign: 'center' }}>#</span>
        <span className="flex-1 ml-2">Team</span>
        <span style={{ width: compact ? 22 : 26, textAlign: 'center' }}>P</span>
        {!compact && <>
          <span style={{ width: 26, textAlign: 'center' }}>W</span>
          <span style={{ width: 26, textAlign: 'center' }}>D</span>
          <span style={{ width: 26, textAlign: 'center' }}>L</span>
        </>}
        <span style={{ width: compact ? 26 : 30, textAlign: 'center' }}>GF</span>
        <span style={{ width: compact ? 26 : 30, textAlign: 'center' }}>GA</span>
        <span style={{ width: compact ? 28 : 32, textAlign: 'center' }}>GD</span>
        <span style={{ width: compact ? 28 : 32, textAlign: 'center' }}>Pts</span>
      </div>

      {rows.map((row, i) => {
        const isHighlighted = row.team === highlightTeam
        const isSecondary = !isHighlighted && row.team === secondaryHighlight
        const borderTop = i > 0 ? `1px solid var(--color-border-subtle)` : 'none'
        const delta = positionChanges?.get(row.team)
        const displayName = row.team === 'Heart of Midlothian' ? 'Hearts' : row.team

        return (
          <div
            key={row.team}
            className="flex items-center px-3 py-2"
            style={{
              borderTop,
              backgroundColor: isHighlighted
                ? 'var(--color-accent-faint, #f0f7f0)'
                : isSecondary
                ? 'var(--color-surface-raised, rgba(128,128,128,0.06))'
                : 'transparent',
              fontWeight: isHighlighted || isSecondary ? 600 : 400,
            }}
          >
            {/* Position + change indicator */}
            <div style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: isHighlighted ? 'var(--color-accent)' : isSecondary ? 'var(--color-ink-muted)' : 'var(--color-ink-muted)',
                  fontWeight: isHighlighted ? 700 : 400,
                }}
              >
                {row.position}
              </span>
            </div>

            {/* Team name + movement arrow */}
            <div className="flex-1 ml-2 flex items-center gap-1 min-w-0">
              <span
                className="truncate"
                style={{
                  fontSize: '0.8rem',
                  color: isHighlighted ? 'var(--color-accent)' : isSecondary ? 'var(--color-ink)' : 'var(--color-ink)',
                }}
              >
                {displayName}
              </span>
              {delta != null && delta !== 0 && (
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    color: delta > 0 ? 'var(--color-win)' : 'var(--color-loss)',
                  }}
                >
                  {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                </span>
              )}
            </div>

            <Cell value={row.played} width={compact ? 22 : 26} muted />
            {!compact && <>
              <Cell value={row.won} width={26} muted />
              <Cell value={row.drawn} width={26} muted />
              <Cell value={row.lost} width={26} muted />
            </>}
            <Cell value={row.goalsFor} width={compact ? 26 : 30} muted />
            <Cell value={row.goalsAgainst} width={compact ? 26 : 30} muted />
            <Cell value={row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference} width={compact ? 28 : 32} muted />
            <Cell value={row.points} width={compact ? 28 : 32} bold highlight={isHighlighted} />
          </div>
        )
      })}
    </div>
  )
}

function Cell({
  value,
  width,
  muted,
  bold,
  highlight,
}: {
  value: string | number
  width: number
  muted?: boolean
  bold?: boolean
  highlight?: boolean
}) {
  return (
    <span
      className="font-mono tabular-nums"
      style={{
        width,
        textAlign: 'center',
        fontSize: '0.78rem',
        flexShrink: 0,
        color: highlight
          ? 'var(--color-accent)'
          : muted
          ? 'var(--color-ink-muted)'
          : 'var(--color-ink-secondary)',
        fontWeight: bold ? 700 : 400,
      }}
    >
      {value}
    </span>
  )
}
