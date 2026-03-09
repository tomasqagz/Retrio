// ── Plataformas soportadas ────────────────────────────────────────────────────

export type Platform =
  | 'NES'
  | 'SNES'
  | 'Sega Genesis'
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
  downloadGame: (game: Game) => Promise<void>
  cancelDownload: (gameId: number) => Promise<void>
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void
  onDownloadDone: (callback: (data: { gameId: number; romPath: string }) => void) => () => void
  onDownloadError: (callback: (data: { gameId: number; message: string }) => void) => () => void

  // Emuladores
  launchGame: (romPath: string, platform: Platform) => Promise<void>
  installEmulator: (name: string) => Promise<void>
  getEmulatorStatus: () => Promise<Emulator[]>
  onEmulatorInstallProgress: (callback: (data: EmulatorInstallProgress) => void) => () => void

  // Carpetas
  openFolder: (path: string) => Promise<void>
  getFolderDefaults: () => Promise<{ roms: string; emulators: string }>

  // Biblioteca (SQLite)
  getLibrary: () => Promise<Game[]>
  addToLibrary: (game: Game) => Promise<void>
  removeFromLibrary: (id: number) => Promise<void>
  isInLibrary: (id: number) => Promise<boolean>
}

// ── Extensión global de Window para el renderer ───────────────────────────────

declare global {
  interface Window {
    retrio: RetrioAPI
  }
}
