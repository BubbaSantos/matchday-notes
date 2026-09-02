import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface AuthState {
  username: string | null
  loading: boolean
  login: (username: string, passcode: string) => Promise<void>
  signup: (username: string, passcode: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function json<T>(res: Response): Promise<T> {
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth?action=me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setUsername(body?.username ?? null))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (u: string, passcode: string) => {
    const res = await fetch('/api/auth?action=login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, passcode }),
    })
    const body = await json<{ username: string }>(res)
    setUsername(body.username)
  }, [])

  const signup = useCallback(async (u: string, passcode: string) => {
    const res = await fetch('/api/auth?action=signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, passcode }),
    })
    const body = await json<{ username: string }>(res)
    setUsername(body.username)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' })
    setUsername(null)
  }, [])

  return (
    <AuthContext.Provider value={{ username, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
