import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Emulator, UpdaterEvent } from '../../shared/types'
import { toast } from '../components/Toaster'
import { confirm } from '../components/ConfirmDialog'
import i18n, { LANGUAGES } from '../i18n'
import './Settings.css'

const IS_ELECTRON = Boolean(window.retrio)

let emulatorsCache: Emulator[] | null = null

function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  const [igdbClientId, setIgdbClientId] = useState('')
  const [igdbClientSecret, setIgdbClientSecret] = useState('')
  const [igdbHasCredentials, setIgdbHasCredentials] = useState(false)
  const [igdbSaving, setIgdbSaving] = useState(false)
  const [igdbExpanded, setIgdbExpanded] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{ count: number; sizeBytes: number } | null>(null)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  >('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

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
    void window.retrio.getIgdbCredentials().then(({ clientId, clientSecret }) => {
      const has = Boolean(clientId)
      setIgdbHasCredentials(has)
      setIgdbExpanded(!has)
      setIgdbClientId(clientId)
      setIgdbClientSecret(clientSecret)
    })
    void window.retrio.getSearchCacheInfo().then(setCacheInfo)
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

  async function handleSaveIgdb() {
    if (!IS_ELECTRON || igdbSaving) return
    setIgdbSaving(true)
    try {
      await window.retrio.setIgdbCredentials(igdbClientId, igdbClientSecret)
      setIgdbHasCredentials(Boolean(igdbClientId.trim()))
      setIgdbExpanded(false)
      toast(t('settings.igdb_saved'), 'success')
    } catch {
      toast(t('settings.igdb_error'), 'error')
    } finally {
      setIgdbSaving(false)
    }
  }

  async function handleClearCache() {
    if (!IS_ELECTRON || cacheClearing) return
    setCacheClearing(true)
    try {
      await window.retrio.clearSearchCache()
      setCacheInfo({ count: 0, sizeBytes: 0 })
      toast(t('settings.cache_cleared'), 'success')
    } catch {
      toast(t('settings.cache_error'), 'error')
    } finally {
      setCacheClearing(false)
    }
  }

  useEffect(() => {
    if (!IS_ELECTRON || !window.retrio?.onUpdaterEvent) return
    const off = window.retrio.onUpdaterEvent((event: UpdaterEvent) => {
      switch (event.type) {
        case 'checking':
          setUpdateStatus('checking')
          break
        case 'available':
          setUpdateStatus('available')
          setUpdateVersion(event.version ?? '')
          break
        case 'not-available':
          setUpdateStatus('up-to-date')
          setLastChecked(new Date())
          break
        case 'download-progress':
          setUpdateStatus('downloading')
          setUpdatePercent(event.percent ?? 0)
          break
        case 'downloaded':
          setUpdateStatus('downloaded')
          setUpdateVersion(event.version ?? '')
          break
        case 'error':
          setUpdateStatus('error')
          break
      }
    })
    return off
  }, [])

  function handleCheckUpdates() {
    if (!IS_ELECTRON) return
    setUpdateStatus('checking')
    void window.retrio.checkForUpdates()
  }

  function formatLastChecked(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('settings.updates_just_now')
    if (mins < 60) return t('settings.updates_minutes_ago', { n: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('settings.updates_hours_ago', { n: hours })
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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

      <div className={`igdb-card ${igdbHasCredentials ? 'igdb-card--ok' : 'igdb-card--missing'}`}>
        <button className="igdb-card-header" onClick={() => setIgdbExpanded((o) => !o)}>
          <div className="igdb-card-header-left">
            {igdbHasCredentials ? <CheckSmallIcon /> : <WarnIcon />}
            <span className="igdb-card-title">{t('settings.igdb_title')}</span>
            <span className="igdb-card-badge">
              {igdbHasCredentials ? t('settings.igdb_status_ok') : t('settings.igdb_status_missing')}
            </span>
          </div>
          <ChevronIcon open={igdbExpanded} />
        </button>

        {igdbExpanded && (
          <div className="igdb-card-body">
            <p className="settings-section-desc">{t('settings.igdb_desc')}</p>

            <div className="igdb-guide">
              <p className="igdb-guide-title">{t('settings.igdb_guide_title')}</p>
              <ol className="igdb-guide-steps">
                <li>
                  {t('settings.igdb_guide_step1')}{' '}
                  <a className="igdb-inline-link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">dev.twitch.tv/console/apps</a>
                </li>
                <li>{t('settings.igdb_guide_step2')}</li>
                <li>{t('settings.igdb_guide_step3')}</li>
                <li>
                  {t('settings.igdb_guide_step4')}{' '}
                  <code className="igdb-guide-code">http://localhost</code>
                </li>
                <li>{t('settings.igdb_guide_step5')}</li>
                <li>
                  {t('settings.igdb_guide_step6')}{' '}
                  <strong>Confidential</strong>
                </li>
                <li>{t('settings.igdb_guide_step7')}</li>
              </ol>
              <a className="igdb-portal-link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
                {t('settings.igdb_link')}
              </a>
            </div>

            <div className="path-row">
              <label className="path-label">{t('settings.igdb_client_id')}</label>
              <div className="path-input-group">
                <input
                  type="text"
                  className="path-input"
                  value={igdbClientId}
                  onChange={(e) => setIgdbClientId(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="path-row">
              <label className="path-label">{t('settings.igdb_client_secret')}</label>
              <div className="path-input-group">
                <input
                  type="password"
                  className="path-input"
                  value={igdbClientSecret}
                  onChange={(e) => setIgdbClientSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button
              className="btn-save-igdb"
              onClick={() => void handleSaveIgdb()}
              disabled={igdbSaving || !igdbClientId.trim() || !igdbClientSecret.trim()}
            >
              {t('settings.igdb_save')}
            </button>
          </div>
        )}
      </div>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.updates_title')}</h2>
        <div className="update-card">
          <div className={`update-card__icon update-card__icon--${updateStatus === 'available' || updateStatus === 'downloaded' ? 'available' : updateStatus === 'error' ? 'error' : 'ok'}`}>
            {updateStatus === 'checking' || updateStatus === 'downloading'
              ? <UpdateSpinnerIcon />
              : updateStatus === 'error'
              ? <UpdateErrorIcon />
              : updateStatus === 'available' || updateStatus === 'downloaded'
              ? <UpdateArrowIcon />
              : <UpdateCheckIcon />
            }
          </div>
          <div className="update-card__body">
            <span className="update-card__title">
              {updateStatus === 'idle' && t('settings.updates_idle_title')}
              {updateStatus === 'checking' && t('settings.updates_checking')}
              {updateStatus === 'up-to-date' && t('settings.updates_up_to_date')}
              {updateStatus === 'available' && t('settings.updates_available')}
              {updateStatus === 'downloading' && t('settings.updates_downloading', { percent: updatePercent })}
              {updateStatus === 'downloaded' && t('settings.updates_downloaded')}
              {updateStatus === 'error' && t('settings.updates_error')}
            </span>
            <span className="update-card__subtitle">
              {updateStatus === 'idle' && t('settings.updates_idle')}
              {updateStatus === 'available' && t('settings.updates_available_sub', { version: updateVersion })}
              {updateStatus === 'downloaded' && t('settings.updates_downloaded_sub', { version: updateVersion })}
              {lastChecked && (updateStatus === 'up-to-date' || updateStatus === 'error') &&
                t('settings.updates_last_checked', { time: formatLastChecked(lastChecked) })}
            </span>
            {updateStatus === 'downloading' && (
              <div className="update-card__progress">
                <div className="update-card__progress-fill" style={{ width: `${updatePercent}%` }} />
              </div>
            )}
          </div>
          <div className="update-card__action">
            {(updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error') && (
              <button className="btn-install" onClick={handleCheckUpdates}>
                {t('settings.updates_check')}
              </button>
            )}
            {updateStatus === 'available' && (
              <button className="btn-install" onClick={() => void window.retrio.downloadUpdate()}>
                {t('settings.updates_download')}
              </button>
            )}
            {updateStatus === 'downloaded' && (
              <button className="btn-install btn-install--accent" onClick={() => void window.retrio.installUpdate()}>
                {t('settings.updates_install')}
              </button>
            )}
          </div>
        </div>
      </section>

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
        <h2 className="settings-section-title">{t('settings.cache_title')}</h2>
        <p className="settings-section-desc">{t('settings.cache_desc')}</p>
        <div className="settings-row">
          <span className="settings-row-label">
            {cacheInfo
              ? t('settings.cache_info', { count: cacheInfo.count, size: formatCacheSize(cacheInfo.sizeBytes) })
              : '—'}
          </span>
          <button
            className="btn-install"
            onClick={() => void handleClearCache()}
            disabled={cacheClearing || !cacheInfo || cacheInfo.count === 0}
          >
            {cacheClearing ? t('settings.cache_clearing') : t('settings.cache_clear')}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">{t('settings.about_title')}</h2>
        <div className="about-grid">
          <div className="about-row">
            <span className="about-label">{t('settings.about_version')}</span>
            <span className="about-value">0.1.0</span>
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

function CheckSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function UpdateCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function UpdateArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  )
}

function UpdateErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function UpdateSpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="22" height="22" className="update-spinner">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
