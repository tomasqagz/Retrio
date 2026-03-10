import 'dotenv/config'
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { searchGames, getPopularGames, getGameById } from './igdb'
import {
  getLibrary,
  getGameFromLibrary,
  addToLibrary,
  removeFromLibrary,
  isInLibrary,
  dismissDownload,
} from './database'
import { startArchiveDownload, pauseArchiveDownload, resumeArchiveDownload, cancelArchiveDownload, findRomsOnArchive } from './archiveorg'
import { destroyClient } from './torrent'
import { getEmulatorStatus, installEmulator, launchGame, deleteEmulator, openEmulator } from './emulator'
import type { Game, Platform, RomOption } from '../shared/types'

const isDev = !!(process as NodeJS.Process & { defaultApp?: boolean }).defaultApp

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    icon: path.join(process.cwd(), 'public/RetrioIcon.png'),
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

// ── Folder IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-rom', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'ROMs', extensions: ['nes', 'smc', 'sfc', 'fig', 'md', 'gen', 'smd', 'n64', 'z64', 'v64', 'iso', 'bin', 'cue', 'img', 'mdf', 'chd'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  })
  return filePaths[0] ?? null
})

ipcMain.handle('folder:open', async (_e, { path: folderPath }: { path: string }) => {
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
  const err = await shell.openPath(folderPath)
  if (err) throw new Error(err)
})

ipcMain.handle('folder:get-defaults', () => ({
  roms: path.join(app.getPath('userData'), 'roms'),
  emulators: path.join(app.getPath('userData'), 'emulators'),
  bios: path.join(app.getPath('userData'), 'emulators', 'bios'),
}))

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

ipcMain.handle('library:dismiss-download', (_e, { id }: { id: number }) => {
  dismissDownload(id)
})

// ── Archive.org IPC ───────────────────────────────────────────────────────────

ipcMain.handle('archive:find-roms', async (_e, { game }: { game: Game }) => {
  return findRomsOnArchive(game.title, game.platform)
})

ipcMain.handle('archive:download', (_e, { game, romOption }: { game: Game; romOption?: RomOption }) => {
  const win = BrowserWindow.getAllWindows()[0]

  void startArchiveDownload({
    game,
    romOption,
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

ipcMain.handle('archive:pause', (_e, { gameId }: { gameId: number }) => {
  return pauseArchiveDownload(gameId)
})

ipcMain.handle('archive:resume', (_e, { gameId }: { gameId: number }) => {
  const win = BrowserWindow.getAllWindows()[0]
  void resumeArchiveDownload(gameId).catch((err: Error) => {
    win?.webContents.send('archive:error', { gameId, message: err.message })
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

ipcMain.handle('emulator:open', (_e, { id }: { id: string }) => {
  return openEmulator(id)
})

ipcMain.handle('emulator:install', async (_e, { name }: { name: string }) => {
  const win = BrowserWindow.getAllWindows()[0]
  await installEmulator(name, (received, total) => {
    win?.webContents.send('emulator:install-progress', { emulatorId: name, received, total })
  })
})

ipcMain.handle('emulator:launch', (_e, { romPath, platform }: { romPath: string; platform: Platform }) => {
  return launchGame(romPath, platform)
})

ipcMain.handle('window:set-size', (_e, { width, height }: { width: number; height: number }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.setSize(width, height, true)
  win?.center()
})

ipcMain.handle('emulator:delete', (_e, { id }: { id: string }) => {
  deleteEmulator(id)
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
