import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { confirm } from '../components/ConfirmDialog'
import type { Game, DownloadProgress, Platform } from '../../shared/types'
import { platformLabel } from '../utils/platform'
import { useEmuProgress } from '../contexts/EmuProgressContext'

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  NES: '#e53e3e',
  SNES: '#7b2d8b',
  'Sega Genesis': '#1a56db',
  'Sega Saturn': '#ec4899',
  PS1: '#6b7280',
  PS2: '#0ea5e9',
  N64: '#008a00',
}
import './Downloads.css'

const EMULATOR_NAMES: Record<string, string> = {
  retroarch: 'RetroArch',
  duckstation: 'DuckStation',
  pcsx2: 'PCSX2',
}

const IS_ELECTRON = Boolean(window.retrio)

function formatSpeed(bps: number): string {
  if (bps <= 0) return ''
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}

function formatTime(secs: number): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return ''
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

export default function Downloads() {
  const { t } = useTranslation()
  const [games, setGames] = useState<Game[]>([])
  const [progressMap, setProgressMap] = useState<Record<number, DownloadProgress>>({})
  const { active: emuProgress, completed: completedEmus, dismissCompleted: dismissCompletedEmu } = useEmuProgress()
  const [paused, setPaused] = useState<Set<number>>(new Set())
  const knownIds = useRef(new Set<number>())

  const loadGames = () => {
    if (!IS_ELECTRON) return
    void window.retrio.getLibrary().then((data) => {
      setGames(data)
      data.forEach((g) => knownIds.current.add(g.id))
    })
  }

  useEffect(() => {
    loadGames()
    if (!IS_ELECTRON) return

    // Sincronizar estado de descargas pausadas desde el proceso main
    void window.retrio.getDownloadState().then(({ paused: pausedIds }) => {
      if (pausedIds.length > 0) setPaused(new Set(pausedIds))
    })

    const offProgress = window.retrio.onDownloadProgress((data) => {
      setProgressMap((prev) => ({ ...prev, [data.gameId]: data }))
      if (!knownIds.current.has(data.gameId)) {
        loadGames()
      } else {
        setGames((prev) =>
          prev.map((g) => (g.id === data.gameId ? { ...g, progress: data.progress } : g))
        )
      }
    })

    const offDone = window.retrio.onDownloadDone((data) => {
      setProgressMap((prev) => { const n = { ...prev }; delete n[data.gameId]; return n })
      setGames((prev) =>
        prev.map((g) =>
          g.id === data.gameId
            ? { ...g, downloading: false, downloaded: true, romPath: data.romPath, progress: 100 }
            : g
        )
      )
    })

    const offError = window.retrio.onDownloadError((data) => {
      setProgressMap((prev) => { const n = { ...prev }; delete n[data.gameId]; return n })
      setGames((prev) =>
        prev.map((g) => (g.id === data.gameId ? { ...g, downloading: false, progress: 0 } : g))
      )
    })

    return () => { offProgress(); offDone(); offError() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePause(gameId: number) {
    const ok = await window.retrio.pauseDownload(gameId)
    if (ok) setPaused((prev) => new Set(prev).add(gameId))
  }

  async function handleResume(gameId: number) {
    setPaused((prev) => { const n = new Set(prev); n.delete(gameId); return n })
    await window.retrio.resumeDownload(gameId)
  }

  async function handleCancel(gameId: number) {
    const game = games.find((g) => g.id === gameId)
    if (!await confirm(t('downloads.cancel_confirm', { title: game?.title ?? '' }), { confirmLabel: t('downloads.cancel_title'), danger: true })) return
    await window.retrio.cancelDownload(gameId)
    setPaused((prev) => { const n = new Set(prev); n.delete(gameId); return n })
    setProgressMap((prev) => { const n = { ...prev }; delete n[gameId]; return n })
    setGames((prev) => prev.map((g) => g.id === gameId ? { ...g, downloading: false, progress: 0 } : g))
  }

  async function handlePlay(game: Game) {
    if (!game.romPath) return
    try {
      await window.retrio.launchGame(game.romPath, game.platform)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  function handleDismiss(gameId: number) {
    void window.retrio.dismissDownload(gameId)
    setGames((prev) => prev.map((g) => g.id === gameId ? { ...g, dlDismissed: true } : g))
  }

  function handleDismissAll() {
    completed.forEach((g) => void window.retrio.dismissDownload(g.id))
    setGames((prev) => prev.map((g) => completed.some((c) => c.id === g.id) ? { ...g, dlDismissed: true } : g))
  }

  const active = games.filter((g) => g.downloading)
  const completed = games.filter((g) => g.downloaded && !g.downloading && !g.dlDismissed)

  return (
    <div className="page downloads-page">
      <h1 className="downloads-title">{t('downloads.title')}</h1>

      {active.length === 0 && completed.length === 0 && Object.keys(emuProgress).length === 0 && Object.keys(completedEmus).length === 0 && (
        <div className="downloads-empty">
          <DownloadIcon className="downloads-empty-icon" />
          <p className="downloads-empty-title">{t('downloads.empty_title')}</p>
          <p className="downloads-empty-sub">{t('downloads.empty_sub')}</p>
        </div>
      )}

      {Object.values(emuProgress).length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">{t('downloads.emulators_section')}</h2>
          <div className="downloads-list">
            {Object.values(emuProgress).map((ep) => {
              const pct = ep.total > 0 ? Math.round((ep.received / ep.total) * 100) : 0
              const receivedMb = (ep.received / (1024 * 1024)).toFixed(1)
              const totalMb = ep.total > 0 ? (ep.total / (1024 * 1024)).toFixed(1) : null
              return (
                <div key={ep.emulatorId} className="dl-item">
                  <div className="dl-cover dl-cover--emu">🎮</div>
                  <div className="dl-body">
                    <div className="dl-top">
                      <span className="dl-name">{EMULATOR_NAMES[ep.emulatorId] ?? ep.emulatorId}</span>
                      <span className="dl-platform">{t('downloads.emulator_label')}</span>
                    </div>
                    <div className="dl-bar-track">
                      <div className="dl-bar-fill" style={{ width: ep.total > 0 ? `${pct}%` : '100%', opacity: ep.total > 0 ? 1 : 0.4 }} />
                    </div>
                    <div className="dl-meta">
                      {ep.total > 0
                        ? <><span className="dl-pct">{pct}%</span><span className="dl-speed">{receivedMb} / {totalMb} MB</span></>
                        : <span className="dl-speed">{t('downloads.downloaded_mb', { mb: receivedMb })}</span>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {Object.values(completedEmus).length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">{t('downloads.completed_section')}</h2>
          <div className="downloads-list">
            {Object.values(completedEmus).map((ep) => (
              <div key={ep.emulatorId} className="dl-item dl-item--done">
                <div className="dl-cover dl-cover--emu">🎮</div>
                <div className="dl-body">
                  <div className="dl-top">
                    <span className="dl-name">{EMULATOR_NAMES[ep.emulatorId] ?? ep.emulatorId}</span>
                    <span className="dl-platform">{t('downloads.emulator_label')}</span>
                  </div>
                  <div className="dl-bar-track">
                    <div className="dl-bar-fill dl-bar-fill--done" style={{ width: '100%' }} />
                  </div>
                  <div className="dl-meta">
                    <span className="dl-done-label">{t('downloads.done')}</span>
                  </div>
                </div>
                <div className="dl-actions">
                  <button
                    className="dl-cancel"
                    onClick={() => dismissCompletedEmu(ep.emulatorId)}
                    title={t('downloads.dismiss_title')}
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">{t('downloads.active_section')}</h2>
          <div className="downloads-list">
            {active.map((game) => {
              const prog = progressMap[game.id]
              const progress = prog?.progress ?? game.progress ?? 0
              const speed = prog?.downloadSpeed ?? 0
              const remaining = prog?.timeRemaining ?? 0
              return (
                <div key={game.id} className="dl-item">
                  <div
                    className="dl-cover"
                    style={{ backgroundImage: game.coverUrl ? `url(${game.coverUrl})` : undefined }}
                  />
                  <div className="dl-body">
                    <div className="dl-top">
                      <span className="dl-name">{game.title}</span>
                      <span className="dl-platform" style={{ background: PLATFORM_COLORS[game.platform] ?? undefined, color: PLATFORM_COLORS[game.platform] ? '#fff' : undefined }}>{platformLabel(game.platform)}</span>
                    </div>
                    <div className="dl-bar-track">
                      <div
                        className={`dl-bar-fill${paused.has(game.id) ? ' dl-bar-fill--paused' : ''}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="dl-meta">
                      <span className="dl-pct">{progress}%</span>
                      {paused.has(game.id)
                        ? <span className="dl-paused">{t('downloads.paused')}</span>
                        : <>
                            {speed > 0 && <span className="dl-speed">{formatSpeed(speed)}</span>}
                            {remaining > 0 && <span className="dl-eta">{t('downloads.remaining', { time: formatTime(remaining) })}</span>}
                          </>
                      }
                    </div>
                  </div>
                  {paused.has(game.id) ? (
                    <button
                      className="dl-cancel dl-resume"
                      onClick={() => void handleResume(game.id)}
                      title={t('downloads.resume_title')}
                    >
                      <ResumeIcon />
                    </button>
                  ) : (
                    <button
                      className="dl-cancel dl-pause"
                      onClick={() => void handlePause(game.id)}
                      title={t('downloads.pause_title')}
                    >
                      <PauseIcon />
                    </button>
                  )}
                  <button
                    className="dl-cancel"
                    onClick={() => void handleCancel(game.id)}
                    title={t('downloads.cancel_title')}
                  >
                    <XIcon />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">
            {t('downloads.completed_section')}
            <span className="downloads-count">{completed.length}</span>
            <button className="dl-dismiss-all" onClick={handleDismissAll}>{t('downloads.dismiss_all')}</button>
          </h2>
          <div className="downloads-list">
            {completed.map((game) => (
              <div key={game.id} className="dl-item dl-item--done">
                <div
                  className="dl-cover"
                  style={{ backgroundImage: game.coverUrl ? `url(${game.coverUrl})` : undefined }}
                />
                <div className="dl-body">
                  <div className="dl-top">
                    <span className="dl-name">{game.title}</span>
                    <span className="dl-platform" style={{ background: PLATFORM_COLORS[game.platform] ?? undefined, color: PLATFORM_COLORS[game.platform] ? '#fff' : undefined }}>{platformLabel(game.platform)}</span>
                  </div>
                  <div className="dl-bar-track">
                    <div className="dl-bar-fill dl-bar-fill--done" style={{ width: '100%' }} />
                  </div>
                  <div className="dl-meta">
                    <span className="dl-done-label">{t('downloads.done')}</span>
                  </div>
                </div>
                <div className="dl-actions">
                  <button
                    className="dl-cancel"
                    onClick={() => handleDismiss(game.id)}
                    title={t('downloads.dismiss_title')}
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}
