import type { Competition } from '../types'

const CONFIG: Record<Competition, { label: string; color: string; bg: string }> = {
  'Scottish Premiership':      { label: 'Premiership',     color: 'var(--color-comp-prem)',    bg: 'rgba(26,92,34,0.08)' },
  'League Cup':                { label: 'League Cup',      color: 'var(--color-comp-lc)',      bg: 'rgba(92,58,0,0.08)' },
  'Scottish Cup':              { label: 'Scottish Cup',    color: 'var(--color-comp-sc)',      bg: 'rgba(58,26,92,0.08)' },
  'Europa League':             { label: 'Europa League',   color: 'var(--color-comp-el)',      bg: 'rgba(26,58,92,0.08)' },
  'Europa Conference League':  { label: 'Conference',      color: 'var(--color-comp-ecl)',     bg: 'rgba(26,92,80,0.08)' },
  'Champions League':          { label: 'Champions Lg',   color: 'var(--color-comp-ucl)',     bg: 'rgba(10,42,92,0.08)' },
  'Friendly':                  { label: 'Friendly',        color: 'var(--color-comp-friendly)',bg: 'rgba(92,80,64,0.08)' },
}

export function CompetitionBadge({ competition }: { competition: Competition }) {
  const cfg = CONFIG[competition]
  return (
    <span
      className="inline-block text-xs font-medium tracking-wider px-2 py-0.5 rounded"
      style={{
        color: cfg.color,
        backgroundColor: cfg.bg,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        fontSize: '0.7rem',
      }}
    >
      {cfg.label}
    </span>
  )
}
