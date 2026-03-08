import { contextBridge, ipcRenderer } from 'electron'
import type { RetrioAPI, DownloadProgress, EmulatorInstallProgress, Game } from '../shared/types'

const api: RetrioAPI = {
  // IGDB
  searchGames: (query, platform, sortBy, offset, genreId) =>
    ipcRenderer.invoke('igdb:search', { query, platform, sortBy, offset, genreId }),
  getPopularGames: (platform, sortBy, offset, genreId) =>
    ipcRenderer.invoke('igdb:popular', { platform, sortBy, offset, genreId }),
  getGameById: (id) =>
    ipcRenderer.invoke('igdb:game', { id }),

  // Descarga (Archive.org)
  downloadGame: (game: Game) =>
    ipcRenderer.invoke('archive:download', { game }),
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
  installEmulator: (name) =>
    ipcRenderer.invoke('emulator:install', { name }),
  getEmulatorStatus: () =>
    ipcRenderer.invoke('emulator:status'),
  onEmulatorInstallProgress: (callback: (data: EmulatorInstallProgress) => void) => {
    const handler = (_e: unknown, data: EmulatorInstallProgress) => callback(data)
    ipcRenderer.on('emulator:install-progress', handler)
    return () => ipcRenderer.removeListener('emulator:install-progress', handler)
  },

  // Biblioteca SQLite
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addToLibrary: (game) => ipcRenderer.invoke('library:add', game),
  removeFromLibrary: (id) => ipcRenderer.invoke('library:remove', { id }),
  isInLibrary: (id) => ipcRenderer.invoke('library:has', { id }),
}

contextBridge.exposeInMainWorld('retrio', api)
