import React, { useState } from 'react'
import GameCard from '../components/GameCard.jsx'
import './Library.css'

const LIBRARY_GAMES = [
  { id: 3, title: 'Super Mario 64', platform: 'N64', year: 1996, coverUrl: null, downloaded: true },
  { id: 9, title: 'Metal Gear Solid', platform: 'PS1', year: 1998, coverUrl: null, downloaded: true },
  { id: 10, title: 'Chrono Trigger', platform: 'SNES', year: 1995, coverUrl: null, downloaded: true, downloading: false },
  { id: 11, title: 'Streets of Rage 2', platform: 'Sega Genesis', year: 1992, coverUrl: null, downloaded: false, downloading: true, progress: 62 },
]

export default function Library() {
  const [games, setGames] = useState(LIBRARY_GAMES)
  const [sortBy, setSortBy] = useState('recent')

  const downloading = games.filter((g) => g.downloading)
  const downloaded = games.filter((g) => g.downloaded)

  function handlePlay(game) {
    alert(`Lanzando ${game.title}...`)
  }

  const sorted = [...downloaded].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title)
    if (sortBy === 'year') return b.year - a.year
    return b.id - a.id
  })

  return (
    <div className="page library-page">
      <div className="library-header">
        <h1 className="library-title">Mi biblioteca</h1>
        <div className="library-sort">
          <label htmlFor="sort-select" className="sort-label">Ordenar por</label>
          <select
            id="sort-select"
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
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
          <div className="section-header">
            <h2 className="section-title">
              {sorted.length} juego{sorted.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="games-grid">
            {sorted.map((game) => (
              <GameCard key={game.id} game={game} onPlay={handlePlay} />
            ))}
          </div>
        </section>
      ) : (
        <div className="library-empty">
          <div className="library-empty-icon">📂</div>
          <p className="library-empty-title">Tu biblioteca está vacía</p>
          <p className="library-empty-sub">
            Ve a Buscar para encontrar y descargar tu primer juego
          </p>
        </div>
      )}
    </div>
  )
}
