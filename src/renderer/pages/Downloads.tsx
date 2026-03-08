import { useState, useEffect, useRef } from 'react'
import type { Game, DownloadProgress, EmulatorInstallProgress } from '../../shared/types'
import { confirm } from '../components/ConfirmDialog'
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
  const [games, setGames] = useState<Game[]>([])
  const [progressMap, setProgressMap] = useState<Record<number, DownloadProgress>>({})
  const [emuProgress, setEmuProgress] = useState<Record<string, EmulatorInstallProgress>>({})
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

    const offEmuProgress = window.retrio.onEmulatorInstallProgress((data) => {
      setEmuProgress((prev) => {
        const next = { ...prev, [data.emulatorId]: data }
        if (data.total > 0 && data.received >= data.total) {
          setTimeout(() => {
            setEmuProgress((p) => { const n = { ...p }; delete n[data.emulatorId]; return n })
          }, 1500)
        }
        return next
      })
    })

    return () => { offProgress(); offDone(); offError(); offEmuProgress() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel(gameId: number) {
    await window.retrio.cancelDownload(gameId)
    setProgressMap((prev) => { const n = { ...prev }; delete n[gameId]; return n })
    setGames((prev) => prev.filter((g) => g.id !== gameId))
  }

  async function handlePlay(game: Game) {
    if (!game.romPath) return
    await window.retrio.launchGame(game.romPath, game.platform)
  }

  async function handleRemove(game: Game) {
    if (!await confirm(`¿Eliminar "${game.title}" de la biblioteca?`)) return
    await window.retrio.removeFromLibrary(game.id)
    setGames((prev) => prev.filter((g) => g.id !== game.id))
  }

  const active = games.filter((g) => g.downloading)
  const completed = games.filter((g) => g.downloaded && !g.downloading)

  return (
    <div className="page downloads-page">
      <h1 className="downloads-title">Descargas</h1>

      {active.length === 0 && completed.length === 0 && Object.keys(emuProgress).length === 0 && (
        <div className="downloads-empty">
          <DownloadIcon className="downloads-empty-icon" />
          <p className="downloads-empty-title">Sin descargas</p>
          <p className="downloads-empty-sub">Los juegos que descargues aparecerán aquí</p>
        </div>
      )}

      {Object.values(emuProgress).length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">Instalando emuladores</h2>
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
                      <span className="dl-platform">Emulador</span>
                    </div>
                    <div className="dl-bar-track">
                      <div className="dl-bar-fill" style={{ width: ep.total > 0 ? `${pct}%` : '100%', opacity: ep.total > 0 ? 1 : 0.4 }} />
                    </div>
                    <div className="dl-meta">
                      {ep.total > 0
                        ? <><span className="dl-pct">{pct}%</span><span className="dl-speed">{receivedMb} / {totalMb} MB</span></>
                        : <span className="dl-speed">{receivedMb} MB descargados</span>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="downloads-section">
          <h2 className="downloads-section-title">En descarga</h2>
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
                      <span className="dl-platform">{game.platform}</span>
                    </div>
                    <div className="dl-bar-track">
                      <div className="dl-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="dl-meta">
                      <span className="dl-pct">{progress}%</span>
                      {speed > 0 && <span className="dl-speed">{formatSpeed(speed)}</span>}
                      {remaining > 0 && (
                        <span className="dl-eta">{formatTime(remaining)} restante</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="dl-cancel"
                    onClick={() => void handleCancel(game.id)}
                    title="Cancelar descarga"
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
            Completadas
            <span className="downloads-count">{completed.length}</span>
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
                    <span className="dl-platform">{game.platform}</span>
                  </div>
                  <div className="dl-bar-track">
                    <div className="dl-bar-fill dl-bar-fill--done" style={{ width: '100%' }} />
                  </div>
                  <div className="dl-meta">
                    <span className="dl-done-label">Listo</span>
                  </div>
                </div>
                <div className="dl-actions">
                  {game.romPath && (
                    <button className="dl-btn dl-btn--play" onClick={() => void handlePlay(game)}>
                      Jugar
                    </button>
                  )}
                  <button className="dl-btn dl-btn--remove" onClick={() => void handleRemove(game)}>
                    Eliminar
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
