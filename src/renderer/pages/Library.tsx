import { useState, useEffect, useCallback } from 'react'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import type { Game } from '../../shared/types'
import './Library.css'

type SortKey = 'recent' | 'title' | 'year'

const IS_ELECTRON = Boolean(window.retrio)

export default function Library() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(IS_ELECTRON)
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  const loadLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return
    setLoading(true)
    try {
      const data = await window.retrio.getLibrary()
      setGames(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    if (!IS_ELECTRON) return

    window.retrio.onDownloadProgress((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId ? { ...g, progress: data.progress, downloading: true } : g
        )
      )
    })

    window.retrio.onDownloadDone((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId
            ? { ...g, downloading: false, downloaded: true, romPath: data.romPath, progress: 100 }
            : g
        )
      )
    })

    window.retrio.onDownloadError((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId ? { ...g, downloading: false, progress: 0 } : g
        )
      )
    })
  }, [])

  async function handleRemove(game: Game) {
    if (!IS_ELECTRON) return
    await window.retrio.removeFromLibrary(game.id)
    setGames((prev) => prev.filter((g) => g.id !== game.id))
  }

  async function handlePlay(game: Game) {
    if (!IS_ELECTRON || !game.romPath) {
      alert(`Lanzando ${game.title}... (próximamente)`)
      return
    }
    await window.retrio.launchGame(game.romPath, game.platform)
  }

  const downloading = games.filter((g) => g.downloading)

  const sorted = games
    .filter((g) => !g.downloading)
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0)
      return b.id - a.id
    })

  if (loading) {
    return (
      <div className="page library-page">
        <div className="library-loading">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="page library-page">
      <div className="library-header">
        <h1 className="library-title">
          Mi biblioteca
          {games.length > 0 && (
            <span className="library-count">{games.length}</span>
          )}
        </h1>
        <div className="library-sort">
          <label htmlFor="sort-select" className="sort-label">Ordenar por</label>
          <select
            id="sort-select"
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="recent">Recientes</option>
            <option value="title">Título</option>
            <option value="year">Año</option>
          </select>
        </div>
      </div>

      {downloading.length > 0 && (
        <section className="library-section">
          <h2 className="section-title">Descargando</h2>
          <div className="games-grid">
            {downloading.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}

      {sorted.length > 0 ? (
        <section className="library-section">
          <div className="games-grid">
            {sorted.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onClick={() => setSelectedGame(game)}
                onPlay={handlePlay}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="library-empty">
          <div className="library-empty-icon">📂</div>
          <p className="library-empty-title">Tu biblioteca está vacía</p>
          <p className="library-empty-sub">
            Ve a Buscar para encontrar y añadir tu primer juego
          </p>
        </div>
      )}

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={() => {
            setSelectedGame(null)
            void loadLibrary()
          }}
        />
      )}
    </div>
  )
}
