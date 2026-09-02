import { useState, useMemo } from 'react'
import type { SSMatchData, SSIncident, SSPlayer } from '../types'

// ── Per-player event badges ───────────────────────────────────────────────────

type PlayerEvents = {
  goals: number
  ownGoals: number
  yellowCards: number
  redCard: boolean
}

function buildPlayerEventMap(incidents: SSIncident[]): Map<string, PlayerEvents> {
  const map = new Map<string, PlayerEvents>()
  const get = (name: string) => {
    if (!map.has(name)) map.set(name, { goals: 0, ownGoals: 0, yellowCards: 0, redCard: false })
    return map.get(name)!
  }
  for (const inc of incidents) {
    if (!inc.player) continue
    if (inc.type === 'goal') {
      const ev = get(inc.player)
      if (inc.incidentClass === 'ownGoal') ev.ownGoals++
      else ev.goals++
    } else if (inc.type === 'card') {
      const ev = get(inc.player)
      if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') ev.redCard = true
      else ev.yellowCards++
    }
  }
  return map
}

function PlayerBadges({ ev }: { ev: PlayerEvents }) {
  const badges: string[] = []
  for (let i = 0; i < ev.goals; i++) badges.push('⚽')
  for (let i = 0; i < ev.ownGoals; i++) badges.push('⚽(OG)')
  for (let i = 0; i < ev.yellowCards; i++) badges.push('🟨')
  if (ev.redCard) badges.push('🟥')
  if (badges.length === 0) return null
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {badges.map((b, i) => (
        <span key={i} style={{ fontSize: '0.7rem', lineHeight: 1 }}>{b}</span>
      ))}
    </span>
  )
}

// ── Per-player stat definitions ───────────────────────────────────────────────

type StatDef = { key: string; label: string; format?: (v: number) => string }

const fmt1 = (v: number) => v.toFixed(1)
const fmtKm = (v: number) => `${v.toFixed(1)} km`
const fmtKph = (v: number) => `${v.toFixed(1)} km/h`
const fmtPct = (acc: string, tot: string) =>
  (s: Record<string, number>) => {
    const a = s[acc] ?? 0
    const t = s[tot] ?? 0
    return t > 0 ? `${a}/${t} (${Math.round((a / t) * 100)}%)` : `0`
  }

const OUTFIELD_STATS: Array<StatDef | { label: string; derived: (s: Record<string, number>) => string }> = [
  { key: 'rating',             label: 'Rating',          format: fmt1 },
  { key: 'minutesPlayed',      label: 'Minutes' },
  { key: 'touches',            label: 'Touches' },
  { label: 'Passes',           derived: fmtPct('accuratePass', 'totalPass') },
  { key: 'keyPass',            label: 'Key passes' },
  { key: 'expectedAssists',    label: 'xA',              format: (v) => v.toFixed(2) },
  { key: 'totalShots',         label: 'Shots' },
  { key: 'goalAssist',         label: 'Assists' },
  { label: 'Duels',            derived: (s) => {
    const w = s.duelWon ?? 0; const l = s.duelLost ?? 0
    return `${w}W / ${l}L`
  }},
  { key: 'totalTackle',        label: 'Tackles' },
  { key: 'interceptionWon',    label: 'Interceptions' },
  { key: 'totalClearance',     label: 'Clearances' },
  { label: 'Aerial',           derived: (s) => {
    const w = s.aerialWon ?? 0; const l = s.aerialLost ?? 0
    return `${w}W / ${l}L`
  }},
  { label: 'Crosses',          derived: fmtPct('accurateCross', 'totalCross') },
  { key: 'bigChanceCreated',   label: 'Big chances created' },
  { key: 'wasFouled',          label: 'Fouled' },
  { key: 'fouls',              label: 'Fouls committed' },
  { key: 'kilometersCovered',  label: 'Distance',        format: fmtKm },
  { key: 'topSpeed',           label: 'Top speed',        format: fmtKph },
  { key: 'numberOfSprints',    label: 'Sprints' },
]

const GK_STATS: Array<StatDef | { label: string; derived: (s: Record<string, number>) => string }> = [
  { key: 'rating',                      label: 'Rating',          format: fmt1 },
  { key: 'minutesPlayed',               label: 'Minutes' },
  { key: 'touches',                     label: 'Touches' },
  { key: 'saves',                       label: 'Saves' },
  { key: 'savedShotsFromInsideTheBox',  label: 'Saves (in box)' },
  { key: 'goalsPrevented',              label: 'Goals prevented', format: fmt1 },
  { key: 'totalClearance',              label: 'Clearances' },
  { key: 'punches',                     label: 'Punches' },
  { label: 'Passes',                    derived: fmtPct('accuratePass', 'totalPass') },
  { key: 'kilometersCovered',           label: 'Distance',        format: fmtKm },
  { key: 'topSpeed',                    label: 'Top speed',        format: fmtKph },
]

