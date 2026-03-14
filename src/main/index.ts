import 'dotenv/config'
import { app, BrowserWindow, shell, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { searchGames, getPopularGames, getGameById, invalidateTokenCache } from './igdb'
import { readConfig, writeConfig } from './config'
import {
  getLibrary,
  getGameFromLibrary,
  addToLibrary,
  removeFromLibrary,
  isInLibrary,
  dismissDownload,
  setNoRom,
  addPlayTime,
  toggleFavorite,
  clearSearchCache,
  getSearchCacheInfo,
} from './database'
import { startArchiveDownload, pauseArchiveDownload, resumeArchiveDownload, cancelArchiveDownload, findRomsOnArchive } from './archiveorg'
import { destroyClient } from './torrent'
import { getEmulatorStatus, installEmulator, launchGame, deleteEmulator, openEmulator } from './emulator'
import { cacheGameImages, localizeGameUrls, clearImageCache, gameImageDir } from './imageCache'
import { initUpdater } from './updater'
import type { Game, Platform, RomOption } from '../shared/types'

// Registrar esquema custom ANTES de app.whenReady()
protocol.registerSchemesAsPrivileged([{
  scheme: 'retrio-img',
  privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true },
}])

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
    icon: isDev
      ? path.join(process.cwd(), 'public/icon.ico')
      : path.join(__dirname, '../../renderer/icon.ico'),
    webPreferences: {
      preload: isDev
        ? path.join(process.cwd(), 'dist/preload/main/preload.js')
        : path.join(__dirname, '../../preload/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/index.html'))
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
  let game: Game | null = null

  try {
    game = await getGameById(id)
  } catch {
    // Sin conexión: intentar con datos de biblioteca como fallback
    game = getGameFromLibrary(id)
  }

  if (!game) return null

  if (isInLibrary(game.id)) {
    // Cachear screenshots si aún no están descargadas
    const dir = gameImageDir(game.id)
    const firstScreenshot = path.join(dir, 'screenshot_0.jpg')
    if (game.screenshots?.length && !fs.existsSync(firstScreenshot)) {
      cacheGameImages(game)
    }
    return localizeGameUrls(game)
  }

  return game
})

// ── Cache IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('cache:clear', () => {
  clearSearchCache()
  clearImageCache()
})

ipcMain.handle('cache:info', () => {
  return getSearchCacheInfo()
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
  return getLibrary().map(localizeGameUrls)
})

ipcMain.handle('library:get-one', (_e, { id }: { id: number }) => {
  const game = getGameFromLibrary(id)
  return game ? localizeGameUrls(game) : null
})

ipcMain.handle('library:add', (_e, game: Game) => {
  addToLibrary(game)
  cacheGameImages(game) // descarga cover en background
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

ipcMain.handle('library:set-no-rom', (_e, { id, value }: { id: number; value: boolean }) => {
  setNoRom(id, value)
})


ipcMain.handle('library:toggle-favorite', (_e, { id }: { id: number }) => {
  toggleFavorite(id)
})

ipcMain.handle('library:get-rom-info', (_e, { id }: { id: number }) => {
  const game = getGameFromLibrary(id)
  if (!game?.romPath || !fs.existsSync(game.romPath)) return null
  const stat = fs.statSync(game.romPath)
  return { fileSize: stat.size, fileName: path.basename(game.romPath) }
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

ipcMain.handle('emulator:launch', (_e, { romPath, platform, gameId }: { romPath: string; platform: Platform; gameId?: number }) => {
  const sessionStart = Math.floor(Date.now() / 1000)
  const onExit = gameId != null ? (seconds: number) => { addPlayTime(gameId, seconds, sessionStart) } : undefined
  return launchGame(romPath, platform, onExit)
})

ipcMain.handle('window:set-size', (_e, { width, height }: { width: number; height: number }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.setSize(width, height, true)
  win?.center()
})

ipcMain.handle('emulator:delete', (_e, { id }: { id: string }) => {
  deleteEmulator(id)
})

// ── Config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('config:get-igdb', () => {
  const config = readConfig()
  return { clientId: config.igdbClientId ?? '', clientSecret: config.igdbClientSecret ?? '' }
})

ipcMain.handle('config:set-igdb', (_e, { clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
  writeConfig({ igdbClientId: clientId.trim(), igdbClientSecret: clientSecret.trim() })
  invalidateTokenCache()
})

ipcMain.handle('config:get-custom-emulators', () => {
  return readConfig().customEmulatorPaths ?? {}
})

ipcMain.handle('config:set-custom-emulator', (_e, { platform, exePath }: { platform: string; exePath: string }) => {
  const current = readConfig().customEmulatorPaths ?? {}
  writeConfig({ customEmulatorPaths: { ...current, [platform]: exePath } })
})

ipcMain.handle('config:remove-custom-emulator', (_e, { platform }: { platform: string }) => {
  const current = readConfig().customEmulatorPaths ?? {}
  const updated = { ...current }
  delete updated[platform]
  writeConfig({ customEmulatorPaths: updated })
})

ipcMain.handle('dialog:open-exe', async () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return null
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Seleccionar emulador',
    filters: [{ name: 'Ejecutable', extensions: ['exe'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Crear carpetas por defecto si no existen
  for (const dir of [
    path.join(app.getPath('userData'), 'roms'),
    path.join(app.getPath('userData'), 'emulators'),
    path.join(app.getPath('userData'), 'emulators', 'bios'),
  ]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  // Servir imágenes cacheadas localmente vía retrio-img://img/{gameId}/{filename}
  protocol.handle('retrio-img', async (request) => {
    const parsed = new URL(request.url)
    const segments = parsed.pathname.replace(/^\/+/, '').split('/')
    const filePath = path.join(
      app.getPath('userData'),
      'image-cache',
      ...segments,
    )
    try {
      const data = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return new Response(data.buffer as ArrayBuffer, { headers: { 'Content-Type': mimeType } })
    } catch (err) {
      console.error('[retrio-img] failed to serve:', filePath, err)
      return new Response(null, { status: 404 })
    }
  })

  createWindow()
  initUpdater(isDev)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  destroyClient()
  if (process.platform !== 'darwin') app.quit()
})
