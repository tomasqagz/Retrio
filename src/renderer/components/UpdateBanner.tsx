import { useEffect, useState } from 'react'
import type { UpdaterEvent } from '../../shared/types'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    if (!window.retrio?.onUpdaterEvent) return

    const off = window.retrio.onUpdaterEvent((event: UpdaterEvent) => {
      switch (event.type) {
        case 'available':
          setState({ status: 'available', version: event.version ?? '' })
          break
        case 'download-progress':
          setState({ status: 'downloading', percent: event.percent ?? 0 })
          break
        case 'downloaded':
          setState({ status: 'downloaded', version: event.version ?? '' })
          break
        case 'error':
          // Solo mostrar error si ya había una actualización en proceso
          setState(prev =>
            prev.status === 'downloading' || prev.status === 'available'
              ? { status: 'error', message: event.message ?? 'Error desconocido' }
              : prev
          )
          break
      }
    })

    return off
  }, [])

  if (state.status === 'idle' || state.status === 'error') return null

  return (
    <div className="update-banner">
      {state.status === 'available' && (
        <>
          <span className="update-banner__text">
            Nueva versión <strong>{state.version}</strong> disponible
          </span>
          <button
            className="update-banner__btn"
            onClick={() => void window.retrio.downloadUpdate()}
          >
            Descargar
          </button>
          <button className="update-banner__dismiss" onClick={() => setState({ status: 'idle' })}>
            ✕
          </button>
        </>
      )}

      {state.status === 'downloading' && (
        <>
          <div className="update-banner__progress-bar">
            <div className="update-banner__progress-fill" style={{ width: `${state.percent}%` }} />
          </div>
          <span className="update-banner__text">Descargando actualización… {state.percent}%</span>
        </>
      )}

      {state.status === 'downloaded' && (
        <>
          <span className="update-banner__text">
            Versión <strong>{state.version}</strong> lista para instalar
          </span>
          <button
            className="update-banner__btn update-banner__btn--primary"
            onClick={() => void window.retrio.installUpdate()}
          >
            Reiniciar e instalar
          </button>
          <button className="update-banner__dismiss" onClick={() => setState({ status: 'idle' })}>
            ✕
          </button>
        </>
      )}
    </div>
  )
}