function formatStat(
  def: StatDef | { label: string; derived: (s: Record<string, number>) => string },
  stats: Record<string, number>
): string | null {
  if ('derived' in def) {
    const v = def.derived(stats)
    return v === '0' || v === '0W / 0L' || v === '0/0 (0%)' ? null : v
  }
  const raw = stats[def.key]
  if (raw == null || raw === 0) return null
  return def.format ? def.format(raw) : String(raw)
}

// ── Player stat panel ─────────────────────────────────────────────────────────

function PlayerStats({ player }: { player: SSPlayer }) {
  const s = player.statistics ?? {}
  const isGK = player.position === 'G'
  const defs = isGK ? GK_STATS : OUTFIELD_STATS

  const rows: { label: string; value: string }[] = []
  for (const def of defs) {
    const v = formatStat(def, s)
    if (v) rows.push({ label: def.label, value: v })
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: '0.7rem', color: 'var(--color-ink-faint)', padding: '6px 0' }}>
        No stats available
      </div>
    )
  }

  return (
    <div
      className="rounded mt-1 mb-1 px-3 py-2"
      style={{
        backgroundColor: 'var(--color-surface-raised, var(--color-surface))',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-2">
            <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)' }}>{label}</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-ink)', fontWeight: 600, fontFamily: 'monospace' }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Player row ────────────────────────────────────────────────────────────────

function PlayerRow({ player, isCeltic, eventMap }: { player: SSPlayer; isCeltic: boolean; eventMap: Map<string, PlayerEvents> }) {
  const ev = eventMap.get(player.shortName)
  const [expanded, setExpanded] = useState(false)
  const subbedOff = !!player.replacedBy
  const hasStats = player.statistics && Object.keys(player.statistics).length > 0

  let subDetail: string | null = null
  if (player.subbedInAt != null) {
    const min = `${player.subbedInAt}${player.subbedInAddedTime ? `+${player.subbedInAddedTime}` : ''}'`
    subDetail = `↑ On ${min}${player.replacedPlayer ? ` for ${player.replacedPlayer}` : ''}`
  } else if (player.replacedBy && player.replacedByAt != null) {
    const min = `${player.replacedByAt}${player.replacedByAddedTime ? `+${player.replacedByAddedTime}` : ''}'`
    subDetail = `↓ Off ${min} for ${player.replacedBy}`
  }

  return (
    <div style={{ opacity: subbedOff ? 0.6 : 1 }}>
      <button
        onClick={() => hasStats && setExpanded((e) => !e)}
        className="w-full border-none p-0 text-left"
        style={{
          background: 'none',
          cursor: hasStats ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        <div className="flex items-center gap-2 py-1">
          {/* Jersey number */}
          <span
            className="font-mono flex-shrink-0"
            style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)', width: 20, textAlign: 'right' }}
          >
            {player.jerseyNumber}
          </span>

          {/* Name + sub detail */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span
                style={{
                  fontSize: '0.82rem',
                  color: isCeltic ? 'var(--color-ink)' : 'var(--color-ink-secondary)',
                  fontWeight: player.captain ? 600 : 400,
                }}
              >
                {player.shortName}
                {player.captain && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', marginLeft: 3 }}>(C)</span>
                )}
              </span>
              {ev && <PlayerBadges ev={ev} />}
            </div>
            {subDetail && (
              <div
                style={{
                  fontSize: '0.68rem',
                  color: player.subbedInAt != null ? 'var(--color-accent)' : 'var(--color-ink-faint)',
                  marginTop: 1,
                  opacity: 0.85,
                }}
              >
                {subDetail}
              </div>
            )}
          </div> {/* flex-1 name block */}

          {/* Rating */}
          {player.rating && (
            <span
              style={{
                fontSize: '0.68rem',
                color: parseFloat(player.rating) >= 7.5 ? 'var(--color-accent)' : 'var(--color-ink-faint)',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {player.rating}
            </span>
          )}

          {/* Expand chevron */}
          {hasStats && (
            <span
              style={{
                fontSize: '0.6rem',
                color: 'var(--color-ink-faint)',
                flexShrink: 0,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            >
              ▾
            </span>
          )}
        </div>
      </button>

      {expanded && <PlayerStats player={player} />}
    </div>
  )
}

// ── Lineup side ───────────────────────────────────────────────────────────────
// Split into separate row-aligned sections (header, manager, starters, subs
// used, unused) rather than one continuous column per team — otherwise
// "Substitutes used" / "Unused" headings drift out of alignment between the
// two columns whenever the squads' list lengths differ.

function LineupHeader({ label, formation, isCeltic }: { label: string; formation: string; isCeltic: boolean }) {
  return (
    <div
      className="flex items-center justify-between mb-1 pb-1"
      style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
    >
      <span
        style={{
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: isCeltic ? 'var(--color-accent)' : 'var(--color-ink-muted)',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {formation && (
        <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)', fontFamily: 'monospace' }}>
          {formation}
        </span>
      )}
    </div>
  )
}

function LineupManager({ manager }: { manager?: string }) {
  if (!manager) return <div />
  return (
    <div className="mb-2" style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)' }}>
      Mgr: {manager}
    </div>
  )
}

function LineupSectionHeading({ text }: { text: string }) {
  return (
    <div
      className="mt-3 mb-1"
      style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-ink-faint)' }}
    >
      {text}
    </div>
  )
}

function LineupPlayerList({
  players,
  isCeltic,
  eventMap,
}: {
  players: SSPlayer[]
  isCeltic: boolean
  eventMap: Map<string, PlayerEvents>
}) {
  return (
    <>
      {players.map((p) => (
        <PlayerRow key={p.shortName} player={p} isCeltic={isCeltic} eventMap={eventMap} />
      ))}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function Lineups({ data }: { data: SSMatchData }) {
  const isCelticHome = data.homeTeamName === 'Celtic'
  const celticLineup = isCelticHome ? data.homeLineup : data.awayLineup
  const oppLineup = isCelticHome ? data.awayLineup : data.homeLineup
  const oppName = isCelticHome ? data.awayTeamName : data.homeTeamName
  const celticManager = isCelticHome ? data.homeManager : data.awayManager
  const oppManager = isCelticHome ? data.awayManager : data.homeManager

  const eventMap = useMemo(() => buildPlayerEventMap(data.incidents), [data.incidents])

  const celticStarters = celticLineup.players.filter((p) => p.starter)
  const celticSubsUsed = celticLineup.players.filter((p) => !p.starter && p.used)
  const celticUnused = celticLineup.players.filter((p) => !p.starter && !p.used)
  const oppStarters = oppLineup.players.filter((p) => p.starter)
  const oppSubsUsed = oppLineup.players.filter((p) => !p.starter && p.used)
  const oppUnused = oppLineup.players.filter((p) => !p.starter && !p.used)

  return (
    <div>
      {!data.confirmed && (
        <div
          className="mb-3 px-3 py-1.5 rounded text-center"
          style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}
        >
          Lineups not yet confirmed
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <LineupHeader label="Celtic" formation={celticLineup.formation} isCeltic />
        <LineupHeader label={oppName} formation={oppLineup.formation} isCeltic={false} />
      </div>

      {(celticManager || oppManager) && (
        <div className="grid grid-cols-2 gap-4">
          <LineupManager manager={celticManager} />
          <LineupManager manager={oppManager} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div><LineupPlayerList players={celticStarters} isCeltic eventMap={eventMap} /></div>
        <div><LineupPlayerList players={oppStarters} isCeltic={false} eventMap={eventMap} /></div>
      </div>

      {(celticSubsUsed.length > 0 || oppSubsUsed.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            {celticSubsUsed.length > 0 && <LineupSectionHeading text="Substitutes used" />}
            <LineupPlayerList players={celticSubsUsed} isCeltic eventMap={eventMap} />
          </div>
          <div>
            {oppSubsUsed.length > 0 && <LineupSectionHeading text="Substitutes used" />}
            <LineupPlayerList players={oppSubsUsed} isCeltic={false} eventMap={eventMap} />
          </div>
        </div>
      )}

      {(celticUnused.length > 0 || oppUnused.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            {celticUnused.length > 0 && <LineupSectionHeading text="Unused" />}
            <LineupPlayerList players={celticUnused} isCeltic eventMap={eventMap} />
          </div>
          <div>
            {oppUnused.length > 0 && <LineupSectionHeading text="Unused" />}
            <LineupPlayerList players={oppUnused} isCeltic={false} eventMap={eventMap} />
          </div>
        </div>
      )}
    </div>
  )
}
