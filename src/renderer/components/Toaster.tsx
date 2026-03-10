import { useState, useEffect } from 'react'
import './Toaster.css'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

// Module-level singleton so toast() can be called from anywhere
let _addToast: ((t: Toast) => void) | null = null
let _nextId = 0

export function toast(message: string, type: Toast['type'] = 'info') {
  _addToast?.({ id: _nextId++, message, type })
}

const DURATION: Record<Toast['type'], number> = { success: 4000, info: 5000, error: 10000 }

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    _addToast = (t) => {
      setToasts((prev) => [...prev, t])
      if (t.type !== 'error') {
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id))
        }, DURATION[t.type])
      }
    }
    return () => {
      _addToast = null
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon">
            {t.type === 'success' ? <SuccessIcon /> : t.type === 'error' ? <ErrorIcon /> : <InfoIcon />}
          </span>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  )
}

function SuccessIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
