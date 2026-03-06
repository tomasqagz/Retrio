import WebTorrent from 'webtorrent'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { DownloadProgress } from '../shared/types'
import { addToLibrary, markAsDownloaded, updateDownloadProgress } from './database'
import type { Game } from '../shared/types'

// ── Cliente singleton ─────────────────────────────────────────────────────────

let client: WebTorrent.Instance | null = null

function getClient(): WebTorrent.Instance {
  if (!client) {
    client = new WebTorrent()
    client.on('error', (err) => console.error('[WebTorrent]', err))
  }
  return client
}

// ── Directorio de ROMs ────────────────────────────────────────────────────────

function getRomsDir(): string {
  const dir = path.join(app.getPath('userData'), 'roms')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Callbacks de progreso ─────────────────────────────────────────────────────

type ProgressCallback = (data: DownloadProgress) => void
const progressListeners = new Map<string, ProgressCallback>()

export function onProgress(infoHash: string, cb: ProgressCallback): void {
  progressListeners.set(infoHash, cb)
}

export function offProgress(infoHash: string): void {
  progressListeners.delete(infoHash)
}

// ── Extensiones válidas de ROM ────────────────────────────────────────────────

const VALID_EXTENSIONS = new Set([
  '.nes', '.smc', '.sfc', '.fig',         // NES / SNES
  '.md', '.smd', '.gen', '.bin',           // Sega Genesis
  '.n64', '.v64', '.z64',                  // N64
  '.iso', '.cue', '.img', '.mdf',          // PS1 / PS2
  '.chd',                                  // Formato comprimido universal
  '.rom', '.gba', '.gbc', '.gb',           // Otras
])

function findRomFile(dir: string): string | null {
  const files = fs.readdirSync(dir, { recursive: true }) as string[]
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (VALID_EXTENSIONS.has(ext)) {
      return path.join(dir, file)
    }
  }
  return null
}

// ── API pública ───────────────────────────────────────────────────────────────

export interface StartDownloadOptions {
  magnetUri: string
  game: Game
  onProgress: ProgressCallback
  onDone: (romPath: string) => void
  onError: (err: Error) => void
}

export function startDownload({
  magnetUri,
  game,
  onProgress: progressCb,
  onDone,
  onError,
}: StartDownloadOptions): string {
  const romsDir = getRomsDir()
  const gameDir = path.join(romsDir, String(game.id))

  // Guardar en biblioteca como "descargando"
  addToLibrary({ ...game, downloading: true, downloaded: false, progress: 0 })

  const torrent = getClient().add(magnetUri, { path: gameDir })

  onProgress(torrent.infoHash, progressCb)

  const progressInterval = setInterval(() => {
    const pct = Math.round(torrent.progress * 100)
    const data: DownloadProgress = {
      infoHash: torrent.infoHash,
      gameId: game.id,
      progress: pct,
      downloadSpeed: torrent.downloadSpeed,
      timeRemaining: torrent.timeRemaining / 1000,
    }
    updateDownloadProgress(game.id, pct)
    progressCb(data)
  }, 1000)

  torrent.on('done', () => {
    clearInterval(progressInterval)
    offProgress(torrent.infoHash)

    const romPath = findRomFile(gameDir)
    if (romPath) {
      markAsDownloaded(game.id, romPath)
      onDone(romPath)
    } else {
      onError(new Error('No se encontró un archivo ROM válido en el torrent'))
    }
  })

  torrent.on('error', (err) => {
    clearInterval(progressInterval)
    offProgress(torrent.infoHash)
    onError(err instanceof Error ? err : new Error(String(err)))
  })

  return torrent.infoHash
}

export function cancelDownload(infoHash: string): void {
  const torrent = getClient().get(infoHash)
  if (torrent) {
    offProgress(infoHash)
    torrent.destroy()
  }
}

export function getActiveDownloads(): Array<{ infoHash: string; progress: number; name: string }> {
  return getClient().torrents.map((t) => ({
    infoHash: t.infoHash,
    progress: Math.round(t.progress * 100),
    name: t.name ?? 'Desconocido',
  }))
}

export function destroyClient(): void {
  if (client) {
    client.destroy()
    client = null
  }
}
