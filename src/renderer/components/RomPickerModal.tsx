import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { RomOption } from '../../shared/types'
import './RomPickerModal.css'

type Resolver = (option: RomOption | null) => void

let _show: ((options: RomOption[], gameTitle: string, resolve: Resolver) => void) | null = null

export function pickRom(options: RomOption[], gameTitle: string): Promise<RomOption | null> {
  return new Promise((resolve) => {
    _show?.(options, gameTitle, resolve)
  })
}

function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

export default function RomPickerModal() {
  const { t } = useTranslation()
  const [state, setState] = useState<{ options: RomOption[]; gameTitle: string; resolve: Resolver } | null>(null)

  useEffect(() => {
    _show = (options, gameTitle, resolve) => setState({ options, gameTitle, resolve })
    return () => { _show = null }
  }, [])

  if (!state) return null

  function handleSelect(option: RomOption) {
    state!.resolve(option)
    setState(null)
  }

  function handleCancel() {
    state!.resolve(null)
    setState(null)
  }

  return (
    <div className="rompicker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel() }}>
      <div className="rompicker-panel" onClick={(e) => e.stopPropagation()}>
        <button className="rompicker-close" onClick={handleCancel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="rompicker-title">{t('rompicker.title')}</h3>
        <p className="rompicker-subtitle">
          {t('rompicker.subtitle', { game: state.gameTitle })}
        </p>

        <div className="rompicker-list">
          {state.options.map((opt) => (
            <button
              key={opt.identifier}
              className="rompicker-option"
              onClick={() => handleSelect(opt)}
            >
              <div className="rompicker-option-header">
                <span className="rompicker-option-label">{opt.label}</span>
                {opt.size > 0 && <span className="rompicker-option-size">{formatSize(opt.size)}</span>}
              </div>
              <span className="rompicker-option-file">{opt.primaryFile}</span>
            </button>
          ))}
        </div>

        <button className="rompicker-cancel" onClick={handleCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
