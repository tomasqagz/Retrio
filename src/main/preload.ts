import { contextBridge, ipcRenderer } from 'electron'
import type { RetrioAPI, DownloadProgress } from '../shared/types'

const api: RetrioAPI = {
  // IGDB
  searchGames: (query, platform) =>
    ipcRenderer.invoke('igdb:search', { query, platform }),
  getPopularGames: (platform) =>
    ipcRenderer.invoke('igdb:popular', { platform }),
  getGameById: (id) =>
    ipcRenderer.invoke('igdb:game', { id }),

  // Torrent (próximamente)
  downloadGame: (magnetUri, destPath) =>
    ipcRenderer.invoke('torrent:download', { magnetUri, destPath }),
  cancelDownload: (infoHash) =>
    ipcRenderer.invoke('torrent:cancel', { infoHash }),
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => {
    ipcRenderer.on('torrent:progress', (_e, data: DownloadProgress) => callback(data))
  },

  // Emuladores (próximamente)
  launchGame: (romPath, platform) =>
    ipcRenderer.invoke('emulator:launch', { romPath, platform }),
  installEmulator: (name) =>
    ipcRenderer.invoke('emulator:install', { name }),
  getEmulatorStatus: () =>
    ipcRenderer.invoke('emulator:status'),

  // Biblioteca SQLite
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addToLibrary: (game) => ipcRenderer.invoke('library:add', game),
  removeFromLibrary: (id) => ipcRenderer.invoke('library:remove', { id }),
  isInLibrary: (id) => ipcRenderer.invoke('library:has', { id }),
}

contextBridge.exposeInMainWorld('retrio', api)
