import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Game, Platform, DownloadProgress, RomOption } from '../shared/types'
import { addToLibrary, markAsDownloaded, updateDownloadProgress } from './database'

// ── Extensiones válidas por plataforma ────────────────────────────────────────

const PLATFORM_EXTENSIONS: Record<Platform, string[]> = {
  NES:            ['.nes'],
  SNES:           ['.smc', '.sfc', '.fig'],
  'Sega Genesis': ['.md', '.smd', '.gen'],
  'Sega Saturn':  ['.chd', '.iso', '.cue', '.bin'],
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

interface ArchiveDoc { identifier: string; title?: string }
interface ArchiveFile { name: string; size?: string }

const PLATFORM_TERMS: Partial<Record<Platform, string>> = {
  PS1:            '(PlayStation OR PSX OR "PS1")',
  PS2:            '(PlayStation 2 OR "PS2")',
  NES:            '(NES OR "Nintendo Entertainment System" OR Famicom)',
  SNES:           '(SNES OR "Super Nintendo" OR "Super Famicom")',
  N64:            '("Nintendo 64" OR N64)',
  'Sega Genesis': '(Genesis OR "Mega Drive" OR Sega)',
  'Sega Saturn':  '("Sega Saturn" OR Saturn)',
}

// Keywords that, if found in the Archive.org item identifier or title, indicate a WRONG platform
const PLATFORM_EXCLUSION_KEYWORDS: Partial<Record<Platform, RegExp>> = {
  'Sega Saturn':  /playstation|psx|\bps1\b|\bps2\b/i,
  PS1:            /saturn|\bps2\b/i,
  PS2:            /saturn|\bps1\b|psx/i,
  NES:            /super.?nintendo|\bsnes\b|super.?famicom|\bn64\b/i,
  SNES:           /\bnes\b|famicom(?!.*super)|\bn64\b/i,
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

    const excludeKw = PLATFORM_EXCLUSION_KEYWORDS[platform]
    const filteredDocs = docs.filter((doc) => {
      if (!excludeKw) return true
      return !excludeKw.test(doc.identifier) && !excludeKw.test(doc.title ?? '')
    })

    for (const doc of filteredDocs) {
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

// ── Buscar múltiples versiones en Archive.org ─────────────────────────────────

export async function findRomsOnArchive(
  title: string,
  platform: Platform,
): Promise<RomOption[]> {
  const exts = PLATFORM_EXTENSIONS[platform] ?? []
  const pt = PLATFORM_TERMS[platform]

  const queries = [
    ...(pt ? [
      `title:"${title}" AND mediatype:software AND ${pt}`,
      `"${title}" AND mediatype:software AND ${pt}`,
    ] : []),
    `title:"${title}" AND mediatype:software`,
    `"${title}" AND mediatype:software`,
    `${title} AND mediatype:software`,
  ]

  const DEMO_RE = /\b(demo|sample|preview|trailer|trial)\b/i

  for (const q of queries) {
    const url =
      `https://archive.org/advancedsearch.php` +
      `?q=${encodeURIComponent(q)}&output=json&rows=10&fl[]=identifier,title`

    let docs: ArchiveDoc[] = []
    try {
      const result = await fetchJson<{ response: { docs: ArchiveDoc[] } }>(url)
      docs = result?.response?.docs ?? []
    } catch {
      continue
    }

    const options: RomOption[] = []

    // Filter docs whose title doesn't reasonably match the searched title
    const titleWords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const excludeKwMulti = PLATFORM_EXCLUSION_KEYWORDS[platform]
    const relevantDocs = docs.filter((doc) => {
      if (!doc.title) return true
      const docTitle = doc.title.toLowerCase()
      // Must contain at least one title word
      if (!titleWords.some((w) => docTitle.includes(w))) return false
      // Exclude magazines/compilations/etc that don't specifically match the title
      if (/magazine|compilation|collection|multi\s*game|demo\s*disc/i.test(doc.title) && !doc.title.toLowerCase().includes(title.toLowerCase())) return false
      // Exclude items that clearly belong to a different platform
      if (excludeKwMulti && (excludeKwMulti.test(doc.identifier) || excludeKwMulti.test(doc.title ?? ''))) return false
      return true
    })

    for (const doc of relevantDocs) {
      if (options.length >= 6) break
      try {
        const filesResult = await fetchJson<{ result: ArchiveFile[] }>(
          `https://archive.org/metadata/${doc.identifier}/files`,
        )
        const allFiles = filesResult?.result ?? []

        const allRomFiles = allFiles.filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)))
        const nonDemoFiles = allRomFiles.filter((f) => !DEMO_RE.test(f.name))
        const romFiles = (nonDemoFiles.length > 0 ? nonDemoFiles : allRomFiles)
          .sort((a, b) => formatPriority(a.name) - formatPriority(b.name) || Number(b.size ?? 0) - Number(a.size ?? 0))

        if (romFiles.length === 0) continue

        const primary = romFiles[0]
        const primaryExt = primary.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''

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

        // Total size = sum of all files to download
        const totalSize = filesToDownload.reduce((sum, fname) => {
          const f = allFiles.find((af) => af.name === fname)
          return sum + Number(f?.size ?? 0)
        }, 0)

        options.push({
          identifier: doc.identifier,
          files: filesToDownload,
          primaryFile: primary.name,
          size: totalSize,
          label: doc.title ?? doc.identifier,
        })
      } catch {
        continue
      }
    }

    if (options.length > 0) return options
  }

  return []
}

// ── Descarga HTTP con progreso ─────────────────────────────────────────────────

const activeRequests = new Map<number, ReturnType<typeof https.get>>()

