import 'dotenv/config'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { searchGames, getPopularGames, getGameById } from './igdb'
import {
  getLibrary,
  getGameFromLibrary,
  addToLibrary,
  removeFromLibrary,
  isInLibrary,
} from './database'
import { startArchiveDownload, cancelArchiveDownload } from './archiveorg'
import { destroyClient } from './torrent'
import { getEmulatorStatus, installEmulator, launchGame } from './emulator'
import type { Game, Platform } from '../shared/types'

const isDev = !!(process as NodeJS.Process & { defaultApp?: boolean }).defaultApp

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: isDev
        ? path.join(process.cwd(), 'dist/preload/main/preload.js')
        : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

ipcMain.handle('igdb:search', async (_e, { query, platform, sortBy, offset, genreId }: { query: string; platform: string | null; sortBy?: import('../shared/types').SortBy; offset?: number; genreId?: number | null }) => {
  return searchGames(query, platform, sortBy, offset, genreId)
})

ipcMain.handle('igdb:popular', async (_e, { platform, sortBy, offset, genreId }: { platform?: string | null; sortBy?: import('../shared/types').SortBy; offset?: number; genreId?: number | null } = {}) => {
  return getPopularGames(platform ?? null, offset, sortBy, genreId)
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
  const gameDir = path.join(app.getPath('userData'), 'roms', String(id))
  if (fs.existsSync(gameDir)) fs.rmSync(gameDir, { recursive: true, force: true })
})

ipcMain.handle('library:has', (_e, { id }: { id: number }) => {
  return isInLibrary(id)
})

// ── Archive.org IPC ───────────────────────────────────────────────────────────

ipcMain.handle('archive:download', (_e, { game }: { game: Game }) => {
  const win = BrowserWindow.getAllWindows()[0]

  void startArchiveDownload({
    game,
    onProgress: (data) => {
      win?.webContents.send('archive:progress', data)
    },
    onDone: (romPath: string) => {
      win?.webContents.send('archive:done', { gameId: game.id, romPath })
    },
    onError: (err: Error) => {
      win?.webContents.send('archive:error', { gameId: game.id, message: err.message })
    },
  })
})

ipcMain.handle('archive:cancel', (_e, { gameId }: { gameId: number }) => {
  cancelArchiveDownload(gameId)
  removeFromLibrary(gameId)
})

// ── Emulator IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('emulator:status', () => {
  return getEmulatorStatus()
})

ipcMain.handle('emulator:install', async (_e, { name }: { name: string }) => {
  const win = BrowserWindow.getAllWindows()[0]
  await installEmulator(name, (received, total) => {
    win?.webContents.send('emulator:install-progress', { emulatorId: name, received, total })
  })
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
