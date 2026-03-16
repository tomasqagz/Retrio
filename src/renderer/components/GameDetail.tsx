import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game, Platform } from '../../shared/types'
import { platformLabel } from '../utils/platform'
import { confirm } from './ConfirmDialog'
import { pickRom } from './RomPickerModal'
import './GameDetail.css'

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

interface GameDetailProps {
  game: Game
  onClose: () => void
  onRemoved?: (gameId: number) => void
  onLibraryChange?: (gameId: number, inLibrary: boolean) => void
}

const IS_ELECTRON = Boolean(window.retrio)

async function fetchDetail(id: number): Promise<Game | null> {
  if (IS_ELECTRON) return window.retrio.getGameById(id)
  const res = await fetch(`/api/igdb/game/${id}`)
  if (!res.ok) throw new Error(res.statusText)
  return res.json() as Promise<Game>
}

export default function GameDetail({ game, onClose, onRemoved, onLibraryChange }: GameDetailProps) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [inLibrary, setInLibrary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState<{ type: 'image' | 'video'; src: string } | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [noRom, setNoRomState] = useState(false)
  const [romInfo, setRomInfo] = useState<{ fileSize: number; fileName: string } | null>(null)
  const [playTime, setPlayTime] = useState(0)
  const [lastPlayedAt, setLastPlayedAt] = useState<number | undefined>(undefined)
  const [favorite, setFavorite] = useState(false)
  const [activeTab, setActiveTab] = useState<'media' | 'details'>('media')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep a stable ref to onClose so the subscription effect doesn't re-run when the
  // parent re-renders (e.g. due to download progress updates changing Library state).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Fetch game details once when the game changes — intentionally excludes onClose.
  useEffect(() => {
    setLoading(true)
    fetchDetail(game.id)
      .then((data) => {
        setDetail(data)
        // If no media, default to details tab
        if (!data?.videos?.length && !data?.screenshots?.length) setActiveTab('details')
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    if (IS_ELECTRON) {
      void window.retrio.isInLibrary(game.id).then((has) => {
        setInLibrary(has)
        if (has) {
          void window.retrio.getLibrary().then((games) => {
            const g = games.find((x) => x.id === game.id)
            if (g) {
              setNoRomState(g.noRom ?? false)
              setPlayTime(g.playTime ?? 0)
              setLastPlayedAt(g.lastPlayedAt)
              setFavorite(g.favorite ?? false)
            }
          })
          void window.retrio.getRomInfo(game.id).then((info) => setRomInfo(info))
        }
      })
    }
  }, [game.id])

  // Subscribe to download events — stable, never needs to re-run.
  useEffect(() => {
    if (!IS_ELECTRON) return

    const offProgress = window.retrio.onDownloadProgress((data) => {
      if (data.gameId !== game.id) return
      setSearching(false)
      setDownloading(true)
      setProgress(data.progress)
    })

    const offDone = window.retrio.onDownloadDone((data) => {
      if (data.gameId !== game.id) return
      setDownloading(false)
      setProgress(100)
      setInLibrary(true)
      onCloseRef.current()
    })

    const offError = window.retrio.onDownloadError((data) => {
      if (data.gameId !== game.id) return
      setDownloading(false)
      setSearching(false)
      setDownloadError(data.message)
    })

    return () => { offProgress(); offDone(); offError() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])

  const handleAddToLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return
    setSaving(true)
    const gameToSave = detail ?? game
    await window.retrio.addToLibrary({ ...gameToSave, downloaded: false, downloading: false })
    setInLibrary(true)
    setSaving(false)
    onLibraryChange?.(game.id, true)
  }, [detail, game, onLibraryChange])

  const handleRemoveFromLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return
    if (!await confirm(t('gamedetail.remove_confirm', { title: game.title }), { subtitle: game.downloaded ? t('gamedetail.remove_confirm_sub') : undefined })) return
    setSaving(true)
    await window.retrio.removeFromLibrary(game.id)
    setSaving(false)
    onLibraryChange?.(game.id, false)
    onRemoved?.(game.id)
    onClose()
  }, [game.id, game.title, onClose, onLibraryChange, onRemoved, t])

  const handleDownload = useCallback(async () => {
    if (!IS_ELECTRON) return
    setDownloadError(null)
    setSearching(true)
    const gameToDownload = detail ?? game

    try {
      const roms = await window.retrio.findRoms(gameToDownload)

      if (roms.length === 0) {
        setSearching(false)
        setDownloadError(t('gamedetail.not_found', { title: gameToDownload.title, platform: gameToDownload.platform }))
        return
      }

      const picked = await pickRom(roms, gameToDownload.title)
      if (!picked) {
        setSearching(false)
        return
      }
      const romOption = picked

      await window.retrio.downloadGame(
        { ...gameToDownload, downloaded: false, downloading: true, progress: 0 },
        romOption,
      )
    } catch (err) {
      setSearching(false)
      setDownloadError(err instanceof Error ? err.message : String(err))
    }
  }, [detail, game, t])

  const handleCancel = useCallback(async () => {
    if (!IS_ELECTRON) return
    await window.retrio.cancelDownload(game.id)
    setDownloading(false)
    setSearching(false)
    setProgress(0)
  }, [game.id])

  const handlePlay = useCallback(async () => {
    if (!IS_ELECTRON || !game.romPath) return
    if (!await confirm(t('library.play_confirm', { title: game.title }), { confirmLabel: t('gamecard.play'), danger: false })) return
    try {
      await window.retrio.launchGame(game.romPath, game.platform, game.id)
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      const msg = raw.includes(': Error: ') ? raw.split(': Error: ').pop()! : raw
      if (msg) alert(msg)
    }
  }, [game, t])

  const handleToggleFavorite = useCallback(async () => {
    if (!IS_ELECTRON || !inLibrary) return
    await window.retrio.toggleFavorite(game.id)
    setFavorite((prev) => !prev)
  }, [game.id, inLibrary])

  const handleToggleNoRom = useCallback(async () => {
    if (!IS_ELECTRON) return
    const newValue = !noRom
    if (newValue) {
      if (!await confirm(t('gamedetail.no_rom_confirm', { title: game.title }), { subtitle: t('gamedetail.no_rom_confirm_sub') })) return
    }
    const gameToSave = detail ?? game
    if (!inLibrary) {
      await window.retrio.addToLibrary({ ...gameToSave, downloaded: false, downloading: false })
      setInLibrary(true)
    }
    await window.retrio.markNoRom(game.id, newValue)
    setNoRomState(newValue)
  }, [detail, game, inLibrary, noRom, t])

  const mediaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      el.scrollLeft += e.deltaY + e.deltaX
    }

    let startX = 0
    let startScroll = 0
    let dragging = false
    let hasDragged = false

    const onMouseDown = (e: MouseEvent) => {
      dragging = true
      hasDragged = false
      startX = e.clientX
      startScroll = el.scrollLeft
      el.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return
      if (e.buttons === 0) {
        dragging = false
        el.style.cursor = 'grab'
        return
      }
      const dx = e.clientX - startX
      if (Math.abs(dx) > 4) hasDragged = true
      el.scrollLeft = startScroll - dx
    }

    const onMouseUp = () => {
      dragging = false
      el.style.cursor = 'grab'
      setTimeout(() => { hasDragged = false }, 0)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (hasDragged) e.stopPropagation()
    }

    const onDragStart = (e: DragEvent) => e.preventDefault()

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('dragstart', onDragStart)
    document.addEventListener('click', onClickCapture, { capture: true })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('click', onClickCapture, { capture: true })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [detail])

  const data = detail ?? game
  const platformColor = PLATFORM_COLORS[data.platform] ?? '#555'

  return (
    <div className="game-detail-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="game-detail-panel" onClick={(e) => e.stopPropagation()}>
        {IS_ELECTRON && inLibrary && (
          <button
            className={`game-detail-favorite${favorite ? ' game-detail-favorite--active' : ''}`}
            title={t(favorite ? 'gamedetail.remove_favorite' : 'gamedetail.add_favorite')}
            onClick={() => void handleToggleFavorite()}
          >
            <HeartIcon filled={favorite} />
          </button>
        )}
        <button className="game-detail-close" onClick={onClose}>
          <CloseIcon />
        </button>

        <div className="game-detail-layout">
          <div className="game-detail-cover">
            {data.coverUrl ? (
              <img src={data.coverUrl} alt={data.title} />
            ) : (
              <div className="game-detail-cover-placeholder">{data.title[0]}</div>
            )}
          </div>

          <div className="game-detail-info">
            <div className="game-detail-platform" style={{ color: platformColor }}>
              {platformLabel(data.platform)}
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

            {loading && <p className="game-detail-loading">{t('gamedetail.loading')}</p>}

            {data.summary && <p className="game-detail-summary">{data.summary}</p>}

            {data.developers && data.developers.length > 0 && (
              <p className="game-detail-developer">
                {t('gamedetail.developer', { names: data.developers.join(', ') })}
              </p>
            )}

            {(searching || downloading) && (
              <div className="download-progress-area">
                {searching && (
                  <p className="download-status">{t('gamedetail.searching')}</p>
                )}
                {downloading && (
                  <>
                    <p className="download-status">{t('gamedetail.downloading', { progress })}</p>
                    <div className="download-progress-bar">
                      <div
                        className="download-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </>
                )}
                <button
                  className="btn-action btn-action--ghost"
                  onClick={() => void handleCancel()}
                >
                  {t('gamedetail.cancel')}
                </button>
              </div>
            )}

            {downloadError && (
              <p className="download-error">{downloadError}</p>
            )}

            <div className="game-detail-actions">
              {game.downloaded ? (
                <button className="btn-action btn-action--play" onClick={() => void handlePlay()}>
                  <PlayIcon /> {t('gamedetail.play')}
                </button>
              ) : IS_ELECTRON && !downloading && !searching ? (
                <button
                  className="btn-action btn-action--download"
                  onClick={() => void handleDownload()}
                >
                  <DownloadIcon /> {t('gamedetail.download')}
                </button>
              ) : null}

              {IS_ELECTRON && !downloading && !searching && (
                inLibrary ? (
                  <button
                    className="btn-action btn-action--remove"
                    onClick={() => void handleRemoveFromLibrary()}
                    disabled={saving}
                  >
                    <CheckIcon /> {t('gamedetail.in_library')}
                  </button>
                ) : (
                  <button
                    className="btn-action btn-action--add"
                    onClick={() => void handleAddToLibrary()}
                    disabled={saving}
                  >
                    <PlusIcon /> {t('gamedetail.add')}
                  </button>
                )
              )}

            </div>

            {IS_ELECTRON && !downloading && !searching && !game.downloaded && (
              <button
                className={`no-rom-toggle${noRom ? ' no-rom-toggle--active' : ''}`}
                onClick={() => void handleToggleNoRom()}
              >
                <NoRomIcon />
                {noRom ? t('gamedetail.mark_has_rom') : t('gamedetail.mark_no_rom')}
              </button>
            )}

          </div>
        </div>

        {(detail && (detail.videos?.length || detail.screenshots?.length)) || (IS_ELECTRON && inLibrary && game.downloaded) ? (
          <>
            <div className="game-detail-tabs">
              {detail && (detail.videos?.length || detail.screenshots?.length) ? (
                <button
                  className={`game-detail-tab${activeTab === 'media' ? ' game-detail-tab--active' : ''}`}
                  onClick={() => setActiveTab('media')}
                >
                  {t('gamedetail.tab_media')}
                </button>
              ) : null}
              {IS_ELECTRON && inLibrary && game.downloaded && (
                <button
                  className={`game-detail-tab${activeTab === 'details' ? ' game-detail-tab--active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  {t('gamedetail.tab_details')}
                </button>
              )}
            </div>

            {activeTab === 'media' && detail && (detail.videos?.length || detail.screenshots?.length) ? (
              <div className="game-detail-media" ref={mediaRef}>
                {detail.videos?.map((videoId, i) => (
                  <button
                    key={i}
                    className="game-detail-media-video-thumb"
                    onClick={() => setLightbox({ type: 'video', src: videoId })}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                      alt="Trailer"
                    />
                    <span className="game-detail-media-play">▶</span>
                  </button>
                ))}
                {detail.screenshots?.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Screenshot ${i + 1}`}
                    loading="lazy"
                    className="game-detail-media-shot"
                    onClick={() => setLightbox({ type: 'image', src })}
                  />
                ))}
              </div>
            ) : null}

            {activeTab === 'details' && IS_ELECTRON && inLibrary && game.downloaded && (
              <div className="game-info-grid game-info-grid--tab">
                {(playTime > 0 || game.downloaded) && (
                  <div className="game-info-item">
                    <span className="game-info-label">{t('gamedetail.play_time')}</span>
                    <span className="game-info-value">{formatPlayTime(playTime)}</span>
                  </div>
                )}
                <div className="game-info-item">
                  <span className="game-info-label">{t('gamedetail.last_played')}</span>
                  <span className="game-info-value">
                    {lastPlayedAt != null ? formatDate(lastPlayedAt) : '—'}
                  </span>
                </div>
                {romInfo && (
                  <>
                    <div className="game-info-item">
                      <span className="game-info-label">{t('gamedetail.file_size')}</span>
                      <span className="game-info-value">{formatFileSize(romInfo.fileSize)}</span>
                    </div>
                    <div className="game-info-item game-info-item--wide">
                      <span className="game-info-label">{t('gamedetail.rom_file')}</span>
                      <span className="game-info-value game-info-value--file">
                        <span className="game-info-filename">{romInfo.fileName}</span>
                        <button
                          className="game-info-folder-btn"
                          title={t('gamedetail.open_folder')}
                          onClick={() => {
                            const dir = game.romPath ? game.romPath.replace(/[\\/][^\\/]+$/, '') : ''
                            if (dir) void window.retrio.openFolder(dir)
                          }}
                        >
                          <FolderIcon /> {t('gamedetail.open_folder')}
                        </button>
                      </span>
                    </div>
                  </>
                )}
                {data.addedAt != null && (
                  <div className="game-info-item">
                    <span className="game-info-label">{t('gamedetail.added_date')}</span>
                    <span className="game-info-value">{formatDate(data.addedAt)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        {lightbox && (
          <div className="game-detail-lightbox" onClick={() => setLightbox(null)}>
            {lightbox.type === 'image' ? (
              <img src={lightbox.src} alt="Screenshot" onClick={(e) => e.stopPropagation()} />
            ) : (
              <div className="game-detail-lightbox-video" onClick={(e) => e.stopPropagation()}>
                <iframe
                  src={`https://www.youtube.com/embed/${lightbox.src}?rel=0&autoplay=1`}
                  title="Trailer"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function PlayIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
function NoRomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  )
}
function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatPlayTime(seconds: number): string {
  if (seconds < 60) return `< 1 min`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
