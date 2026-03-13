import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Emulator } from '../../shared/types'
import { toast } from '../components/Toaster'
import { confirm } from '../components/ConfirmDialog'
import './Settings.css'

const IS_ELECTRON = Boolean(window.retrio)

let emulatorsCache: Emulator[] | null = null

const PLATFORM_EMULATOR: Record<string, string> = {
  NES: 'RetroArch',
  SNES: 'RetroArch',
  'Sega Genesis': 'RetroArch',
  'Sega Saturn': 'RetroArch',
  N64: 'RetroArch',
  PS1: 'DuckStation',
  PS2: 'PCSX2',
}

export default function Emulators() {
  const { t } = useTranslation()
  const [emulators, setEmulators] = useState<Emulator[]>(emulatorsCache ?? [])
  const [emulatorsPath, setEmulatorsPath] = useState('')
  const [romsPath, setRomsPath] = useState('')
  const [biosPath, setBiosPath] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [customEmuPaths, setCustomEmuPaths] = useState<Record<string, string>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!IS_ELECTRON) return
    void window.retrio.getEmulatorStatus().then((list) => {
      emulatorsCache = list
      setEmulators(list)
    })
    void window.retrio.getFolderDefaults().then(({ roms, emulators: emuPath, bios }) => {
      setRomsPath(roms)
      setEmulatorsPath(emuPath)
      setBiosPath(bios)
    })
    void window.retrio.getCustomEmulatorPaths().then(setCustomEmuPaths)
  }, [])

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  async function handleInstall(id: string, name: string) {
    if (!IS_ELECTRON) return
    setEmulators((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'installing' as const } : e))
    )
    toast(t('settings.downloading_emulator', { name }), 'info')
    try {
      await window.retrio.installEmulator(id)
      const updated = await window.retrio.getEmulatorStatus()
      emulatorsCache = updated
      setEmulators(updated)
      toast(t('settings.installed_emulator', { name }), 'success')
    } catch (err) {
      setEmulators((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'not_installed' as const } : e))
      )
      emulatorsCache = null
      toast(t('settings.error_installing', { name, error: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }

  function handleOpen(id: string) {
    setOpenMenu(null)
    void window.retrio.openEmulator(id)
  }

  function handleBrowse(id: string) {
    setOpenMenu(null)
    void window.retrio.openFolder(`${emulatorsPath}/${id}`)
  }

  async function handleDelete(id: string, name: string) {
    setOpenMenu(null)
    if (!await confirm(t('settings.delete_confirm', { name }))) return
    await window.retrio.deleteEmulator(id)
    setEmulators((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, status: 'not_installed' as const } : e))
      emulatorsCache = next
      return next
    })
    toast(t('settings.deleted_emulator', { name }), 'info')
  }

  async function handleSetCustomEmulator(platform: string) {
    if (!IS_ELECTRON) return
    const exePath = await window.retrio.openExeDialog()
    if (!exePath) return
    await window.retrio.setCustomEmulatorPath(platform, exePath)
    setCustomEmuPaths((prev) => ({ ...prev, [platform]: exePath }))
  }

  async function handleRemoveCustomEmulator(platform: string) {
    if (!IS_ELECTRON) return
    await window.retrio.removeCustomEmulatorPath(platform)
    setCustomEmuPaths((prev) => { const n = { ...prev }; delete n[platform]; return n })
  }

  return (
    <div className="page settings-page">
      <h1 className="settings-title">{t('sidebar.emulators')}</h1>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.emulators_title')}</h2>
        <p className="settings-section-desc">{t('settings.emulators_desc')}</p>
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
                    <span className="status-badge status-badge--ok">{t('settings.installed')}</span>
                    {emu.version && <span className="emulator-version">v{emu.version}</span>}
                  </>
                )}
                {emu.status === 'installing' && (
                  <span className="status-badge status-badge--loading">{t('settings.installing')}</span>
                )}
                {emu.status === 'not_installed' && (
                  <button className="btn-install" onClick={() => void handleInstall(emu.id, emu.name)}>
                    {t('settings.install')}
                  </button>
                )}
                {emu.status === 'installed' && (
                  <div className="emu-menu-wrap" ref={openMenu === emu.id ? menuRef : null}>
                    <button
                      className="emu-menu-btn"
                      onClick={() => setOpenMenu(openMenu === emu.id ? null : emu.id)}
                      title={t('settings.options')}
                    >
                      <DotsIcon />
                    </button>
                    {openMenu === emu.id && (
                      <div className="emu-dropdown">
                        <button className="emu-dropdown-item" onClick={() => handleOpen(emu.id)}>
                          {t('settings.open')}
                        </button>
                        <button className="emu-dropdown-item" onClick={() => handleBrowse(emu.id)}>
                          {t('settings.browse')}
                        </button>
                        <button
                          className="emu-dropdown-item emu-dropdown-item--danger"
                          onClick={() => void handleDelete(emu.id, emu.name)}
                        >
                          {t('settings.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.custom_emulators_title')}</h2>
        <p className="settings-section-desc">{t('settings.custom_emulators_desc')}</p>
        <div className="custom-emu-list">
          {(['NES', 'SNES', 'Sega Genesis', 'Sega Saturn', 'N64', 'PS1', 'PS2'] as const).map((platform) => {
            const custom = customEmuPaths[platform]
            return (
              <div key={platform} className="custom-emu-row">
                <span className="custom-emu-platform">{platform}</span>
                {custom ? (
                  <div className="custom-emu-right">
                    <span className="custom-emu-path" title={custom}>{custom.split(/[\\/]/).pop()}</span>
                    <button className="btn-emu-change" onClick={() => void handleSetCustomEmulator(platform)}>
                      {t('settings.custom_emulators_change')}
                    </button>
                    <button className="btn-emu-remove" onClick={() => void handleRemoveCustomEmulator(platform)} title={t('settings.custom_emulators_remove')}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="custom-emu-right">
                    <span className="custom-emu-default">{t('settings.custom_emulators_default', { name: PLATFORM_EMULATOR[platform] ?? 'Retrio' })}</span>
                    <button className="btn-emu-change" onClick={() => void handleSetCustomEmulator(platform)}>
                      {t('settings.custom_emulators_set')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.folders_title')}</h2>
        <div className="path-row">
          <label className="path-label">ROMs</label>
          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={romsPath}
              onChange={(e) => setRomsPath(e.target.value)}
            />
            <button className="btn-browse" onClick={() => void window.retrio.openFolder(romsPath)}>{t('settings.browse')}</button>
          </div>
        </div>
        <div className="path-row">
          <label className="path-label">{t('settings.emulators_title')}</label>
          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={emulatorsPath}
              onChange={(e) => setEmulatorsPath(e.target.value)}
            />
            <button className="btn-browse" onClick={() => void window.retrio.openFolder(emulatorsPath)}>{t('settings.browse')}</button>
          </div>
        </div>
        <div className="path-row">
          <label className="path-label">BIOS</label>
          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              value={biosPath}
              onChange={(e) => setBiosPath(e.target.value)}
            />
            <button className="btn-browse" onClick={() => void window.retrio.openFolder(biosPath)}>{t('settings.browse')}</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}
