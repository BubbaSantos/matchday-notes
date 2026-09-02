export async function transcribeAudio(blob: Blob): Promise<string> {
  const resp = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  })
  const json = (await resp.json()) as { text?: string; error?: string }
  if (!resp.ok) throw new Error(json.error ?? `Transcription failed (${resp.status})`)
  return json.text ?? ''
}
