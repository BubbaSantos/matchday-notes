import { Trash2 } from 'lucide-react'
import type { VoiceNote } from '../types'

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function VoiceNoteList({
  notes,
  onDelete,
}: {
  notes: VoiceNote[]
  onDelete: (id: string) => void
}) {
  if (notes.length === 0) return null

  return (
    <div className="space-y-2.5">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded border px-3 py-2.5"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            <audio controls src={note.audioUrl} style={{ height: 30, flex: 1 }} />
            <span className="font-mono tabular-nums" style={{ color: 'var(--color-ink-faint)', fontSize: '0.72rem' }}>
              {formatDuration(note.duration)}
            </span>
            <button
              onClick={() => onDelete(note.id)}
              title="Delete voice note"
              className="border-none cursor-pointer p-1 rounded"
              style={{ background: 'none', color: 'var(--color-ink-faint)', flexShrink: 0 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
          {note.transcript ? (
            <p className="font-journal m-0 leading-relaxed" style={{ color: 'var(--color-ink-secondary)', fontSize: '0.9rem' }}>
              {note.transcript}
            </p>
          ) : (
            <p className="m-0 italic" style={{ color: 'var(--color-ink-faint)', fontSize: '0.8rem' }}>
              No transcript available.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
