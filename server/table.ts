export interface TableRow {
  team: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

const tableCache = new Map<string, { data: TableRow[]; expiry: number }>()

export async function computeLeagueTable(cutoff: string, inclusive: boolean): Promise<TableRow[]> {
  const cacheKey = `${cutoff}:${inclusive}`
  const hit = tableCache.get(cacheKey)
  if (hit && hit.expiry > Date.now()) return hit.data

  const [y, mo] = cutoff.split('-').map(Number)
  const yr = mo >= 7 ? y : y - 1
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard` +
    `?limit=500&dates=${yr}0701-${yr + 1}0630&seasontype=2`

  const resp = await fetch(url)
  const json = (await resp.json()) as { events?: unknown[] }

  const teams: Record<string, Omit<TableRow, 'position' | 'goalDifference'>> = {}
  const ensure = (name: string) => {
    if (!teams[name]) teams[name] = { team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
    return teams[name]
  }

  for (const event of (json.events ?? []) as Record<string, unknown>[]) {
    const comps = (event.competitions as Record<string, unknown>[])?.[0]
    if (!comps) continue
    const status = (comps.status as Record<string, Record<string, unknown>>)?.type
    if (!status?.completed) continue

    const eventDate = (event.date as string).slice(0, 10)
    if (inclusive ? eventDate > cutoff : eventDate >= cutoff) continue

    const competitors = comps.competitors as Record<string, unknown>[]
    const home = competitors?.find((c) => c.homeAway === 'home')
    const away = competitors?.find((c) => c.homeAway === 'away')
    if (!home || !away) continue

    const hs = parseInt(home.score as string)
    const as_ = parseInt(away.score as string)
    if (isNaN(hs) || isNaN(as_)) continue

    const hn = (home.team as Record<string, string>).displayName
    const an = (away.team as Record<string, string>).displayName

    const h = ensure(hn)
    const a = ensure(an)
    h.played++; a.played++
    h.goalsFor += hs; h.goalsAgainst += as_
    a.goalsFor += as_; a.goalsAgainst += hs
    if (hs > as_) { h.won++; h.points += 3; a.lost++ }
    else if (hs < as_) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; h.points++; a.drawn++; a.points++ }
  }

  const sorted = Object.values(teams)
    .map((t, i) => ({ ...t, goalDifference: t.goalsFor - t.goalsAgainst, position: i + 1 }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
    .map((t, i) => ({ ...t, position: i + 1 }))

  tableCache.set(cacheKey, { data: sorted, expiry: Date.now() + 10 * 60 * 1000 })
  return sorted
}
