export function UpdateBanner() {
  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2"
      style={{ backgroundColor: 'var(--color-accent)', color: '#fff', fontSize: '0.8rem' }}
    >
      <span>A new version of the archive is ready.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded border-none cursor-pointer px-2.5 py-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit' }}
      >
        Refresh
      </button>
    </div>
  )
}
