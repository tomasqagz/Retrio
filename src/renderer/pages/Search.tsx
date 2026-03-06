import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import type { Game, Platform } from '../../shared/types'
import './Search.css'

const PLATFORMS: Array<Platform | 'Todas'> = ['Todas', 'NES', 'SNES', 'Sega Genesis', 'PS1', 'PS2', 'N64']

const IS_ELECTRON = Boolean(window.retrio)

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/igdb${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(err.error || res.statusText)
  }
  return res.json() as Promise<T>
}

async function fetchGames(query: string, platform: Platform | 'Todas'): Promise<Game[]> {
  if (IS_ELECTRON) {
    return window.retrio.searchGames(query, platform === 'Todas' ? null : platform)
  }
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (platform !== 'Todas') params.set('platform', platform)
  return apiFetch<Game[]>(`/search?${params}`)
}

async function fetchPopular(platform: Platform | 'Todas'): Promise<Game[]> {
  if (IS_ELECTRON) {
    return window.retrio.getPopularGames(platform === 'Todas' ? null : platform)
  }
  const params = new URLSearchParams()
  if (platform !== 'Todas') params.set('platform', platform)
  return apiFetch<Game[]>(`/popular?${params}`)
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [activePlatform, setActivePlatform] = useState<Platform | 'Todas'>(
    (searchParams.get('platform') as Platform) ?? 'Todas'
  )
  const [results, setResults] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string, platform: Platform | 'Todas') => {
    setError(null)
    setLoading(true)
    try {
      const data = q || platform !== 'Todas'
        ? await fetchGames(q, platform)
        : await fetchPopular(platform)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runSearch(query, activePlatform)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setSearchParams(val ? { q: val } : {})
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val, activePlatform), 400)
  }

  function handlePlatformChange(platform: Platform | 'Todas') {
    setActivePlatform(platform)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runSearch(query, platform)
  }

  function handleClear() {
    setQuery('')
    setSearchParams({})
    runSearch('', activePlatform)
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
        {PLATFORMS.map((p) => (
          <button
            key={p}
            className={`filter-chip ${activePlatform === p ? 'filter-chip--active' : ''}`}
            onClick={() => handlePlatformChange(p)}
          >
            {p}
          </button>
        ))}
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
                ? `${results.length} resultado${results.length !== 1 ? 's' : ''} para "${query}"`
                : `${activePlatform === 'Todas' ? 'Populares' : activePlatform} — ${results.length} juegos`}
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
