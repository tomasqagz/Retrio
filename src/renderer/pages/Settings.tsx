import { useState } from 'react'
import type { Emulator } from '../../shared/types'
import './Settings.css'

const INITIAL_EMULATORS: Emulator[] = [
  { id: 'retroarch', name: 'RetroArch', platforms: ['NES', 'SNES', 'Sega Genesis', 'N64'], status: 'installed', version: '1.19.1' },
  { id: 'duckstation', name: 'DuckStation', platforms: ['PS1'], status: 'not_installed', version: null },
  { id: 'pcsx2', name: 'PCSX2', platforms: ['PS2'], status: 'not_installed', version: null },
]

export default function Settings() {
  const [emulators, setEmulators] = useState<Emulator[]>(INITIAL_EMULATORS)
  const [romsPath, setRomsPath] = useState('~/Retrio/roms')
  const [emulatorsPath, setEmulatorsPath] = useState('~/Retrio/emulators')

  function handleInstall(id: string) {
    setEmulators((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'installing' as const } : e))
    )
    setTimeout(() => {
      setEmulators((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: 'installed' as const, version: '1.0.0' } : e
        )
      )
    }, 2000)
  }

  return (
    <div className="page settings-page">
      <h1 className="settings-title">Ajustes</h1>

      <section className="settings-section">
        <h2 className="settings-section-title">Emuladores</h2>
        <p className="settings-section-desc">
          Retrio gestiona los emuladores automáticamente. Puedes instalarlos manualmente si lo prefieres.
        </p>
        <div className="emulators-list">
          {emulators.map((emu) => (
            <div key={emu.id} className="emulator-row">
              <div className="emulator-info">
                <div className="emulator-name">{emu.name}</div>
                <div className="emulator-platforms">{emu.platforms.join(', ')}</div>
              </div>
              <div className="emulator-status">
                {emu.status === 'installed' && (
                  <>
                    <span className="status-badge status-badge--ok">Instalado</span>
                    <span className="emulator-version">v{emu.version}</span>
                  </>
                )}
                {emu.status === 'installing' && (
                  <span className="status-badge status-badge--loading">Instalando...</span>
                )}
                {emu.status === 'not_installed' && (
                  <button className="btn-install" onClick={() => handleInstall(emu.id)}>
                    Instalar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Carpetas</h2>
        <div className="path-row">
          <label className="path-label">ROMs</label>
          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={romsPath}
              onChange={(e) => setRomsPath(e.target.value)}
            />
            <button className="btn-browse">Examinar</button>
          </div>
        </div>
        <div className="path-row">
          <label className="path-label">Emuladores</label>
          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={emulatorsPath}
              onChange={(e) => setEmulatorsPath(e.target.value)}
            />
            <button className="btn-browse">Examinar</button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Acerca de</h2>
        <div className="about-grid">
          <div className="about-row">
            <span className="about-label">Versión</span>
            <span className="about-value">1.0.0</span>
          </div>
          <div className="about-row">
            <span className="about-label">Motor</span>
            <span className="about-value">Electron + React + TypeScript</span>
          </div>
          <div className="about-row">
            <span className="about-label">Torrents</span>
            <span className="about-value">WebTorrent</span>
          </div>
        </div>
      </section>
    </div>
  )
}
