import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import type { Game, Platform, SortBy } from '../../shared/types'
import './Search.css'

const PLATFORMS: Array<Platform | 'Todas'> = ['Todas', 'NES', 'SNES', 'N64', 'Sega Genesis', 'PS1', 'PS2']

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
}

const GENRES: Array<{ id: number; label: string }> = [
  { id:  4, label: 'Peleas' },
  { id:  5, label: 'Shooter' },
  { id:  8, label: 'Plataformas' },
  { id:  9, label: 'Puzzle' },
  { id: 10, label: 'Carreras' },
  { id: 12, label: 'RPG' },
  { id: 13, label: 'Simulador' },
  { id: 14, label: 'Deportes' },
  { id: 15, label: 'Estrategia' },
  { id: 25, label: 'Hack & Slash' },
  { id: 31, label: 'Aventura' },
  { id: 33, label: 'Arcade' },
]

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'rating',    label: 'Puntuación' },
  { value: 'popular',   label: 'Popularidad' },
  { value: 'newest',    label: 'Más recientes' },
  { value: 'oldest',    label: 'Más antiguos' },
]

const IS_ELECTRON = Boolean(window.retrio)

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/igdb${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(err.error || res.statusText)
  }
  return res.json() as Promise<T>
}

const PAGE_SIZE = 48

async function fetchGames(query: string, platform: Platform | 'Todas', sortBy: SortBy, offset: number, genreId: number | null): Promise<Game[]> {
  if (IS_ELECTRON) {
    return window.retrio.searchGames(query, platform === 'Todas' ? null : platform, sortBy, offset, genreId)
  }
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (platform !== 'Todas') params.set('platform', platform)
  params.set('sort', sortBy)
  params.set('offset', String(offset))
  if (genreId) params.set('genreId', String(genreId))
  return apiFetch<Game[]>(`/search?${params}`)
}

async function fetchPopular(platform: Platform | 'Todas', sortBy: SortBy, offset: number, genreId: number | null): Promise<Game[]> {
  if (IS_ELECTRON) {
    return window.retrio.getPopularGames(platform === 'Todas' ? null : platform, sortBy, offset, genreId)
  }
  const params = new URLSearchParams()
  if (platform !== 'Todas') params.set('platform', platform)
  params.set('sort', sortBy)
  params.set('offset', String(offset))
  if (genreId) params.set('genreId', String(genreId))
  return apiFetch<Game[]>(`/popular?${params}`)
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [activePlatform, setActivePlatform] = useState<Platform | 'Todas'>(
    (searchParams.get('platform') as Platform) ?? 'Todas'
  )
  const [sortBy, setSortBy] = useState<SortBy>('relevance')
  const [genreId, setGenreId] = useState<number | null>(null)
  const [results, setResults] = useState<Game[]>([])
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string, platform: Platform | 'Todas', sort: SortBy, p = 1, resetMax = false, genre: number | null = null) => {
    setError(null)
    setLoading(true)
    const off = (p - 1) * PAGE_SIZE
    try {
      const data = q || platform !== 'Todas' || genre
        ? await fetchGames(q, platform, sort, off, genre)
        : await fetchPopular(platform, sort, off, genre)
      const more = data.length === PAGE_SIZE
      setResults(data)
      setHasMore(more)
      setMaxPage((prev) => {
        const base = resetMax ? 1 : prev
        return more ? Math.max(base, p + 1) : Math.max(base, p)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setResults([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [])

  function handlePageChange(p: number) {
    setPage(p)
    runSearch(query, activePlatform, sortBy, p, false, genreId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    runSearch(query, activePlatform, sortBy, 1, true, null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setSearchParams(val ? { q: val } : {})
    setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val, activePlatform, sortBy, 1, true, genreId), 400)
  }

  function handlePlatformChange(platform: Platform | 'Todas') {
    setActivePlatform(platform)
    setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runSearch(query, platform, sortBy, 1, true, genreId)
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sort = e.target.value as SortBy
    setSortBy(sort)
    setPage(1)
    runSearch(query, activePlatform, sort, 1, true, genreId)
  }

  function handleGenreChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value ? Number(e.target.value) : null
    setGenreId(val)
    setPage(1)
    runSearch(query, activePlatform, sortBy, 1, true, val)
  }

  function handleClear() {
    setQuery('')
    setSearchParams({})
    setPage(1)
    runSearch('', activePlatform, sortBy, 1, true, genreId)
  }

  return (
    <div className="page search-page">
      <div className="search-header">
        <h1 className="search-title">Buscar juegos</h1>
        <div className="search-box">
          <SearchInputIcon />
          <input
            type="text"
            className="search-input"
            placeholder="Título del juego..."
            value={query}
            onChange={handleQueryChange}
            autoFocus
          />
          {query && (
            <button className="search-clear" onClick={handleClear}>
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      <div className="search-filters">
        <div className="filter-platforms">
          {PLATFORMS.map((p) => {
            const color = p !== 'Todas' ? PLATFORM_COLORS[p] : undefined
            return (
              <button
                key={p}
                className={`filter-chip ${activePlatform === p ? 'filter-chip--active' : ''}`}
                style={undefined}
                onClick={() => handlePlatformChange(p)}
              >
                {color && <span className="filter-chip-dot" style={{ background: color }} />}
                {p}
              </button>
            )
          })}
        </div>
        <div className="filter-selects">
          <select className="sort-select" value={genreId ?? ''} onChange={handleGenreChange}>
            <option value="">Todos los géneros</option>
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <select className="sort-select" value={sortBy} onChange={handleSortChange}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="search-results">
        {error && (
          <div className="search-error">
            <p className="search-error-title">Error al conectar con IGDB</p>
            <p className="search-error-msg">{error}</p>
          </div>
        )}

        {loading && (
          <div className="search-state">
            <div className="spinner" />
            <p>Buscando...</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && query && (
          <div className="search-state">
            <p className="search-empty-title">Sin resultados para "{query}"</p>
            <p className="search-empty-sub">Intenta con otro título o consola</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <p className="search-count">
              {query
                ? `${results.length} resultado${results.length !== 1 ? 's' : ''} para "${query}" — página ${page}`
                : `${activePlatform === 'Todas' ? 'Populares' : activePlatform} — página ${page}`}
            </p>
            <div className="games-grid">
              {results.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
            <div className="pagination">
              <button className="page-btn page-btn--nav" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>‹</button>
              {buildPageNumbers(page, maxPage).map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="page-ellipsis">…</span>
                  : <button
                      key={p}
                      className={`page-btn${p === page ? ' page-btn--active' : ''}`}
                      onClick={() => p !== page && handlePageChange(p)}
                    >{p}</button>
              )}
              <button className="page-btn page-btn--nav" onClick={() => handlePageChange(page + 1)} disabled={!hasMore}>›</button>
            </div>
          </>
        )}
      </div>

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  )
}

function buildPageNumbers(current: number, max: number): (number | '...')[] {
  if (max <= 10) {
    return Array.from({ length: max }, (_, i) => i + 1)
  }
  if (current <= 7) {
    return [1, 2, 3, 4, 5, 6, 7, '...', max - 1, max]
  }
  if (current >= max - 2) {
    return [1, 2, '...', max - 4, max - 3, max - 2, max - 1, max]
  }
  return [1, '...', current - 1, current, current + 1, '...', max - 1, max]
}

function SearchInputIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
