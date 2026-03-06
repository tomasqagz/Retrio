import { useEffect, useState } from 'react'
import type { Game, Platform } from '../../shared/types'
import './GameDetail.css'

const PLATFORM_COLORS: Record<Platform, string> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  PS1: '#00439c',
  PS2: '#00439c',
  N64: '#008a00',
  PC: '#666',
  Desconocida: '#444',
}

interface GameDetailProps {
  game: Game
  onClose: () => void
}

async function fetchDetail(id: number): Promise<Game | null> {
  if (window.retrio) {
    return window.retrio.getGameById(id)
  }
  const res = await fetch(`/api/igdb/game/${id}`)
  if (!res.ok) throw new Error(res.statusText)
  return res.json() as Promise<Game>
}

export default function GameDetail({ game, onClose }: GameDetailProps) {
  const [detail, setDetail] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    fetchDetail(game.id)
      .then((data) => setDetail(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [game.id])

  const data = detail ?? game
  const platformColor = PLATFORM_COLORS[data.platform] ?? '#555'

  return (
    <div className="game-detail-overlay" onClick={onClose}>
      <div className="game-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button className="game-detail-close" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="game-detail-layout">
          <div className="game-detail-cover">
            {data.coverUrl ? (
              <img src={data.coverUrl} alt={data.title} />
            ) : (
              <div className="game-detail-cover-placeholder">
                {data.title[0]}
              </div>
            )}
          </div>

          <div className="game-detail-info">
            <div className="game-detail-platform" style={{ color: platformColor }}>
              {data.platform}
            </div>
            <h2 className="game-detail-title">{data.title}</h2>

            <div className="game-detail-meta">
              {data.year != null && <span className="meta-chip">{data.year}</span>}
              {data.rating != null && (
                <span className="meta-chip meta-chip--rating">★ {data.rating}</span>
              )}
              {data.genres?.map((g) => (
                <span key={g} className="meta-chip">{g}</span>
              ))}
            </div>

            {loading && <p className="game-detail-loading">Cargando detalles...</p>}

            {data.summary && (
              <p className="game-detail-summary">{data.summary}</p>
            )}

            {data.developers && data.developers.length > 0 && (
              <p className="game-detail-developer">
                Desarrollado por {data.developers.join(', ')}
              </p>
            )}

            <div className="game-detail-actions">
              {data.downloaded ? (
                <button className="btn-action btn-action--play">
                  <PlayIcon /> Jugar
                </button>
              ) : (
                <button className="btn-action btn-action--download">
                  <DownloadIcon /> Descargar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
