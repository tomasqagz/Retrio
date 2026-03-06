import 'dotenv/config'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { searchGames, getPopularGames, getGameById } from './igdb'
import {
  getLibrary,
  getGameFromLibrary,
  addToLibrary,
  removeFromLibrary,
  isInLibrary,
} from './database'
import { startDownload, cancelDownload, destroyClient } from './torrent'
import { getEmulatorStatus, installEmulator, launchGame } from './emulator'
import type { Game, DownloadProgress, Platform } from '../shared/types'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('igdb:search', async (_e, { query, platform }: { query: string; platform: string | null }) => {
  return searchGames(query, platform)
})

ipcMain.handle('igdb:popular', async (_e, { platform }: { platform?: string | null } = {}) => {
  return getPopularGames(platform ?? null)
})

ipcMain.handle('igdb:game', async (_e, { id }: { id: number }) => {
  return getGameById(id)
})

// ── Library IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('library:get', () => {
  return getLibrary()
})

ipcMain.handle('library:get-one', (_e, { id }: { id: number }) => {
  return getGameFromLibrary(id)
})

ipcMain.handle('library:add', (_e, game: Game) => {
  addToLibrary(game)
})

ipcMain.handle('library:remove', (_e, { id }: { id: number }) => {
  removeFromLibrary(id)
})

ipcMain.handle('library:has', (_e, { id }: { id: number }) => {
  return isInLibrary(id)
})

// ── Torrent IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('torrent:download', (_e, { magnetUri, game }: { magnetUri: string; game: Game }) => {
  const win = BrowserWindow.getAllWindows()[0]

  startDownload({
    magnetUri,
    game,
    onProgress: (data: DownloadProgress) => {
      win?.webContents.send('torrent:progress', data)
    },
    onDone: (romPath: string) => {
      win?.webContents.send('torrent:done', { gameId: game.id, romPath })
    },
    onError: (err: Error) => {
      win?.webContents.send('torrent:error', { gameId: game.id, message: err.message })
    },
  })
})

ipcMain.handle('torrent:cancel', (_e, { infoHash }: { infoHash: string }) => {
  cancelDownload(infoHash)
})

// ── Emulator IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('emulator:status', () => {
  return getEmulatorStatus()
})

ipcMain.handle('emulator:install', async (_e, { name }: { name: string }) => {
  await installEmulator(name)
})

ipcMain.handle('emulator:launch', (_e, { romPath, platform }: { romPath: string; platform: Platform }) => {
  launchGame(romPath, platform)
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  destroyClient()
  if (process.platform !== 'darwin') app.quit()
})
