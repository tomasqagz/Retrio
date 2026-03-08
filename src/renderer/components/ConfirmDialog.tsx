import { useState, useEffect } from 'react'
import './ConfirmDialog.css'

interface ConfirmOptions {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Resolver = (value: boolean) => void

let _show: ((opts: ConfirmOptions, resolve: Resolver) => void) | null = null

export function confirm(message: string, opts: Omit<ConfirmOptions, 'message'> = {}): Promise<boolean> {
  return new Promise((resolve) => {
    _show?.({ message, ...opts }, resolve)
  })
}

export default function ConfirmDialog() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null)

  useEffect(() => {
    _show = (opts, resolve) => setState({ opts, resolve })
    return () => { _show = null }
  }, [])

  if (!state) return null

  function handleConfirm() {
    state!.resolve(true)
    setState(null)
  }

  function handleCancel() {
    state!.resolve(false)
    setState(null)
  }

  const { message, confirmLabel = 'Eliminar', cancelLabel = 'Cancelar', danger = true } = state.opts

  return (
    <div className="confirm-overlay" onClick={handleCancel}>
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={handleCancel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={handleCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-btn ${danger ? 'confirm-btn--danger' : 'confirm-btn--primary'}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
