import React from 'react'
import { useNavigate } from 'react-router-dom'
import GameCard from '../components/GameCard.jsx'
import './Home.css'

const FEATURED_GAMES = [
  { id: 1, title: 'Super Mario World', platform: 'SNES', year: 1990, coverUrl: null, downloaded: false },
  { id: 2, title: 'Sonic the Hedgehog 2', platform: 'Sega Genesis', year: 1992, coverUrl: null, downloaded: false },
  { id: 3, title: 'The Legend of Zelda: Ocarina of Time', platform: 'N64', year: 1998, coverUrl: null, downloaded: false },
  { id: 4, title: 'Final Fantasy VII', platform: 'PS1', year: 1997, coverUrl: null, downloaded: false },
  { id: 5, title: 'Donkey Kong Country', platform: 'SNES', year: 1994, coverUrl: null, downloaded: false },
  { id: 6, title: 'Crash Bandicoot', platform: 'PS1', year: 1996, coverUrl: null, downloaded: false },
]

const PLATFORMS = [
  { name: 'NES', color: '#e53e3e', games: 500 },
  { name: 'SNES', color: '#7b2d8b', games: 720 },
  { name: 'Sega Genesis', color: '#1a56db', games: 900 },
  { name: 'PS1', color: '#00439c', games: 2400 },
  { name: 'PS2', color: '#00439c', games: 3800 },
  { name: 'N64', color: '#008a00', games: 280 },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">Tu biblioteca retro</h1>
          <p className="home-hero-subtitle">
            Busca, descarga y juega en segundos. Sin configurar nada.
          </p>
          <button className="btn-primary" onClick={() => navigate('/search')}>
            Buscar juegos
          </button>
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
              style={{ '--platform-color': p.color }}
              onClick={() => navigate(`/search?platform=${encodeURIComponent(p.name)}`)}
            >
              <span className="platform-chip-dot" />
              <span className="platform-chip-name">{p.name}</span>
              <span className="platform-chip-count">{p.games.toLocaleString()} juegos</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Juegos populares</h2>
          <button className="section-link" onClick={() => navigate('/search')}>
            Ver todos
          </button>
        </div>
        <div className="games-grid">
          {FEATURED_GAMES.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </div>
  )
}
