import { useState, useEffect } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import type { Game, Platform } from '../../shared/types'
import './Home.css'

interface PlatformEntry {
  name: Platform
  color: string
}

const PLATFORMS: PlatformEntry[] = [
  { name: 'NES', color: '#e53e3e' },
  { name: 'SNES', color: '#7b2d8b' },
  { name: 'Sega Genesis', color: '#1a56db' },
  { name: 'PS1', color: '#00439c' },
  { name: 'PS2', color: '#00439c' },
  { name: 'N64', color: '#008a00' },
]

const IS_ELECTRON = Boolean(window.retrio)

async function fetchPopular(): Promise<Game[]> {
  if (IS_ELECTRON) return window.retrio.getPopularGames(null)
  const res = await fetch('/api/igdb/popular')
  if (!res.ok) return []
  return res.json() as Promise<Game[]>
}

export default function Home() {
  const navigate = useNavigate()
  const [popular, setPopular] = useState<Game[]>([])
  const [library, setLibrary] = useState<Game[]>([])
  const [loadingPopular, setLoadingPopular] = useState(true)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  useEffect(() => {
    fetchPopular()
      .then(setPopular)
      .finally(() => setLoadingPopular(false))

    if (IS_ELECTRON) {
      void window.retrio.getLibrary().then((games) =>
        setLibrary(games.slice(0, 6))
      )
    }
  }, [])

  const recentLibrary = library.filter((g) => g.downloaded || g.downloading)

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">Tu biblioteca retro</h1>
          <p className="home-hero-subtitle">
            Busca, descarga y juega en segundos. Sin configurar nada.
          </p>
          <div className="home-hero-actions">
            <button className="btn-primary" onClick={() => navigate('/search')}>
              Buscar juegos
            </button>
            {recentLibrary.length > 0 && (
              <button className="btn-secondary" onClick={() => navigate('/library')}>
                Mi biblioteca · {library.length}
              </button>
            )}
          </div>
        </div>
        <div className="home-hero-decoration" aria-hidden="true">
          <div className="pixel-grid" />
        </div>
      </div>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Consolas</h2>
        </div>
        <div className="platforms-grid">
          {PLATFORMS.map((p) => (
            <button
              key={p.name}
              className="platform-chip"
              style={{ '--platform-color': p.color } as React.CSSProperties}
              onClick={() => navigate(`/search?platform=${encodeURIComponent(p.name)}`)}
            >
              <span className="platform-chip-dot" />
              <span className="platform-chip-name">{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      {recentLibrary.length > 0 && (
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Últimos añadidos</h2>
            <button className="section-link" onClick={() => navigate('/library')}>
              Ver biblioteca
            </button>
          </div>
          <div className="games-grid">
            {recentLibrary.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onClick={() => setSelectedGame(game)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Populares</h2>
          <button className="section-link" onClick={() => navigate('/search')}>
            Ver todos
          </button>
        </div>
        {loadingPopular ? (
          <div className="home-loading">
            <div className="spinner" />
          </div>
        ) : (
          <div className="games-grid">
            {popular.slice(0, 12).map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onClick={() => setSelectedGame(game)}
                onDownload={() => setSelectedGame(game)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  )
}
