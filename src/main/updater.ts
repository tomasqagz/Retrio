import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function getWin(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

function send(channel: string, data?: unknown): void {
  getWin()?.webContents.send(channel, data)
}

export function initUpdater(isDev: boolean): void {
  // Always register IPC handlers so renderer calls don't hang in dev mode
  ipcMain.handle('updater:check', () => {
    if (isDev) {
      send('updater:event', { type: 'not-available' })
      return
    }
    return autoUpdater.checkForUpdates()
  })

  ipcMain.handle('updater:download', () => {
    if (isDev) return
    return autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    if (isDev) return
    autoUpdater.quitAndInstall()
  })

  if (isDev) return

  autoUpdater.on('checking-for-update', () => {
    send('updater:event', { type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send('updater:event', { type: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:event', { type: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    send('updater:event', { type: 'error', message: err.message })
  })

  autoUpdater.on('download-progress', (progress) => {
    send('updater:event', {
      type: 'download-progress',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:event', { type: 'downloaded', version: info.version })
  })

  // Check on startup with a delay so the window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => { /* ignore network errors silently */ })
  }, 8000)
}
