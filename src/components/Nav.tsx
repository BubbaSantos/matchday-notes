import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Search, User, LogOut } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export function Nav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { username, logout } = useAuth()
  const isHome = location.pathname === '/'
  const isSearch = location.pathname === '/search'
  const isLogin = location.pathname === '/login'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <Link to="/" className="flex items-center gap-2.5 no-underline">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          C
        </div>
        <span
          className="font-journal text-sm tracking-wide"
          style={{ color: 'var(--color-ink)' }}
        >
          Celtic FC Match Archive
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <NavLink to="/" icon={<BookOpen size={15} />} label="Archive" active={isHome} />
        <NavLink to="/search" icon={<Search size={15} />} label="Search" active={isSearch} />
        {username ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border-none cursor-pointer transition-colors"
              style={{ background: 'none', color: 'var(--color-ink-muted)', fontFamily: 'inherit' }}
            >
              <User size={15} />
              <span>{username}</span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-1 rounded border shadow-sm"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  minWidth: '120px',
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); logout().then(() => navigate('/')) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm border-none cursor-pointer transition-colors text-left"
                  style={{ background: 'none', color: 'var(--color-ink-muted)', fontFamily: 'inherit' }}
                >
                  <LogOut size={13} />
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <NavLink to="/login" icon={<User size={15} />} label="Log in" active={isLogin} />
        )}
      </div>
    </nav>
  )
}

function NavLink({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm no-underline transition-colors"
      style={{
        color: active ? 'var(--color-accent)' : 'var(--color-ink-muted)',
        backgroundColor: active ? 'var(--color-accent-faint)' : 'transparent',
        fontWeight: active ? 500 : 400,
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}
