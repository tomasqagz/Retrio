import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import GameCard from '../components/GameCard'
import GameDetail from '../components/GameDetail'
import AddLocalGameModal from '../components/AddLocalGameModal'
import { toast } from '../components/Toaster'
import { confirm } from '../components/ConfirmDialog'
import type { Game, Platform } from '../../shared/types'
import './Library.css'

type SortKey = 'recent' | 'title' | 'year'

const PLATFORMS: Array<Platform | 'Todas'> = ['Todas', 'NES', 'SNES', 'N64', 'Sega Genesis', 'Sega Saturn', 'PS1', 'PS2']

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  'Sega Saturn': '#ec4899',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
}

const IS_ELECTRON = Boolean(window.retrio)

export default function Library() {
  const { t } = useTranslation()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(IS_ELECTRON)
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [platform, setPlatform] = useState<Platform | 'Todas'>('Todas')
  const [query, setQuery] = useState('')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [localRomPath, setLocalRomPath] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'installed' | 'wishlist'>('all')

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

    const offProgress = window.retrio.onDownloadProgress((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId ? { ...g, progress: data.progress, downloading: true } : g
        )
      )
    })

    const offDone = window.retrio.onDownloadDone((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId
            ? { ...g, downloading: false, downloaded: true, romPath: data.romPath, progress: 100 }
            : g
        )
      )
    })

    const offError = window.retrio.onDownloadError((data) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId ? { ...g, downloading: false, progress: 0 } : g
        )
      )
    })

    return () => { offProgress(); offDone(); offError() }
  }, [])

  async function handleRemove(game: Game) {
    if (!IS_ELECTRON) return
    if (!await confirm(t('library.remove_confirm', { title: game.title }))) return
    await window.retrio.removeFromLibrary(game.id)
    setGames((prev) => prev.filter((g) => g.id !== game.id))
  }

  async function handleAddLocal() {
    if (!IS_ELECTRON) return
    const filePath = await window.retrio.openRomDialog()
    if (filePath) setLocalRomPath(filePath)
  }

  const handleDetailClose = useCallback(() => {
    setSelectedGame(null)
    void loadLibrary()
  }, [loadLibrary])

  async function handlePlay(game: Game) {
    if (!IS_ELECTRON || !game.romPath) {
      toast(t('library.rom_not_found'), 'error')
      return
    }
    if (!await confirm(t('library.play_confirm', { title: game.title }), { confirmLabel: t('gamecard.play'), danger: false })) return
    try {
      await window.retrio.launchGame(game.romPath, game.platform, game.id)
    } catch (err) {
      const raw = err instanceof Error ? err.message : t('library.launch_error')
      const msg = raw.includes(': Error: ') ? raw.split(': Error: ').pop()! : raw
      toast(msg, 'error')
    }
  }

  const filtered = games
    .filter((g) =>
      (platform === 'Todas' || g.platform === platform) &&
      (!query || g.title.toLowerCase().includes(query.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0)
      return b.id - a.id
    })

  const installed = filtered.filter((g) => g.downloaded)
  const wishlist = filtered.filter((g) => !g.downloaded)
  const sorted = activeTab === 'installed' ? installed
    : activeTab === 'wishlist' ? wishlist
    : [...installed, ...wishlist]

  const platformAllLabel = t('search.platform_all')

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
          {t('library.title')}
          {games.length > 0 && (
            <span className="library-count">{games.length}</span>
          )}
        </h1>
        <div className="library-search">
          <input
            type="text"
            className="library-search-input"
            placeholder={t('library.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="library-search-clear" onClick={() => setQuery('')}>✕</button>
          )}
        </div>
        <button className="library-add-local" onClick={() => void handleAddLocal()} title={t('library.add_rom_title')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('library.add_rom')}
        </button>
        <div className="library-sort">
          <label htmlFor="sort-select" className="sort-label">{t('library.sort_label')}</label>
          <select
            id="sort-select"
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="recent">{t('library.sort_recent')}</option>
            <option value="title">{t('library.sort_title')}</option>
            <option value="year">{t('library.sort_year')}</option>
          </select>
        </div>
      </div>

      <div className="library-tabs">
        <button
          className={`library-tab ${activeTab === 'all' ? 'library-tab--active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          {t('library.tab_all')}
          {games.length > 0 && <span className="library-tab-count">{games.length}</span>}
        </button>
        <button
          className={`library-tab ${activeTab === 'installed' ? 'library-tab--active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          {t('library.tab_installed')}
          {installed.length > 0 && <span className="library-tab-count">{installed.length}</span>}
        </button>
        <button
          className={`library-tab ${activeTab === 'wishlist' ? 'library-tab--active' : ''}`}
          onClick={() => setActiveTab('wishlist')}
        >
          {t('library.tab_not_installed')}
          {wishlist.length > 0 && <span className="library-tab-count">{wishlist.length}</span>}
        </button>
      </div>

      <div className="library-platforms">
        {PLATFORMS.map((p) => {
          const color = p !== 'Todas' ? PLATFORM_COLORS[p as Platform] : undefined
          const label = p === 'Todas' ? platformAllLabel : p
          return (
            <button
              key={p}
              className={`filter-chip ${platform === p ? 'filter-chip--active' : ''}`}
              onClick={() => setPlatform(p)}
            >
              {color && <span className="filter-chip-dot" style={{ background: color }} />}
              {label}
            </button>
          )
        })}
      </div>

      {sorted.length > 0 ? (
        <section className="library-section">
          <div className="games-grid">
            {sorted.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onClick={() => setSelectedGame(game)}
                onPlay={game.downloaded ? handlePlay : undefined}
                onRemove={handleRemove}
                grayscale={!game.downloaded}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="library-empty">
          <div className="library-empty-icon">📂</div>
          {activeTab === 'installed' ? (
            <>
              <p className="library-empty-title">{t('library.empty_installed_title')}</p>
              <p className="library-empty-sub">{t('library.empty_installed_sub')}</p>
            </>
          ) : activeTab === 'wishlist' ? (
            <>
              <p className="library-empty-title">{t('library.empty_wishlist_title')}</p>
              <p className="library-empty-sub">{t('library.empty_wishlist_sub')}</p>
            </>
          ) : (
            <>
              <p className="library-empty-title">{t('library.empty_title')}</p>
              <p className="library-empty-sub">{t('library.empty_sub')}</p>
            </>
          )}
        </div>
      )}

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={handleDetailClose}
          onRemoved={(id) => setGames((prev) => prev.filter((g) => g.id !== id))}
        />
      )}

      {localRomPath && (
        <AddLocalGameModal
          filePath={localRomPath}
          onClose={() => setLocalRomPath(null)}
          onAdded={(game) => {
            setGames((prev) => [game, ...prev])
            setLocalRomPath(null)
          }}
        />
      )}
    </div>
  )
}
