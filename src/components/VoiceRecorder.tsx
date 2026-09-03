import { useRef, useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'
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

const HEADINGS: [RegExp, string][] = [
  [/\bpre[- ]?match\b/gi, 'Pre-match'],
  [/\bpost[- ]?match\b/gi, 'Post-match'],
  [/\bhalf[- ]?time\b/gi, 'Half-time'],
  [/\bfull[- ]?time\b/gi, 'Full-time'],
  [/\bfirst half\b/gi, 'First half'],
  [/\bsecond half\b/gi, 'Second half'],
  [/\bman of the match\b/gi, 'Man of the Match'],
  [/\bkey moment[s]?\b/gi, 'Key moments'],
  [/\bsummary\b/gi, 'Summary'],
]

function formatTranscript(raw: string): string {
  let text = raw.trim()
  for (const [pattern, label] of HEADINGS) {
    text = text.replace(
      new RegExp(pattern.source + '[,.:;]?\\s*', 'gi'),
      `\n\n## ${label}\n`
    )
  }
  return text.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trim()
}

type Status = 'idle' | 'recording' | 'transcribing' | 'error'

export function VoiceRecorder({ onTranscribed }: { onTranscribed: (text: string) => void }) {
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

    const blob = await new Promise<Blob>((resolve) => {
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop())
        resolve(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }))
      }
      mr.stop()
    })

    setStatus('transcribing')
    try {
      const raw = await transcribeAudio(blob)
      onTranscribed(formatTranscript(raw))
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.')
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {status === 'recording' ? (
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 rounded-full border-none cursor-pointer px-3 py-1.5"
          style={{ backgroundColor: 'var(--color-loss)', color: '#fff', fontFamily: 'inherit', fontSize: '0.8rem' }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, backgroundColor: '#fff', animation: 'pulse 1s infinite' }}
          />
          Recording {formatElapsed(elapsed)}
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
          style={{ backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)', fontFamily: 'inherit', fontSize: '0.8rem' }}
        >
          <Mic size={13} />
          Record voice note
        </button>
      )}
      {(status === 'idle' || status === 'error') && error && (
        <span style={{ color: 'var(--color-loss)', fontSize: '0.72rem' }}>{error}</span>
      )}
    </div>
  )
}
