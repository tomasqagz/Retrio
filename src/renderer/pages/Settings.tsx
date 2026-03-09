import { useState, useEffect } from 'react'
import type { Emulator } from '../../shared/types'
import { toast } from '../components/Toaster'
import './Settings.css'

const IS_ELECTRON = Boolean(window.retrio)

export default function Settings() {
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [romsPath, setRomsPath] = useState('')
  const [emulatorsPath, setEmulatorsPath] = useState('')

  useEffect(() => {
    if (!IS_ELECTRON) return
    void window.retrio.getEmulatorStatus().then(setEmulators)
    void window.retrio.getFolderDefaults().then(({ roms, emulators: emuPath }) => {
      setRomsPath(roms)
      setEmulatorsPath(emuPath)
    })
  }, [])

  async function handleInstall(id: string, name: string) {
    if (!IS_ELECTRON) return
    setEmulators((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'installing' as const } : e))
    )
    toast(`Descargando ${name}… puede tardar varios minutos`, 'info')
    try {
      await window.retrio.installEmulator(id)
      const updated = await window.retrio.getEmulatorStatus()
      setEmulators(updated)
      toast(`${name} instalado correctamente`, 'success')
    } catch (err) {
      setEmulators((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'not_installed' as const } : e))
      )
      toast(`Error instalando ${name}: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
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
                  <button className="btn-install" onClick={() => void handleInstall(emu.id, emu.name)}>
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
            <button className="btn-browse" onClick={() => void window.retrio.openFolder(romsPath)}>Examinar</button>
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
            <button className="btn-browse" onClick={() => void window.retrio.openFolder(emulatorsPath)}>Examinar</button>
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
