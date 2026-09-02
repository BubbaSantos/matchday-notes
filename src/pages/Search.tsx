import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import { useFixtures } from '../hooks/useFixtures'
import { CompetitionBadge } from '../components/CompetitionBadge'
import type { MatchEntry } from '../types'

function searchMatches(fixtures: MatchEntry[], query: string) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return fixtures.flatMap((match) => {
    const snippets: string[] = []
    if (match.preNotes?.toLowerCase().includes(q)) snippets.push(match.preNotes)
    if (match.postNotes?.toLowerCase().includes(q)) snippets.push(match.postNotes)
    for (const vn of [...(match.preVoiceNotes ?? []), ...(match.postVoiceNotes ?? [])]) {
      if (vn.transcript.toLowerCase().includes(q)) snippets.push(vn.transcript)
    }

    const matchesFixtureInfo =
      match.opponent.toLowerCase().includes(q) ||
      match.competition.toLowerCase().includes(q) ||
      (match.round?.toLowerCase().includes(q) ?? false)

    return snippets.length > 0 || matchesFixtureInfo ? [{ match, snippets }] : []
  })
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        style={{ backgroundColor: 'var(--color-accent-faint)', color: 'var(--color-accent)', borderRadius: 2, padding: '0 2px' }}
      >
        {part}
      </mark>
    ) : part
  )
}

export function Search() {
  const [query, setQuery] = useState('')
  const { fixtures } = useFixtures()
  const results = searchMatches(fixtures, query)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-journal m-0 leading-tight" style={{ color: 'var(--color-ink)', fontSize: '1.75rem' }}>
          Search
        </h1>
        <p className="m-0 mt-0.5" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
          Across all match notes and voice transcripts.
        </p>
      </div>

      <div
        className="flex items-center gap-3 rounded-lg border px-4 py-2.5 mb-7"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: query ? 'var(--color-accent)' : 'var(--color-border)',
        }}
      >
        <SearchIcon size={15} style={{ color: 'var(--color-ink-faint)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          className="flex-1 border-none outline-none text-sm bg-transparent"
          style={{ color: 'var(--color-ink)', fontFamily: 'inherit' }}
          autoFocus
        />
      </div>

      {query && results.length === 0 && (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--color-ink-faint)' }}>
          No matches found for "{query}"
        </p>
      )}

      {results.map(({ match, snippets }) => (
        <Link key={match.id} to={`/match/${match.id}`} className="block no-underline mb-3">
          <div
            className="rounded-lg border p-4 transition-colors"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-ink-muted)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CompetitionBadge competition={match.competition} />
              <span style={{ color: 'var(--color-ink-faint)', fontSize: '0.75rem' }}>
                {new Date(match.kickoff).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="font-journal mb-1.5" style={{ color: 'var(--color-ink)', fontSize: '0.975rem' }}>
              Celtic vs {match.opponent}
            </div>
            {snippets.map((s, i) => (
              <p key={i} className="m-0 mt-1 leading-relaxed" style={{ color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
                {highlight(s, query)}
              </p>
            ))}
          </div>
        </Link>
      ))}

      {!query && (
        <div className="text-center py-16" style={{ color: 'var(--color-ink-faint)' }}>
          <SearchIcon size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm m-0">Start typing to search your diary</p>
        </div>
      )}
    </div>
  )
}
