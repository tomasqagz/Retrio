import { contextBridge, ipcRenderer } from 'electron'
import type { RetrioAPI, DownloadProgress, EmulatorInstallProgress, UpdaterEvent, Game, RomOption } from '../shared/types'

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
  launchGame: (romPath, platform, gameId) =>
    ipcRenderer.invoke('emulator:launch', { romPath, platform, gameId }),
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

  // Configuración IGDB
  getIgdbCredentials: () => ipcRenderer.invoke('config:get-igdb'),
  setIgdbCredentials: (clientId: string, clientSecret: string) => ipcRenderer.invoke('config:set-igdb', { clientId, clientSecret }),

  // Emuladores personalizados
  getCustomEmulatorPaths: () => ipcRenderer.invoke('config:get-custom-emulators'),
  setCustomEmulatorPath: (platform: string, exePath: string) => ipcRenderer.invoke('config:set-custom-emulator', { platform, exePath }),
  removeCustomEmulatorPath: (platform: string) => ipcRenderer.invoke('config:remove-custom-emulator', { platform }),
  openExeDialog: () => ipcRenderer.invoke('dialog:open-exe'),

  // Cache de búsqueda
  clearSearchCache: () => ipcRenderer.invoke('cache:clear'),
  getSearchCacheInfo: () => ipcRenderer.invoke('cache:info'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (callback: (event: UpdaterEvent) => void) => {
    const handler = (_e: unknown, event: UpdaterEvent) => callback(event)
    ipcRenderer.on('updater:event', handler)
    return () => ipcRenderer.removeListener('updater:event', handler)
  },

  // Biblioteca SQLite
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addToLibrary: (game) => ipcRenderer.invoke('library:add', game),
  removeFromLibrary: (id) => ipcRenderer.invoke('library:remove', { id }),
  isInLibrary: (id) => ipcRenderer.invoke('library:has', { id }),
  dismissDownload: (id) => ipcRenderer.invoke('library:dismiss-download', { id }),
  markNoRom: (id, value) => ipcRenderer.invoke('library:set-no-rom', { id, value }),
  getRomInfo: (id) => ipcRenderer.invoke('library:get-rom-info', { id }),
  toggleFavorite: (id) => ipcRenderer.invoke('library:toggle-favorite', { id }),
}

contextBridge.exposeInMainWorld('retrio', api)
