import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Game, Platform, DownloadProgress } from '../shared/types'
import { addToLibrary, markAsDownloaded, updateDownloadProgress } from './database'

// ── Extensiones válidas por plataforma ────────────────────────────────────────

const PLATFORM_EXTENSIONS: Record<Platform, string[]> = {
  NES:            ['.nes'],
  SNES:           ['.smc', '.sfc', '.fig'],
  'Sega Genesis': ['.md', '.smd', '.gen'],
  PS1:            ['.chd', '.iso', '.cue', '.toc', '.bin'],
  PS2:            ['.chd', '.iso'],
  N64:            ['.n64', '.v64', '.z64'],
  Desconocida:    ['.rom', '.bin'],
}

// Formatos de archivo único (no necesitan archivos adicionales)
const SINGLE_FILE_EXTS = new Set(['.chd', '.iso', '.img', '.mdf', '.nes', '.smc', '.sfc', '.fig', '.md', '.smd', '.gen', '.n64', '.v64', '.z64', '.rom', '.gba', '.gbc', '.gb'])

function formatPriority(name: string): number {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (SINGLE_FILE_EXTS.has(ext)) return 0  // preferir formato único
  if (ext === '.cue' || ext === '.toc') return 1
  if (ext === '.bin') return 2
  return 3
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function fetchJson<T>(url: string, depth = 0): Promise<T> {
  if (depth > 5) return Promise.reject(new Error('Demasiadas redirecciones'))
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    const req = get(url, { headers: { 'User-Agent': 'Retrio/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson<T>(res.headers.location, depth + 1).then(resolve).catch(reject)
        return
      }
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T) }
        catch (e) { reject(new Error(`JSON parse error: ${String(e)}`)) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout buscando en Archive.org')) })
  })
}

// ── Búsqueda en Archive.org ───────────────────────────────────────────────────

interface ArchiveDoc { identifier: string }
interface ArchiveFile { name: string; size?: string }

const PLATFORM_TERMS: Partial<Record<Platform, string>> = {
  PS1:            '(PlayStation OR PSX OR "PS1")',
  PS2:            '(PlayStation 2 OR "PS2")',
  NES:            '(NES OR "Nintendo Entertainment System" OR Famicom)',
  SNES:           '(SNES OR "Super Nintendo" OR "Super Famicom")',
  N64:            '("Nintendo 64" OR N64)',
  'Sega Genesis': '(Genesis OR "Mega Drive" OR Sega)',
}

async function findRomOnArchive(
  title: string,
  platform: Platform,
): Promise<{ identifier: string; files: string[]; primaryFile: string; size: number } | null> {
  const exts = PLATFORM_EXTENSIONS[platform] ?? []
  const pt = PLATFORM_TERMS[platform]

  // Intentar primero con filtro de plataforma, luego sin él como fallback
  const queries = [
    ...(pt ? [
      `title:"${title}" AND mediatype:software AND ${pt}`,
      `"${title}" AND mediatype:software AND ${pt}`,
    ] : []),
    `title:"${title}" AND mediatype:software`,
    `"${title}" AND mediatype:software`,
    `${title} AND mediatype:software`,
  ]

  for (const q of queries) {
    const url =
      `https://archive.org/advancedsearch.php` +
      `?q=${encodeURIComponent(q)}&output=json&rows=8&fl[]=identifier,title`

    let docs: ArchiveDoc[] = []
    try {
      const result = await fetchJson<{ response: { docs: ArchiveDoc[] } }>(url)
      docs = result?.response?.docs ?? []
    } catch {
      continue
    }

    for (const doc of docs) {
      try {
        const filesResult = await fetchJson<{ result: ArchiveFile[] }>(
          `https://archive.org/metadata/${doc.identifier}/files`,
        )
        const allFiles = filesResult?.result ?? []

        // Encontrar ROMs de la plataforma, preferir formatos de archivo único
        const DEMO_RE = /\b(demo|sample|preview|trailer|trial)\b/i
        const allRomFiles = allFiles.filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)))
        const nonDemoFiles = allRomFiles.filter((f) => !DEMO_RE.test(f.name))
        // Prefer non-demo files; within same format prefer largest (main game > bonus/demo discs)
        const romFiles = (nonDemoFiles.length > 0 ? nonDemoFiles : allRomFiles)
          .sort((a, b) => formatPriority(a.name) - formatPriority(b.name) || Number(b.size ?? 0) - Number(a.size ?? 0))

        if (romFiles.length === 0) continue

        const primary = romFiles[0]
        const primaryExt = primary.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''

        // Si es descriptor (.cue/.toc), también incluir todos los .bin
        // Si es .bin, también incluir el descriptor (.toc/.cue) asociado
        let filesToDownload = [primary.name]
        if (primaryExt === '.cue' || primaryExt === '.toc') {
          const bins = allFiles
            .filter((f) => f.name.toLowerCase().endsWith('.bin'))
            .map((f) => f.name)
          filesToDownload = [primary.name, ...bins]
        } else if (primaryExt === '.bin') {
          const basename = primary.name.replace(/\.[^.]+$/, '').toLowerCase()
          const descriptor = allFiles.find((f) => {
            const n = f.name.toLowerCase()
            return (n.endsWith('.toc') || n.endsWith('.cue')) && n.startsWith(basename)
          })
          if (descriptor) filesToDownload = [primary.name, descriptor.name]
        }

        return {
          identifier: doc.identifier,
          files: filesToDownload,
          primaryFile: primary.name,
          size: Number(primary.size ?? 0),
        }
      } catch {
        continue
      }
    }
  }

  return null
}

