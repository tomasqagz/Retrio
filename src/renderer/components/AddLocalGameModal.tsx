import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game, Platform } from '../../shared/types'
import './AddLocalGameModal.css'

const PLATFORMS: Platform[] = ['NES', 'SNES', 'N64', 'Sega Genesis', 'PS1', 'PS2']

const EXT_TO_PLATFORM: Record<string, Platform> = {
  nes: 'NES',
  smc: 'SNES', sfc: 'SNES', fig: 'SNES',
  md: 'Sega Genesis', gen: 'Sega Genesis', smd: 'Sega Genesis',
  n64: 'N64', z64: 'N64', v64: 'N64',
  iso: 'PS1', bin: 'PS1', cue: 'PS1', img: 'PS1', mdf: 'PS1', chd: 'PS1',
}

function detectPlatform(filePath: string): Platform {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_PLATFORM[ext] ?? 'PS1'
}

function filenameWithoutExt(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

interface Props {
  filePath: string
  onClose: () => void
  onAdded: (game: Game) => void
}

export default function AddLocalGameModal({ filePath, onClose, onAdded }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(filenameWithoutExt(filePath))
  const [platform, setPlatform] = useState<Platform>(detectPlatform(filePath))
  const [results, setResults] = useState<Game[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Game | null>(null)
  const [adding, setAdding] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!title.trim()) { setResults([]); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      setSelected(null)
      try {
        const res = await window.retrio.searchGames(title, platform, 'relevance', 0, null)
        setResults(res.slice(0, 6))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [title, platform])

  async function handleAdd() {
    setAdding(true)
    try {
      const base: Game = selected
        ? { ...selected, downloaded: true, downloading: false, romPath: filePath }
        : {
            id: Date.now(),
            title,
            platform,
            year: null,
            coverUrl: null,
            coverUrlHd: null,
            summary: null,
            rating: null,
            downloaded: true,
            downloading: false,
            romPath: filePath,
          }
      await window.retrio.addToLibrary(base)
      onAdded(base)
      onClose()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="alg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="alg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="alg-header">
          <h2 className="alg-title">{t('addlocal.title')}</h2>
          <button className="alg-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="alg-file">
          <span className="alg-file-label">{t('addlocal.file_label')}</span>
          <span className="alg-file-path" title={filePath}>{filePath}</span>
        </div>

        <div className="alg-fields">
          <div className="alg-field">
            <label className="alg-label">{t('addlocal.title_label')}</label>
            <input
              className="alg-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('addlocal.title_placeholder')}
            />
          </div>
          <div className="alg-field">
            <label className="alg-label">{t('addlocal.platform_label')}</label>
            <select
              className="alg-select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="alg-section-label">
          {t('addlocal.igdb_results')}
          {searching && <span className="alg-spinner" />}
        </div>

        {results.length > 0 ? (
          <div className="alg-results">
            {results.map((game) => (
              <button
                key={game.id}
                className={`alg-result ${selected?.id === game.id ? 'alg-result--selected' : ''}`}
                onClick={() => setSelected(selected?.id === game.id ? null : game)}
              >
                <div
                  className="alg-result-cover"
                  style={{ backgroundImage: game.coverUrl ? `url(${game.coverUrl})` : undefined }}
                />
                <div className="alg-result-info">
                  <span className="alg-result-title">{game.title}</span>
                  {game.year && <span className="alg-result-year">{game.year}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : !searching && title.trim() ? (
          <p className="alg-no-results">{t('addlocal.no_results')}</p>
        ) : null}

        {selected && (
          <div className="alg-selected-banner">
            {t('addlocal.metadata_prefix')} <strong>{selected.title}</strong>
          </div>
        )}

        <div className="alg-actions">
          <button className="alg-btn alg-btn--cancel" onClick={onClose}>{t('addlocal.cancel')}</button>
          <button
            className="alg-btn alg-btn--add"
            onClick={() => void handleAdd()}
            disabled={adding || !title.trim()}
          >
            {adding ? t('addlocal.adding') : t('addlocal.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
