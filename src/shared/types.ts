// ── Plataformas soportadas ────────────────────────────────────────────────────

export type Platform =
  | 'NES'
  | 'SNES'
  | 'Sega Genesis'
  | 'Sega Saturn'
  | 'PS1'
  | 'PS2'
  | 'N64'
  | 'Desconocida'

// ── Juego ─────────────────────────────────────────────────────────────────────

export interface Game {
  id: number
  title: string
  platform: Platform
  year: number | null
  coverUrl: string | null
  coverUrlHd: string | null
  summary: string | null
  rating: number | null
  genres?: string[]
  developers?: string[]
  screenshots?: string[]
  videos?: string[]
  // Estado local
  downloaded: boolean
  downloading: boolean
  progress?: number
  romPath?: string
  dlDismissed?: boolean
  noRom?: boolean
  playTime?: number      // seconds played total
  lastPlayedAt?: number  // unix timestamp of last session start
  addedAt?: number       // unix timestamp (seconds)
  favorite?: boolean
}

// ── Emuladores ────────────────────────────────────────────────────────────────

export type EmulatorStatus = 'installed' | 'not_installed' | 'installing'

export interface Emulator {
  id: string
  name: string
  platforms: Platform[]
  status: EmulatorStatus
  version: string | null
}

// ── ROM picker ────────────────────────────────────────────────────────────────

export interface RomOption {
  identifier: string
  files: string[]
  primaryFile: string
  size: number
  label: string
}

// ── Descarga ──────────────────────────────────────────────────────────────────

export interface EmulatorInstallProgress {
  emulatorId: string
  received: number  // bytes
  total: number     // bytes (0 si desconocido)
}

export interface DownloadProgress {
  infoHash: string
  gameId: number
  progress: number       // 0-100
  downloadSpeed: number  // bytes/s
  timeRemaining: number  // segundos
}

// ── Ordenamiento de búsqueda ──────────────────────────────────────────────────

export type SortBy = 'relevance' | 'rating' | 'popular' | 'newest' | 'oldest'

// ── API expuesta por el preload al renderer ───────────────────────────────────

export interface RetrioAPI {
  // IGDB
  searchGames: (query: string, platform: string | null, sortBy?: SortBy, offset?: number, genreId?: number | null) => Promise<Game[]>
  getPopularGames: (platform: string | null, sortBy?: SortBy, offset?: number, genreId?: number | null) => Promise<Game[]>
  getGameById: (id: number) => Promise<Game | null>

  // Descarga (Archive.org)
  findRoms: (game: Game) => Promise<RomOption[]>
  downloadGame: (game: Game, romOption?: RomOption) => Promise<void>
  pauseDownload: (gameId: number) => Promise<boolean>
  resumeDownload: (gameId: number) => Promise<void>
  cancelDownload: (gameId: number) => Promise<void>
  getDownloadState: () => Promise<{ active: number[]; paused: number[] }>
  quitApp: () => Promise<void>
  hideWindow: () => Promise<void>
  onConfirmQuit: (callback: () => void) => () => void
  onCloseRequested: (callback: () => void) => () => void
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void
  onDownloadDone: (callback: (data: { gameId: number; romPath: string }) => void) => () => void
  onDownloadError: (callback: (data: { gameId: number; message: string }) => void) => () => void

  // Emuladores
  launchGame: (romPath: string, platform: Platform, gameId?: number) => Promise<void>
  setWindowSize: (width: number, height: number) => Promise<void>
  installEmulator: (name: string) => Promise<void>
  openEmulator: (id: string) => Promise<void>
  getEmulatorStatus: () => Promise<Emulator[]>
  deleteEmulator: (id: string) => Promise<void>
  onEmulatorInstallProgress: (callback: (data: EmulatorInstallProgress) => void) => () => void

  // Carpetas / Diálogos
  openRomDialog: () => Promise<string | null>
  openFolder: (path: string) => Promise<void>
  getFolderDefaults: () => Promise<{ roms: string; emulators: string; bios: string }>

  // Configuración IGDB
  getIgdbCredentials: () => Promise<{ clientId: string; clientSecret: string }>
  setIgdbCredentials: (clientId: string, clientSecret: string) => Promise<void>

  // Emuladores personalizados
  getCustomEmulatorPaths: () => Promise<Record<string, string>>
  setCustomEmulatorPath: (platform: string, exePath: string) => Promise<void>
  removeCustomEmulatorPath: (platform: string) => Promise<void>
  openExeDialog: () => Promise<string | null>

  // Cache de búsqueda
  clearSearchCache: () => Promise<void>
  getSearchCacheInfo: () => Promise<{ count: number; sizeBytes: number }>

  // Biblioteca (SQLite)
  getLibrary: () => Promise<Game[]>
  addToLibrary: (game: Game) => Promise<void>
  removeFromLibrary: (id: number) => Promise<void>
  isInLibrary: (id: number) => Promise<boolean>
  dismissDownload: (id: number) => Promise<void>
  markNoRom: (id: number, value: boolean) => Promise<void>
  getRomInfo: (id: number) => Promise<{ fileSize: number; fileName: string } | null>
  toggleFavorite: (id: number) => Promise<void>

  // Updater
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdaterEvent: (callback: (event: UpdaterEvent) => void) => () => void
}

// ── Updater ───────────────────────────────────────────────────────────────────

export interface UpdaterEvent {
  type: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error'
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  message?: string
}

// ── Extensión global de Window para el renderer ───────────────────────────────

declare global {
  interface Window {
    retrio: RetrioAPI
  }
}
