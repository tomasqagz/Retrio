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
}

const IS_ELECTRON = Boolean(window.retrio)

async function fetchDetail(id: number): Promise<Game | null> {
  if (IS_ELECTRON) return window.retrio.getGameById(id)
  const res = await fetch(`/api/igdb/game/${id}`)
  if (!res.ok) throw new Error(res.statusText)
  return res.json() as Promise<Game>
}

export default function GameDetail({ game, onClose }: GameDetailProps) {
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
      .then((data) => setDetail(data))
      .catch(() => {})
      .finally(() => setLoading(false))

    if (IS_ELECTRON) {
      void window.retrio.isInLibrary(game.id).then(setInLibrary)
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
  }, [detail, game])

  const handleRemoveFromLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return
    if (!await confirm(t('gamedetail.remove_confirm', { title: game.title }))) return
    setSaving(true)
    await window.retrio.removeFromLibrary(game.id)
    setSaving(false)
    onClose()
  }, [game.id, game.title, onClose, t])

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
                <button className="btn-action btn-action--play">
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
          </div>
        </div>

        {detail && (detail.videos?.length || detail.screenshots?.length) ? (
          <div
            className="game-detail-media"
            ref={mediaRef}
          >
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
