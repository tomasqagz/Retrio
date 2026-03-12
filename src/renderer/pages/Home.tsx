import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GameDetail from '../components/GameDetail'
import type { Game, Platform } from '../../shared/types'
import './Home.css'

const PLATFORM_COLORS: Record<Platform, string> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  'Sega Saturn': '#ec4899',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
  Desconocida: '#444',
}

const IS_ELECTRON = Boolean(window.retrio)

function formatPlayTime(seconds: number): string {
  if (seconds < 60) return '< 1m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatLastPlayed(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400)
  if (days === 0) return t('home.played_today')
  if (days === 1) return t('home.played_yesterday')
  return t('home.played_days_ago', { n: days })
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [library, setLibrary] = useState<Game[]>([])
  const [totalStorage, setTotalStorage] = useState(0)
  const [storageByPlatform, setStorageByPlatform] = useState<Record<string, number>>({})
  const [platformView, setPlatformView] = useState<'count' | 'storage' | 'playtime'>('count')
  const [recentView, setRecentView] = useState<'recent' | 'most'>('recent')
  const [carouselOffset, setCarouselOffset] = useState(0)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  useEffect(() => {
    if (!IS_ELECTRON) return
    void window.retrio.getLibrary().then((games) => {
      setLibrary(games)
      const downloaded = games.filter((g) => g.downloaded)
      void Promise.all(downloaded.map((g) => window.retrio.getRomInfo(g.id))).then((infos) => {
        const total = infos.reduce((acc, info) => acc + (info?.fileSize ?? 0), 0)
        setTotalStorage(total)
        const byPlatform: Record<string, number> = {}
        downloaded.forEach((g, i) => {
          byPlatform[g.platform] = (byPlatform[g.platform] ?? 0) + (infos[i]?.fileSize ?? 0)
        })
        setStorageByPlatform(byPlatform)
      })
    })
  }, [])

  const recentlyPlayed = library
    .filter((g) => g.lastPlayedAt != null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 5)

  const mostPlayed = library
    .filter((g) => (g.playTime ?? 0) > 0)
    .sort((a, b) => (b.playTime ?? 0) - (a.playTime ?? 0))
    .slice(0, 5)

  const lastPlayed = recentView === 'recent' ? recentlyPlayed : mostPlayed

  const favorites = library.filter((g) => g.favorite)

  const totalPlaySeconds = library.reduce((acc, g) => acc + (g.playTime ?? 0), 0)
  const installedCount = library.filter((g) => g.downloaded).length

  const byPlatform = library.reduce<Record<string, number>>((acc, g) => {
    acc[g.platform] = (acc[g.platform] ?? 0) + 1
    return acc
  }, {})

  const playTimeByPlatform = library.reduce<Record<string, number>>((acc, g) => {
    acc[g.platform] = (acc[g.platform] ?? 0) + (g.playTime ?? 0)
    return acc
  }, {})

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">{t('home.hero_title')}</h1>
          <p className="home-hero-subtitle">{t('home.hero_subtitle')}</p>
          <div className="home-hero-actions">
            <button className="btn-primary" onClick={() => navigate('/search')}>
              {t('home.search_games')}
            </button>
            {library.length > 0 && (
              <button className="btn-secondary" onClick={() => navigate('/library')}>
                {t('home.my_library')}
              </button>
            )}
          </div>
        </div>
        {favorites.length > 0 ? (
          <div className="home-hero-carousel-section">
            <button
              className="home-hero-carousel-arrow"
              onClick={() => setCarouselOffset((o) => Math.max(0, o - 1))}
              disabled={carouselOffset === 0}
              aria-label="Anterior"
            >
              <ChevronLeftIcon />
            </button>
            <div className="home-hero-carousel-covers">
              {favorites.slice(carouselOffset, carouselOffset + 5).map((game, i) => (
                <div
                  key={game.id}
                  className="home-hero-carousel-item"
                  style={{ transform: `rotate(${[2, -3, 1.5, -2, 3][i] ?? 0}deg)` }}
                  onClick={() => setSelectedGame(game)}
                  title={game.title}
                >
                  {game.coverUrl ? (
                    <img src={game.coverUrl} alt={game.title} />
                  ) : (
                    <div className="home-hero-carousel-placeholder">{game.title[0]}</div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="home-hero-carousel-arrow"
              onClick={() => setCarouselOffset((o) => Math.min(favorites.length - 5, o + 1))}
              disabled={carouselOffset + 5 >= favorites.length}
              aria-label="Siguiente"
            >
              <ChevronRightIcon />
            </button>
          </div>
        ) : (
          <div className="home-hero-decoration" aria-hidden="true">
            <div className="pixel-grid" />
          </div>
        )}
      </div>

      {/* Stats */}
      {library.length > 0 && (
        <section className="home-section">
          <div className="stats-grid">
            <div className="stat-tile">
              <span className="stat-value">{library.length}</span>
              <span className="stat-label">{t('home.stats_games')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{installedCount}</span>
              <span className="stat-label">{t('home.stats_installed')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{favorites.length}</span>
              <span className="stat-label">{t('home.stats_favorites')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{formatPlayTime(totalPlaySeconds)}</span>
              <span className="stat-label">{t('home.stats_hours')}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{formatBytes(totalStorage)}</span>
              <span className="stat-label">{t('home.stats_storage')}</span>
            </div>
          </div>

          {Object.keys(byPlatform).length > 0 && (
            <div className="stats-platform-section">
              <div className="stats-platform-header">
                <p className="stats-platform-title">{t('home.stats_by_platform')}</p>
                <div className="stats-platform-toggle">
                  <button
                    className={`stats-platform-toggle-btn${platformView === 'count' ? ' active' : ''}`}
                    onClick={() => setPlatformView('count')}
                  >
                    {t('home.stats_view_count')}
                  </button>
                  <button
                    className={`stats-platform-toggle-btn${platformView === 'storage' ? ' active' : ''}`}
                    onClick={() => setPlatformView('storage')}
                  >
                    {t('home.stats_view_storage')}
                  </button>
                  <button
                    className={`stats-platform-toggle-btn${platformView === 'playtime' ? ' active' : ''}`}
                    onClick={() => setPlatformView('playtime')}
                  >
                    {t('home.stats_view_playtime')}
                  </button>
                </div>
              </div>
              <div className="stats-platform-list">
                {Object.entries(byPlatform)
                  .sort((a, b) => {
                    if (platformView === 'storage') return (storageByPlatform[b[0]] ?? 0) - (storageByPlatform[a[0]] ?? 0)
                    if (platformView === 'playtime') return (playTimeByPlatform[b[0]] ?? 0) - (playTimeByPlatform[a[0]] ?? 0)
                    return b[1] - a[1]
                  })
                  .map(([platform, count]) => {
                    const storageVal = storageByPlatform[platform] ?? 0
                    const playVal = playTimeByPlatform[platform] ?? 0
                    const barPct = platformView === 'storage'
                      ? totalStorage > 0 ? (storageVal / totalStorage) * 100 : 0
                      : platformView === 'playtime'
                        ? totalPlaySeconds > 0 ? (playVal / totalPlaySeconds) * 100 : 0
                        : (count / library.length) * 100
                    const label = platformView === 'storage'
                      ? formatBytes(storageVal)
                      : platformView === 'playtime'
                        ? formatPlayTime(playVal)
                        : String(count)
                    return (
                      <div key={platform} className="stats-platform-row">
                        <span
                          className="stats-platform-dot"
                          style={{ background: PLATFORM_COLORS[platform as Platform] ?? '#555' }}
                        />
                        <span className="stats-platform-name">{platform}</span>
                        <div className="stats-platform-bar-wrap">
                          <div
                            className="stats-platform-bar"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="stats-platform-count">{label}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Últimos jugados */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">
            {recentView === 'recent' ? t('home.last_played') : t('home.most_played')}
          </h2>
          <div className="section-toggle">
            <button
              className={`section-toggle-btn${recentView === 'recent' ? ' active' : ''}`}
              onClick={() => setRecentView('recent')}
            >
              {t('home.view_recent')}
            </button>
            <button
              className={`section-toggle-btn${recentView === 'most' ? ' active' : ''}`}
              onClick={() => setRecentView('most')}
            >
              {t('home.view_most_played')}
            </button>
          </div>
        </div>
        {lastPlayed.length === 0 ? (
          <p className="home-empty-hint">{t('home.no_last_played')}</p>
        ) : (
          <div className="last-played-list">
            {lastPlayed.map((game) => (
              <LastPlayedRow
                key={game.id}
                game={game}
                formatLastPlayed={(ts) => formatLastPlayed(ts, t)}
                onClick={() => setSelectedGame(game)}
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

interface LastPlayedRowProps {
  game: Game
  formatLastPlayed: (ts: number) => string
  onClick: () => void
}

function LastPlayedRow({ game, formatLastPlayed, onClick }: LastPlayedRowProps) {
  const platformColor = PLATFORM_COLORS[game.platform] ?? '#555'

  return (
    <div className="lp-row" onClick={onClick}>
      <div className="lp-cover">
        {game.coverUrl ? (
          <img src={game.coverUrl} alt={game.title} />
        ) : (
          <div className="lp-cover-placeholder">{game.title[0]}</div>
        )}
      </div>

      <div className="lp-info">
        <span className="lp-title">{game.title}</span>
        <div className="lp-meta">
          <span className="lp-platform" style={{ color: platformColor }}>
            {game.platform}
          </span>
          <span className="lp-dot">·</span>
          <span className="lp-date">{formatLastPlayed(game.lastPlayedAt!)}</span>
        </div>
      </div>

      <div className="lp-playtime">
        <ClockIcon />
        <span>{formatPlayTime(game.playTime ?? 0)}</span>
      </div>

    </div>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
