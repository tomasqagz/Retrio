import React from 'react'
import type { Game, Platform } from '../../shared/types'
import './GameCard.css'

const PLATFORM_COLORS: Record<Platform, string> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
  Desconocida: '#444',
}

interface GameCardProps {
  game: Game
  onClick?: (game: Game) => void
  onPlay?: (game: Game) => void
  onDownload?: (game: Game) => void
  onRemove?: (game: Game) => void
}

export default function GameCard({ game, onClick, onPlay, onDownload, onRemove }: GameCardProps) {
  const { title, platform, coverUrl, year, rating, downloaded, downloading, progress } = game
  const platformColor = PLATFORM_COLORS[platform] ?? '#555'

  function handleActionClick(e: React.MouseEvent, fn?: (game: Game) => void) {
    e.stopPropagation()
    fn?.(game)
  }

  return (
    <div className="game-card" onClick={() => onClick?.(game)}>
      <div className="game-card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt={title} loading="lazy" />
        ) : (
          <div className="game-card-cover-placeholder">
            <span>{title[0]}</span>
          </div>
        )}

        <div className="game-card-platform" style={{ background: platformColor }}>
          {platform}
        </div>

        {rating != null && (
          <div className="game-card-rating">★ {rating}</div>
        )}

        <div className="game-card-hover-overlay">
          {downloaded ? (
            <button
              className="game-card-action-btn game-card-action-btn--play"
              onClick={(e) => handleActionClick(e, onPlay)}
            >
              <PlayIcon />
              <span>Jugar</span>
            </button>
          ) : (
            <span className="game-card-hint">Ver detalles</span>
          )}
          {onRemove && (
            <button
              className="game-card-remove-btn"
              title="Quitar de la biblioteca"
              onClick={(e) => handleActionClick(e, onRemove)}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {downloading && (
        <div className="game-card-progress">
          <div className="game-card-progress-bar" style={{ width: `${progress ?? 0}%` }} />
        </div>
      )}

      <div className="game-card-info">
        <div className="game-card-title" title={title}>{title}</div>
        {year != null && <div className="game-card-year">{year}</div>}
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
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
