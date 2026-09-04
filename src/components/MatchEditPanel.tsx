import { useState } from 'react'

// ── Shared override types (mirror server/matchEditStore.ts) ──────────────────

export interface OverrideEvent {
  type: 'goal' | 'ownGoal' | 'yellowCard' | 'redCard'
  player: string
  minute: number | null
  isCeltic: boolean
}

export interface OverridePlayer {
  name: string
  starter: boolean
  subbedOff?: number | null
  subbedOn?: number | null
}

export interface OverrideLineup {
  teamName: string
  manager?: string | null
  players: OverridePlayer[]
}

export interface MatchOverride {
  deleted?: boolean
  homeScore?: number | null
  awayScore?: number | null
  tableNote?: string | null
  events?: OverrideEvent[] | null
  celticLineup?: OverrideLineup | null
  opponentLineup?: OverrideLineup | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function parseMinuteInput(raw: string): number | null {
  if (!raw.trim()) return null
  const stoppage = raw.match(/(\d+)[+'\-]+(\d+)/)
  if (stoppage) return parseInt(stoppage[1]) + parseInt(stoppage[2])
  const n = parseInt(raw.replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

// ── Styles ───────────────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '6px 10px', color: 'var(--color-ink)',
  fontFamily: 'inherit', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--color-ink-faint)', fontWeight: 500, display: 'block', marginBottom: 4,
}

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--color-ink-faint)', fontWeight: 500, marginBottom: 8, marginTop: 20,
}

// ── Row editors ───────────────────────────────────────────────────────────────

function EditEventRow({ ev, onChange, onRemove }: {
  ev: OverrideEvent
  onChange: (ev: OverrideEvent) => void
  onRemove: () => void
}) {
  const [minuteRaw, setMinuteRaw] = useState(ev.minute != null ? String(ev.minute) : '')

  return (
    <div className="flex gap-2 items-center py-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <select value={ev.type} onChange={e => onChange({ ...ev, type: e.target.value as OverrideEvent['type'] })}
        style={{ ...inputStyle, width: 110, flexShrink: 0 }}>
        <option value="goal">Goal</option>
        <option value="ownGoal">Own Goal</option>
        <option value="yellowCard">Yellow</option>
        <option value="redCard">Red</option>
      </select>
      <input value={ev.player} onChange={e => onChange({ ...ev, player: e.target.value })}
        placeholder="Player" style={{ ...inputStyle, flex: 1 }} />
      <input
        value={minuteRaw}
        onChange={e => {
          setMinuteRaw(e.target.value)
          onChange({ ...ev, minute: parseMinuteInput(e.target.value) })
        }}
        placeholder="45'+3"
        style={{ ...inputStyle, width: 64, flexShrink: 0 }}
      />
      <select value={ev.isCeltic ? 'celtic' : 'opp'} onChange={e => onChange({ ...ev, isCeltic: e.target.value === 'celtic' })}
        style={{ ...inputStyle, width: 80, flexShrink: 0 }}>
        <option value="celtic">Celtic</option>
        <option value="opp">Opp</option>
      </select>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-loss)', fontSize: '1rem', padding: '0 4px', flexShrink: 0 }}>×</button>
    </div>
  )
}