function downloadFile(
  url: string,
  dest: string,
  onProgress: (downloaded: number, total: number, speed: number) => void,
  gameId: number,
  resumeOffset = 0,
  depth = 0,
): Promise<void> {
  if (depth > 5) return Promise.reject(new Error('Demasiadas redirecciones en la descarga'))

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'User-Agent': 'Retrio/1.0' }
    if (resumeOffset > 0) headers['Range'] = `bytes=${resumeOffset}-`

    const get = url.startsWith('https') ? https.get : http.get
    const req = get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest, onProgress, gameId, resumeOffset, depth + 1)
          .then(resolve)
          .catch(reject)
        return
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        reject(new Error(`HTTP ${res.statusCode ?? 'desconocido'}`))
        return
      }

      const contentLength = parseInt(res.headers['content-length'] ?? '0', 10)
      const total = resumeOffset + contentLength
      let downloaded = resumeOffset
      const startTime = Date.now()
      const file = resumeOffset > 0
        ? fs.createWriteStream(dest, { flags: 'a' })
        : fs.createWriteStream(dest)

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0.1 ? (downloaded - resumeOffset) / elapsed : 0
        onProgress(downloaded, total, speed)
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', (err) => {
        file.destroy()
        file.once('close', () => {
          if (resumeOffset === 0 && !pausingNow.has(gameId)) fs.unlink(dest, () => {})
          reject(err)
        })
      })
      res.on('error', (err) => {
        res.unpipe(file)
        file.destroy()
        file.once('close', () => {
          if (resumeOffset === 0 && !pausingNow.has(gameId)) fs.unlink(dest, () => {})
          reject(err)
        })
      })
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

type FoundResult = { identifier: string; files: string[]; primaryFile: string; size: number }

interface DownloadCallbacks {
  onProgress: ProgressCallback
  onDone: (romPath: string) => void
  onError: (err: Error) => void
}

interface PausedState {
  found: FoundResult
  fileIndex: number
  game: Game
  callbacks: DownloadCallbacks
}

const pausedDownloads = new Map<number, PausedState>()
const pausingNow = new Set<number>()

async function executeDownload(
  game: Game,
  found: FoundResult,
  startFileIndex: number,
  { onProgress, onDone, onError }: DownloadCallbacks,
): Promise<void> {
  const gameDir = path.join(getRomsDir(), String(game.id))
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true })

  const totalFiles = found.files.length
  for (let i = startFileIndex; i < totalFiles; i++) {
    const fileName = path.basename(found.files[i])
    const destPath = path.join(gameDir, fileName)
    const downloadUrl = `https://archive.org/download/${found.identifier}/${encodeURIComponent(found.files[i])}`

    // Resume within a partially downloaded file
    const resumeOffset = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0

    try {
      await downloadFile(
        downloadUrl,
        destPath,
        (downloaded, total, speed) => {
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
        resumeOffset,
      )
    } catch (err) {
      activeRequests.delete(game.id)
      if (pausingNow.has(game.id)) {
        pausingNow.delete(game.id)
        pausedDownloads.set(game.id, { found, fileIndex: i, game, callbacks: { onProgress, onDone, onError } })
        return
      }
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
  }

  activeRequests.delete(game.id)
  const primaryDest = path.join(gameDir, path.basename(found.primaryFile))

  // Patch .cue file to use relative (basename-only) paths for .bin references
  const primaryExt = primaryDest.toLowerCase()
  if (primaryExt.endsWith('.cue')) {
    try {
      const cueContent = fs.readFileSync(primaryDest, 'utf-8')
      const patched = cueContent.replace(/FILE\s+"?([^"\r\n]+)"?\s+BINARY/gi, (_match, filePath: string) => {
        return `FILE "${path.basename(filePath)}" BINARY`
      })
      if (patched !== cueContent) fs.writeFileSync(primaryDest, patched, 'utf-8')
    } catch { /* skip if unreadable */ }
  }

  markAsDownloaded(game.id, primaryDest)
  onDone(primaryDest)
}

export interface StartArchiveDownloadOptions {
  game: Game
  romOption?: RomOption
  onProgress: ProgressCallback
  onDone: (romPath: string) => void
  onError: (err: Error) => void
}

export async function startArchiveDownload({
  game,
  romOption,
  onProgress,
  onDone,
  onError,
}: StartArchiveDownloadOptions): Promise<void> {
  addToLibrary({ ...game, downloading: true, downloaded: false, progress: 0 })

  let found: FoundResult | null = romOption ?? null
  if (!found) {
    try {
      found = await findRomOnArchive(game.title, game.platform)
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
  }

  if (!found) {
    onError(new Error(`No se encontró "${game.title}" para ${game.platform} en Archive.org`))
    return
  }

  await executeDownload(game, found, 0, { onProgress, onDone, onError })
}

export function getActiveDownloadIds(): number[] {
  return [...activeRequests.keys()]
}

export function getPausedDownloadIds(): number[] {
  return [...pausedDownloads.keys()]
}

export function pauseArchiveDownload(gameId: number): boolean {
  if (!activeRequests.has(gameId)) return false
  pausingNow.add(gameId)
  const req = activeRequests.get(gameId)
  if (req) req.destroy()
  return true
}

export async function resumeArchiveDownload(gameId: number): Promise<void> {
  const state = pausedDownloads.get(gameId)
  if (!state) return
  pausedDownloads.delete(gameId)
  await executeDownload(state.game, state.found, state.fileIndex, state.callbacks)
}

export function cancelArchiveDownload(gameId: number): void {
  pausedDownloads.delete(gameId)
  pausingNow.delete(gameId)
  const req = activeRequests.get(gameId)
  if (req) {
    req.destroy()
    activeRequests.delete(gameId)
  }
}
