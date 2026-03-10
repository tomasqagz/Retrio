import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Emulator } from '../../shared/types'
import { toast } from '../components/Toaster'
import { confirm } from '../components/ConfirmDialog'
import i18n, { LANGUAGES } from '../i18n'
import './Settings.css'

const IS_ELECTRON = Boolean(window.retrio)

let emulatorsCache: Emulator[] | null = null

const WINDOW_SIZES = [
  { label: '1280×720',                  w: 1280, h: 720  },
  { label: '1366×768',                  w: 1366, h: 768  },
  { label: '1440×900',                  w: 1440, h: 900  },
  { label: '1600×900',                  w: 1600, h: 900  },
  { label: '1920×1080 (Full HD)',        w: 1920, h: 1080 },
  { label: '2560×1440 (2K)',            w: 2560, h: 1440 },
]

export default function Settings() {
  const { t } = useTranslation()
  const [emulators, setEmulators] = useState<Emulator[]>(emulatorsCache ?? [])
  const [romsPath, setRomsPath] = useState('')
  const [emulatorsPath, setEmulatorsPath] = useState('')
  const [biosPath, setBiosPath] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [currentLang, setCurrentLang] = useState(i18n.language)
const [langOpen, setLangOpen] = useState(false)
  const [windowSize, setWindowSize] = useState(() => localStorage.getItem('retrio-window-size') ?? '')
  const [resOpen, setResOpen] = useState(false)
  const resRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const langRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!IS_ELECTRON) return
    if (!emulatorsCache) {
      void window.retrio.getEmulatorStatus().then((list) => {
        emulatorsCache = list
        setEmulators(list)
      })
    }
    void window.retrio.getFolderDefaults().then(({ roms, emulators: emuPath, bios }) => {
      setRomsPath(roms)
      setEmulatorsPath(emuPath)
      setBiosPath(bios)
    })
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

  useEffect(() => {
    if (!langOpen) return
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [langOpen])

  useEffect(() => {
    if (!resOpen) return
    const handler = (e: MouseEvent) => {
      if (resRef.current && !resRef.current.contains(e.target as Node)) {
        setResOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [resOpen])

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

const handleWindowSizeChange = useCallback((w: number, h: number) => {
    const key = `${w}x${h}`
    localStorage.setItem('retrio-window-size', key)
    setWindowSize(key)
    setResOpen(false)
    if (IS_ELECTRON) void window.retrio.setWindowSize(w, h)
  }, [])

const handleLanguageChange = useCallback((code: string) => {
    void i18n.changeLanguage(code)
    localStorage.setItem('retrio-lang', code)
    setCurrentLang(code)
    setLangOpen(false)
  }, [])

  return (
    <div className="page settings-page">
      <h1 className="settings-title">{t('settings.title')}</h1>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.language_title')}</h2>
        <div className="settings-row">
          <label className="settings-row-label">{t('settings.language_label')}</label>
          <div className="lang-select" ref={langRef}>
            <button className="lang-select-btn" onClick={() => setLangOpen((o) => !o)}>
              <span className={`fi fi-${LANGUAGES.find((l) => l.code === currentLang)?.flagCode}`} />
              <span className="lang-name">{LANGUAGES.find((l) => l.code === currentLang)?.label}</span>
              <ChevronIcon open={langOpen} />
            </button>
            {langOpen && (
              <div className="lang-dropdown">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`lang-option ${currentLang === lang.code ? 'lang-option--active' : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                  >
                    <span className={`fi fi-${lang.flagCode}`} />
                    <span className="lang-name">{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-row-label">{t('settings.resolution_label')}</label>
          <div className="lang-select" ref={resRef}>
            <button className="lang-select-btn" onClick={() => setResOpen((o) => !o)}>
              <span className="lang-name">
                {WINDOW_SIZES.find((s) => `${s.w}x${s.h}` === windowSize)?.label ?? t('settings.resolution_current')}
              </span>
              <ChevronIcon open={resOpen} />
            </button>
            {resOpen && (
              <div className="lang-dropdown">
                {WINDOW_SIZES.map((s) => {
                  const key = `${s.w}x${s.h}`
                  return (
                    <button
                      key={key}
                      className={`lang-option ${windowSize === key ? 'lang-option--active' : ''}`}
                      onClick={() => handleWindowSizeChange(s.w, s.h)}
                    >
                      <span className="lang-name">{s.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.emulators_title')}</h2>
        <p className="settings-section-desc">
          {t('settings.emulators_desc')}
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

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.about_title')}</h2>
        <div className="about-grid">
          <div className="about-row">
            <span className="about-label">{t('settings.about_version')}</span>
            <span className="about-value">1.0.0</span>
          </div>
          <div className="about-row">
            <span className="about-label">{t('settings.about_engine')}</span>
            <span className="about-value">Electron + React + TypeScript</span>
          </div>
          <div className="about-row">
            <span className="about-label">{t('settings.about_torrents')}</span>
            <span className="about-value">WebTorrent</span>
          </div>
          <div className="about-row">
            <span className="about-label">{t('settings.about_developer')}</span>
            <a
              className="about-value about-link"
              href="https://github.com/tomasqagz"
              target="_blank"
              rel="noreferrer"
            >
              tomasqagz
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
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