function EditPlayerRow({ p, onChange, onRemove }: {
  p: OverridePlayer
  onChange: (p: OverridePlayer) => void
  onRemove: () => void
}) {
  return (
    <div className="flex gap-2 items-center py-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <input value={p.name} onChange={e => onChange({ ...p, name: e.target.value })}
        placeholder="Player name" style={{ ...inputStyle, flex: 1 }} />
      <select value={p.starter ? 'start' : 'bench'} onChange={e => onChange({ ...p, starter: e.target.value === 'start' })}
        style={{ ...inputStyle, width: 70, flexShrink: 0 }}>
        <option value="start">Start</option>
        <option value="bench">Bench</option>
      </select>
      {p.starter && (
        <input value={p.subbedOff ?? ''} onChange={e => onChange({ ...p, subbedOff: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="Off" type="number" style={{ ...inputStyle, width: 52, flexShrink: 0 }} title="Subbed off (minute)" />
      )}
      {!p.starter && (
        <input value={p.subbedOn ?? ''} onChange={e => onChange({ ...p, subbedOn: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="On" type="number" style={{ ...inputStyle, width: 52, flexShrink: 0 }} title="Came on (minute)" />
      )}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-loss)', fontSize: '1rem', padding: '0 4px', flexShrink: 0 }}>×</button>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function MatchEditPanel({
  home, away, homeScore, awayScore, tableNote: initialTableNote,
  initialEvents, initialCelticLineup, initialOpponentLineup,
  override,
  onSave, onReset, onDelete, onCancel,
}: {
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  tableNote?: string | null
  initialEvents: OverrideEvent[]
  initialCelticLineup: OverrideLineup
  initialOpponentLineup: OverrideLineup
  override: MatchOverride
  onSave: (o: MatchOverride) => Promise<void>
  onReset: () => Promise<void>
  onDelete: () => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<MatchOverride>(() => ({
    homeScore: override.homeScore !== undefined ? override.homeScore : homeScore,
    awayScore: override.awayScore !== undefined ? override.awayScore : awayScore,
    tableNote: override.tableNote !== undefined ? override.tableNote : (initialTableNote ?? ''),
    events: override.events ?? initialEvents,
    celticLineup: override.celticLineup ?? initialCelticLineup,
    opponentLineup: override.opponentLineup ?? initialOpponentLineup,
  }))
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const setEvents = (events: OverrideEvent[]) => setDraft(d => ({ ...d, events }))
  const setCelticPlayers = (players: OverridePlayer[]) => setDraft(d => ({ ...d, celticLineup: { ...d.celticLineup!, players } }))
  const setOppPlayers = (players: OverridePlayer[]) => setDraft(d => ({ ...d, opponentLineup: { ...d.opponentLineup!, players } }))

  const addEvent = () => setEvents([...(draft.events ?? []), { type: 'goal', player: '', minute: null, isCeltic: true }])
  const addCelticPlayer = () => setCelticPlayers([...(draft.celticLineup?.players ?? []), { name: '', starter: true }])
  const addOppPlayer = () => setOppPlayers([...(draft.opponentLineup?.players ?? []), { name: '', starter: true }])

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  async function handleReset() {
    setResetting(true)
    await onReset()
    setResetting(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete()
  }

  const oppName = away === 'Celtic' ? home : away

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-ink)' }}>Edit Match</span>
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={resetting}
            style={{ ...inputStyle, width: 'auto', padding: '6px 14px', cursor: 'pointer', color: 'var(--color-loss)' }}
            title="Clear all overrides and revert to original data">
            {resetting ? 'Resetting…' : 'Reset to original'}
          </button>
          <button onClick={onCancel} style={{ ...inputStyle, width: 'auto', padding: '6px 14px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...inputStyle, width: 'auto', padding: '6px 14px', cursor: 'pointer', background: 'var(--color-accent)', color: '#fff', border: 'none', fontWeight: 600 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Delete zone */}
      <div className="flex items-center justify-between py-2 mb-2" style={{ borderTop: '1px solid var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-faint)' }}>Remove this game from the archive</span>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-loss)' }}>Are you sure?</span>
            <button onClick={() => setConfirmDelete(false)}
              style={{ ...inputStyle, width: 'auto', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>
              No
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ ...inputStyle, width: 'auto', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', background: 'var(--color-loss)', color: '#fff', border: 'none', fontWeight: 600 }}>
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            style={{ ...inputStyle, width: 'auto', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-loss)' }}>
            Delete game
          </button>
        )}
      </div>

      {/* Score */}
      <div style={sectionHeadStyle}>Score</div>
      <div className="flex gap-3 items-center">
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{home}</label>
          <input type="number" value={draft.homeScore ?? ''} onChange={e => setDraft(d => ({ ...d, homeScore: e.target.value === '' ? null : parseInt(e.target.value) }))}
            style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', fontWeight: 700 }} />
        </div>
        <span style={{ color: 'var(--color-ink-faint)', fontSize: '1.5rem', paddingTop: 18 }}>–</span>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{away}</label>
          <input type="number" value={draft.awayScore ?? ''} onChange={e => setDraft(d => ({ ...d, awayScore: e.target.value === '' ? null : parseInt(e.target.value) }))}
            style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', fontWeight: 700 }} />
        </div>
      </div>

      {/* Table note */}
      <div style={{ ...sectionHeadStyle, marginTop: 16 }}>Extra Time / Penalties / Notes</div>
      <textarea value={draft.tableNote ?? ''} onChange={e => setDraft(d => ({ ...d, tableNote: e.target.value }))}
        placeholder="e.g. Celtic win 4-2 on pens after 0-0 AET"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }} />
      <p style={{ fontSize: '0.65rem', color: 'var(--color-ink-faint)', margin: '4px 0 0' }}>
        Parsed automatically for display — write naturally: "Celtic win 4-2 on pens after 0-0 AET"
      </p>

      {/* Events */}
      <div style={sectionHeadStyle}>Goals &amp; Cards</div>
      {(draft.events ?? []).map((ev, i) => (
        <EditEventRow key={i} ev={ev}
          onChange={updated => setEvents((draft.events ?? []).map((e, j) => j === i ? updated : e))}
          onRemove={() => setEvents((draft.events ?? []).filter((_, j) => j !== i))} />
      ))}
      <button onClick={addEvent} style={{ ...inputStyle, width: 'auto', marginTop: 8, cursor: 'pointer', color: 'var(--color-accent)' }}>
        + Add event
      </button>

      {/* Celtic lineup */}
      <div style={sectionHeadStyle}>Celtic Lineup</div>
      <div className="flex gap-3 mb-2">
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Team name</label>
          <input value={draft.celticLineup?.teamName ?? 'Celtic'} onChange={e => setDraft(d => ({ ...d, celticLineup: { ...d.celticLineup!, teamName: e.target.value } }))}
            style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Manager</label>
          <input value={draft.celticLineup?.manager ?? ''} onChange={e => setDraft(d => ({ ...d, celticLineup: { ...d.celticLineup!, manager: e.target.value || null } }))}
            placeholder="e.g. Brendan Rodgers" style={inputStyle} />
        </div>
      </div>
      {(draft.celticLineup?.players ?? []).map((p, i) => (
        <EditPlayerRow key={i} p={p}
          onChange={updated => setCelticPlayers((draft.celticLineup?.players ?? []).map((pl, j) => j === i ? updated : pl))}
          onRemove={() => setCelticPlayers((draft.celticLineup?.players ?? []).filter((_, j) => j !== i))} />
      ))}
      <button onClick={addCelticPlayer} style={{ ...inputStyle, width: 'auto', marginTop: 8, cursor: 'pointer', color: 'var(--color-accent)' }}>
        + Add player
      </button>

      {/* Opponent lineup */}
      <div style={sectionHeadStyle}>{oppName} Lineup</div>
      <div className="flex gap-3 mb-2">
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Team name</label>
          <input value={draft.opponentLineup?.teamName ?? oppName} onChange={e => setDraft(d => ({ ...d, opponentLineup: { ...d.opponentLineup!, teamName: e.target.value } }))}
            style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Manager</label>
          <input value={draft.opponentLineup?.manager ?? ''} onChange={e => setDraft(d => ({ ...d, opponentLineup: { ...d.opponentLineup!, manager: e.target.value || null } }))}
            placeholder="e.g. Philippe Clement" style={inputStyle} />
        </div>
      </div>
      {(draft.opponentLineup?.players ?? []).map((p, i) => (
        <EditPlayerRow key={i} p={p}
          onChange={updated => setOppPlayers((draft.opponentLineup?.players ?? []).map((pl, j) => j === i ? updated : pl))}
          onRemove={() => setOppPlayers((draft.opponentLineup?.players ?? []).filter((_, j) => j !== i))} />
      ))}
      <button onClick={addOppPlayer} style={{ ...inputStyle, width: 'auto', marginTop: 8, cursor: 'pointer', color: 'var(--color-accent)' }}>
        + Add player
      </button>
    </div>
  )
}
