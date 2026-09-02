import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { hasLocalNotesToMigrate, migrateLocalNotesToServer } from '../lib/notesMigration'

type Mode = 'login' | 'signup'
type Step = 'form' | 'migrate' | 'done'

export function Login() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [migrating, setMigrating] = useState(false)
  const [migratedCount, setMigratedCount] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') await login(username, passcode)
      else await signup(username, passcode)

      if (await hasLocalNotesToMigrate()) {
        setStep('migrate')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMigrate(doIt: boolean) {
    if (!doIt) { navigate('/'); return }
    setMigrating(true)
    try {
      const count = await migrateLocalNotesToServer()
      setMigratedCount(count)
      setStep('done')
    } catch {
      setError('Could not import your local notes — you can try again later from Search.')
      navigate('/')
    } finally {
      setMigrating(false)
    }
  }

  if (step === 'migrate') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <h1 className="font-journal m-0 mb-2" style={{ color: 'var(--color-ink)', fontSize: '1.4rem' }}>
          Import your notes?
        </h1>
        <p className="m-0 mb-6" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
          This device has notes saved locally, from before you logged in. Copy them into your account so they sync everywhere?
        </p>
        <div className="flex items-center justify-center gap-2.5">
          <button
            onClick={() => handleMigrate(true)}
            disabled={migrating}
            className="rounded border-none cursor-pointer px-4 py-2"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit', opacity: migrating ? 0.6 : 1 }}
          >
            {migrating ? 'Importing…' : 'Yes, import them'}
          </button>
          <button
            onClick={() => handleMigrate(false)}
            disabled={migrating}
            className="rounded border cursor-pointer px-4 py-2"
            style={{ background: 'none', borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)', fontSize: '0.85rem', fontFamily: 'inherit' }}
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.9rem' }}>
          Imported {migratedCount} match{migratedCount === 1 ? '' : 'es'} of notes.
        </p>
        <button
          onClick={() => navigate('/')}
          className="rounded border-none cursor-pointer px-4 py-2 mt-3"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit' }}
        >
          Continue to the archive
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="font-journal m-0 mb-1 text-center" style={{ color: 'var(--color-ink)', fontSize: '1.6rem' }}>
        {mode === 'login' ? 'Log in' : 'Create an account'}
      </h1>
      <p className="m-0 mb-6 text-center" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
        {mode === 'login' ? 'Sync your notes across devices.' : 'A username and passcode — nothing else needed.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="w-full rounded border"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-ink)', padding: '0.6rem 0.75rem', fontFamily: 'inherit' }}
        />
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          required
          className="w-full rounded border"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-ink)', padding: '0.6rem 0.75rem', fontFamily: 'inherit' }}
        />

        {error && (
          <p className="m-0" style={{ color: 'var(--color-loss)', fontSize: '0.8rem' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded border-none cursor-pointer py-2.5"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff', fontSize: '0.9rem', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
        className="w-full text-center border-none cursor-pointer mt-4 py-1"
        style={{ background: 'none', color: 'var(--color-accent)', fontSize: '0.8rem', fontFamily: 'inherit' }}
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </div>
  )
}
