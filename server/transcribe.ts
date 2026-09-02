// Transcribes a recorded voice note via OpenAI's Whisper API. The client
// POSTs the raw audio bytes with a Content-Type header identifying the
// format (whatever MediaRecorder produced — audio/webm on Chrome/Firefox,
// audio/mp4 on Safari/iOS).
import type { IncomingMessage, ServerResponse } from 'http'

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function handleTranscribeRequest(req: IncomingMessage, res: ServerResponse) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured on the server.' }))
    return
  }

  try {
    const contentType = req.headers['content-type'] || 'audio/webm'
    const mime = contentType.split(';')[0].trim()
    const ext = EXT_BY_MIME[mime] ?? 'webm'
    const body = await readBody(req)

    if (body.length === 0) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'No audio data received.' }))
      return
    }

    const form = new FormData()
    form.append('file', new Blob([body], { type: mime }), `voice-note.${ext}`)
    form.append('model', 'whisper-1')

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      res.statusCode = resp.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Whisper API error: ${errText.slice(0, 500)}` }))
      return
    }

    const json = (await resp.json()) as { text?: string }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(JSON.stringify({ text: json.text ?? '' }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(err) }))
  }
}
