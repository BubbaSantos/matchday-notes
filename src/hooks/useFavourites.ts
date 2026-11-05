import { useState, useCallback } from 'react'

const STORAGE_KEY = 'cfd-favourites'

export interface FavouriteEntry {
  id: string
  date: string | null
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  competition: string
  path: string
}

function load(): FavouriteEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<FavouriteEntry[]>(load)

  const persist = useCallback((list: FavouriteEntry[]) => {
    setFavourites(list)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }, [])

  const isFavourited = useCallback(
    (id: string) => favourites.some(f => f.id === id),
    [favourites]
  )

  const toggle = useCallback(
    (entry: FavouriteEntry) => {
      persist(
        favourites.some(f => f.id === entry.id)
          ? favourites.filter(f => f.id !== entry.id)
          : [entry, ...favourites]
      )
    },
    [favourites, persist]
  )

  return { favourites, isFavourited, toggle }
}
