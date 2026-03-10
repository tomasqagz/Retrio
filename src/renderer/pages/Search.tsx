import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import { toast } from '../components/Toaster'
import type { Game, Platform, SortBy } from '../../shared/types'
import { platformLabel } from '../utils/platform'
import './Search.css'

const PLATFORMS: Array<Platform | 'Todas'> = ['Todas', 'NES', 'SNES', 'N64', 'Sega Genesis', 'Sega Saturn', 'PS1', 'PS2']

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  'Sega Saturn':  '#ec4899',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
}

const GENRES: Array<{ id: number; labelKey: string }> = [
  { id:  4, labelKey: 'search.genre_fights' },
  { id:  5, labelKey: 'search.genre_shooter' },
  { id:  8, labelKey: 'search.genre_platforms' },
  { id:  9, labelKey: 'search.genre_puzzle' },
  { id: 10, labelKey: 'search.genre_racing' },
  { id: 12, labelKey: 'search.genre_rpg' },
  { id: 13, labelKey: 'search.genre_simulator' },
  { id: 14, labelKey: 'search.genre_sports' },
  { id: 15, labelKey: 'search.genre_strategy' },
  { id: 25, labelKey: 'search.genre_hack_slash' },
  { id: 31, labelKey: 'search.genre_adventure' },
  { id: 33, labelKey: 'search.genre_arcade' },
]

const SORT_OPTIONS: Array<{ value: SortBy; labelKey: string }> = [
  { value: 'relevance', labelKey: 'search.sort_relevance' },
  { value: 'rating',    labelKey: 'search.sort_rating' },
  { value: 'popular',   labelKey: 'search.sort_popular' },
  { value: 'newest',    labelKey: 'search.sort_newest' },
  { value: 'oldest',    labelKey: 'search.sort_oldest' },
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
  const { t } = useTranslation()
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
  const [libraryIds, setLibraryIds] = useState<Set<number>>(new Set())
  const handleDetailClose = useCallback(() => setSelectedGame(null), [])
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
      setError(err instanceof Error ? err.message : t('search.unknown_error'))
      setResults([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [t])

  function handlePageChange(p: number) {
    setPage(p)
    runSearch(query, activePlatform, sortBy, p, false, genreId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    runSearch(query, activePlatform, sortBy, 1, true, null)
    if (IS_ELECTRON) {
      void window.retrio.getLibrary().then((games) => setLibraryIds(new Set(games.map((g) => g.id))))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(game: Game) {
    if (!IS_ELECTRON) return
    await window.retrio.addToLibrary({ ...game, downloaded: false, downloading: false })
    setLibraryIds((prev) => new Set(prev).add(game.id))
    toast(t('search.added', { title: game.title }), 'success')
  }

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

  const platformAllLabel = t('search.platform_all')

  function getResultsLabel() {
    if (query) {
      const key = results.length !== 1 ? 'search.results_query_plural' : 'search.results_query'
      return t(key, { count: results.length, query, page })
    }
    if (activePlatform === 'Todas') return t('search.results_popular_all', { page })
    return t('search.results_popular', { platform: activePlatform, page })
  }

  return (
    <div className="page search-page">
      <div className="search-header">
        <h1 className="search-title">{t('search.title')}</h1>
        <div className="search-box">
          <SearchInputIcon />
          <input
            type="text"
            className="search-input"
            placeholder={t('search.placeholder')}
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
            const color = p !== 'Todas' ? PLATFORM_COLORS[p as Platform] : undefined
            const label = p === 'Todas' ? platformAllLabel : platformLabel(p)
            return (
              <button
                key={p}
                className={`filter-chip ${activePlatform === p ? 'filter-chip--active' : ''}`}
                style={undefined}
                onClick={() => handlePlatformChange(p)}
              >
                {color && <span className="filter-chip-dot" style={{ background: color }} />}
                {label}
              </button>
            )
          })}
        </div>
        <div className="filter-selects">
          <select className="sort-select" value={genreId ?? ''} onChange={handleGenreChange}>
            <option value="">{t('search.all_genres')}</option>
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>{t(g.labelKey)}</option>
            ))}
          </select>
          <select className="sort-select" value={sortBy} onChange={handleSortChange}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="search-results">
        {error && (
          <div className="search-error">
            <p className="search-error-title">{t('search.error_title')}</p>
            <p className="search-error-msg">{error}</p>
          </div>
        )}

        {loading && (
          <div className="search-state">
            <div className="spinner" />
            <p>{t('search.loading')}</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && query && (
          <div className="search-state">
            <p className="search-empty-title">{t('search.no_results_title', { query })}</p>
            <p className="search-empty-sub">{t('search.no_results_sub')}</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <p className="search-count">{getResultsLabel()}</p>
            <div className="games-grid">
              {results.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onClick={() => setSelectedGame(game)}
                  onAdd={IS_ELECTRON ? handleAdd : undefined}
                  inLibrary={libraryIds.has(game.id)}
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
          onClose={handleDetailClose}
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