// ── Descarga HTTP con progreso ─────────────────────────────────────────────────

const activeRequests = new Map<number, ReturnType<typeof https.get>>()

function downloadFile(
  url: string,
  dest: string,
  onProgress: (downloaded: number, total: number, speed: number) => void,
  gameId: number,
  depth = 0,
): Promise<void> {
  if (depth > 5) return Promise.reject(new Error('Demasiadas redirecciones en la descarga'))

  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    const req = get(url, { headers: { 'User-Agent': 'Retrio/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest, onProgress, gameId, depth + 1)
          .then(resolve)
          .catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode ?? 'desconocido'}`))
        return
      }

      const total = parseInt(res.headers['content-length'] ?? '0', 10)
      let downloaded = 0
      const startTime = Date.now()
      const file = fs.createWriteStream(dest)

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0.1 ? downloaded / elapsed : 0
        onProgress(downloaded, total, speed)
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
      res.on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
    })

    req.on('error', reject)
    activeRequests.set(gameId, req)
  })
}

// ── Directorio de ROMs ────────────────────────────────────────────────────────

function getRomsDir(): string {
  const dir = path.join(app.getPath('userData'), 'roms')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── API pública ───────────────────────────────────────────────────────────────

export type ProgressCallback = (data: DownloadProgress) => void

export interface StartArchiveDownloadOptions {
  game: Game
  onProgress: ProgressCallback
  onDone: (romPath: string) => void
  onError: (err: Error) => void
}

export async function startArchiveDownload({
  game,
  onProgress,
  onDone,
  onError,
}: StartArchiveDownloadOptions): Promise<void> {
  // Guardar en biblioteca como "descargando"
  addToLibrary({ ...game, downloading: true, downloaded: false, progress: 0 })

  let found: { identifier: string; files: string[]; primaryFile: string; size: number } | null = null
  try {
    found = await findRomOnArchive(game.title, game.platform)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!found) {
    onError(new Error(`No se encontró "${game.title}" para ${game.platform} en Archive.org`))
    return
  }

  const gameDir = path.join(getRomsDir(), String(game.id))
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true })

  const totalFiles = found.files.length
  for (let i = 0; i < totalFiles; i++) {
    const fileName = path.basename(found.files[i])
    const destPath = path.join(gameDir, fileName)
    const downloadUrl = `https://archive.org/download/${found.identifier}/${encodeURIComponent(found.files[i])}`

    try {
      await downloadFile(
        downloadUrl,
        destPath,
        (downloaded, total, speed) => {
          // Progreso ponderado por archivo: cada archivo ocupa 1/totalFiles del total
          const fileProgress = total > 0 ? downloaded / total : 0
          const progress = Math.round(((i + fileProgress) / totalFiles) * 100)
          const remaining = speed > 0 && total > 0 ? (total - downloaded) / speed : 0
          updateDownloadProgress(game.id, progress)
          onProgress({
            infoHash: String(game.id),
            gameId: game.id,
            progress,
            downloadSpeed: speed,
            timeRemaining: remaining,
          })
        },
        game.id,
      )
    } catch (err) {
      activeRequests.delete(game.id)
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
  }

  activeRequests.delete(game.id)
  const primaryDest = path.join(gameDir, path.basename(found.primaryFile))
  markAsDownloaded(game.id, primaryDest)
  onDone(primaryDest)
}

export function cancelArchiveDownload(gameId: number): void {
  const req = activeRequests.get(gameId)
  if (req) {
    req.destroy()
    activeRequests.delete(gameId)
  }
}
