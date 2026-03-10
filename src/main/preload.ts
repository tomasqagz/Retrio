import { contextBridge, ipcRenderer } from 'electron'
import type { RetrioAPI, DownloadProgress, EmulatorInstallProgress, Game, RomOption } from '../shared/types'

const api: RetrioAPI = {
  // IGDB
  searchGames: (query, platform, sortBy, offset, genreId) =>
    ipcRenderer.invoke('igdb:search', { query, platform, sortBy, offset, genreId }),
  getPopularGames: (platform, sortBy, offset, genreId) =>
    ipcRenderer.invoke('igdb:popular', { platform, sortBy, offset, genreId }),
  getGameById: (id) =>
    ipcRenderer.invoke('igdb:game', { id }),

  // Descarga (Archive.org)
  findRoms: (game: Game) =>
    ipcRenderer.invoke('archive:find-roms', { game }),
  downloadGame: (game: Game, romOption?: RomOption) =>
    ipcRenderer.invoke('archive:download', { game, romOption }),
  pauseDownload: (gameId: number) =>
    ipcRenderer.invoke('archive:pause', { gameId }),
  resumeDownload: (gameId: number) =>
    ipcRenderer.invoke('archive:resume', { gameId }),
  cancelDownload: (gameId: number) =>
    ipcRenderer.invoke('archive:cancel', { gameId }),
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => {
    const handler = (_e: unknown, data: DownloadProgress) => callback(data)
    ipcRenderer.on('archive:progress', handler)
    return () => ipcRenderer.removeListener('archive:progress', handler)
  },
  onDownloadDone: (callback: (data: { gameId: number; romPath: string }) => void) => {
    const handler = (_e: unknown, data: { gameId: number; romPath: string }) => callback(data)
    ipcRenderer.on('archive:done', handler)
    return () => ipcRenderer.removeListener('archive:done', handler)
  },
  onDownloadError: (callback: (data: { gameId: number; message: string }) => void) => {
    const handler = (_e: unknown, data: { gameId: number; message: string }) => callback(data)
    ipcRenderer.on('archive:error', handler)
    return () => ipcRenderer.removeListener('archive:error', handler)
  },

  // Emuladores
  launchGame: (romPath, platform) =>
    ipcRenderer.invoke('emulator:launch', { romPath, platform }),
  setWindowSize: (width, height) =>
    ipcRenderer.invoke('window:set-size', { width, height }),
  installEmulator: (name) =>
    ipcRenderer.invoke('emulator:install', { name }),
  openEmulator: (id) =>
    ipcRenderer.invoke('emulator:open', { id }),
  getEmulatorStatus: () =>
    ipcRenderer.invoke('emulator:status'),
  deleteEmulator: (id) =>
    ipcRenderer.invoke('emulator:delete', { id }),
  onEmulatorInstallProgress: (callback: (data: EmulatorInstallProgress) => void) => {
    const handler = (_e: unknown, data: EmulatorInstallProgress) => callback(data)
    ipcRenderer.on('emulator:install-progress', handler)
    return () => ipcRenderer.removeListener('emulator:install-progress', handler)
  },

  // Carpetas / Diálogos
  openRomDialog: () => ipcRenderer.invoke('dialog:open-rom'),
  openFolder: (folderPath: string) => ipcRenderer.invoke('folder:open', { path: folderPath }),
  getFolderDefaults: () => ipcRenderer.invoke('folder:get-defaults'),

  // Biblioteca SQLite
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addToLibrary: (game) => ipcRenderer.invoke('library:add', game),
  removeFromLibrary: (id) => ipcRenderer.invoke('library:remove', { id }),
  isInLibrary: (id) => ipcRenderer.invoke('library:has', { id }),
  dismissDownload: (id) => ipcRenderer.invoke('library:dismiss-download', { id }),
}

contextBridge.exposeInMainWorld('retrio', api)
