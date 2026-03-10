import React from 'react'
import { useTranslation } from 'react-i18next'
import type { Game, Platform } from '../../shared/types'
import './GameCard.css'

const PLATFORM_COLORS: Record<Platform, string> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  'Sega Saturn':  '#ec4899',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
  Desconocida: '#444',
}

interface GameCardProps {
  game: Game
  onClick?: (game: Game) => void
  onPlay?: (game: Game) => void
  onRemove?: (game: Game) => void
  onAdd?: (game: Game) => void
  inLibrary?: boolean
  grayscale?: boolean
}

export default function GameCard({ game, onClick, onPlay, onRemove, onAdd, inLibrary, grayscale }: GameCardProps) {
  const { t } = useTranslation()
  const { title, platform, coverUrl, year, rating, downloaded, downloading, progress } = game
  const platformColor = PLATFORM_COLORS[platform] ?? '#555'

  function handleActionClick(e: React.MouseEvent, fn?: (game: Game) => void) {
    e.stopPropagation()
    fn?.(game)
  }

  return (
    <div className="game-card" onClick={() => onClick?.(game)}>
      <div className={`game-card-cover${grayscale ? ' game-card-cover--grayscale' : ''}`}>
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

        {onAdd && (
          <button
            className={`game-card-add-btn ${inLibrary ? 'game-card-add-btn--added' : ''}`}
            title={inLibrary ? t('gamecard.in_library') : t('gamecard.add_to_library')}
            onClick={(e) => { e.stopPropagation(); if (!inLibrary) onAdd(game) }}
          >
            {inLibrary ? <CheckIcon /> : <span style={{ fontSize: '20px', lineHeight: 1, marginTop: '-1px' }}>+</span>}
          </button>
        )}

        <div className="game-card-hover-overlay">
          {downloaded ? (
            <button
              className="game-card-action-btn game-card-action-btn--play"
              onClick={(e) => handleActionClick(e, onPlay)}
            >
              <PlayIcon />
              <span>{t('gamecard.play')}</span>
            </button>
          ) : (
            <span className="game-card-hint">{t('gamecard.view_details')}</span>
          )}
        </div>

        {onRemove && (
          <button
            className="game-card-remove-btn"
            title={t('gamecard.remove_hint')}
            onClick={(e) => handleActionClick(e, onRemove)}
          >
            <TrashIcon />
          </button>
        )}
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

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

