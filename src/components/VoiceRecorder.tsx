import { useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { transcribeAudio } from '../lib/transcribeClient'

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((c) => MediaRecorder.isTypeSupported(c))
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

type Status = 'idle' | 'recording' | 'transcribing' | 'error'

export function VoiceRecorder({
  onSaved,
}: {
  onSaved: (blob: Blob, transcript: string, duration: number) => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mediaRecorderRef.current = mr
      mr.start()
      startRef.current = Date.now()
      setElapsed(0)
      setStatus('recording')
      timerRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startRef.current) / 1000)
      }, 200)
    } catch {
      setError('Microphone access denied or unavailable.')
      setStatus('error')
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    window.clearInterval(timerRef.current)
    const duration = (Date.now() - startRef.current) / 1000

    const blob = await new Promise<Blob>((resolve) => {
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop())
        resolve(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }))
      }
      mr.stop()
    })

    setStatus('transcribing')
    try {
      const transcript = await transcribeAudio(blob)
      onSaved(blob, transcript, duration)
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed — saved without a transcript.')
      onSaved(blob, '', duration)
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {status === 'recording' ? (
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 rounded-full border-none cursor-pointer px-3 py-1.5"
          style={{ backgroundColor: 'var(--color-loss)', color: '#fff', fontFamily: 'inherit' }}
        >
          <Square size={12} fill="currentColor" />
          <span className="font-mono tabular-nums" style={{ fontSize: '0.8rem' }}>{formatElapsed(elapsed)}</span>
        </button>
      ) : status === 'transcribing' ? (
        <span
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ color: 'var(--color-ink-muted)', fontSize: '0.8rem' }}
        >
          <Loader2 size={13} className="animate-spin" />
          Transcribing…
        </span>
      ) : (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 rounded-full border cursor-pointer px-3 py-1.5"
          style={{ backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)', fontFamily: 'inherit' }}
        >
          <Mic size={13} />
          <span style={{ fontSize: '0.8rem' }}>Record voice note</span>
        </button>
      )}
      {error && (
        <span style={{ color: 'var(--color-loss)', fontSize: '0.72rem' }}>{error}</span>
      )}
    </div>
  )
}
