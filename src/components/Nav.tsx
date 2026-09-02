import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Search } from 'lucide-react'

export function Nav() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isSearch = location.pathname === '/search'

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
