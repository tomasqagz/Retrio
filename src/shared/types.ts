// ── Plataformas soportadas ────────────────────────────────────────────────────

export type Platform =
  | 'NES'
  | 'SNES'
  | 'Sega Genesis'
  | 'PS1'
  | 'PS2'
  | 'N64'
  | 'PC'
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

export interface DownloadProgress {
  infoHash: string
  gameId: number
  progress: number       // 0-100
  downloadSpeed: number  // bytes/s
  timeRemaining: number  // segundos
}

// ── API expuesta por el preload al renderer ───────────────────────────────────

export interface RetrioAPI {
  // IGDB
  searchGames: (query: string, platform: string | null) => Promise<Game[]>
  getPopularGames: (platform: string | null) => Promise<Game[]>
  getGameById: (id: number) => Promise<Game | null>

  // Torrent
  downloadGame: (magnetUri: string, game: Game) => Promise<void>
  cancelDownload: (infoHash: string) => Promise<void>
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => void
  onDownloadDone: (callback: (data: { gameId: number; romPath: string }) => void) => void
  onDownloadError: (callback: (data: { gameId: number; message: string }) => void) => void

  // Emuladores
  launchGame: (romPath: string, platform: Platform) => Promise<void>
  installEmulator: (name: string) => Promise<void>
  getEmulatorStatus: () => Promise<Emulator[]>

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
