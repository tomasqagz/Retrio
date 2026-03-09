import { execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { app } from 'electron'
import type { Emulator, Platform } from '../shared/types'

// ── Directorio local de emuladores ───────────────────────────────────────────

function getEmulatorsDir(): string {
  const dir = path.join(app.getPath('userData'), 'emulators')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Configuración de emuladores ───────────────────────────────────────────────

interface EmulatorConfig {
  id: string
  name: string
  platforms: Platform[]
  install: { method: 'winget'; id: string } | { method: 'github'; repo: string; assetPattern: RegExp }
  exeName: string
  buildArgs: (romPath: string, platform: Platform, exeDir: string) => string[]
}

const RETROARCH_CORES: Partial<Record<Platform, string>> = {
  NES:            'nestopia_libretro',
  SNES:           'snes9x_libretro',
  'Sega Genesis': 'genesis_plus_gx_libretro',
  N64:            'mupen64plus_next_libretro',
}

const EMULATOR_CONFIGS: EmulatorConfig[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    platforms: ['NES', 'SNES', 'Sega Genesis', 'N64'],
    install: { method: 'winget', id: 'Libretro.RetroArch' },
    exeName: 'retroarch',
    buildArgs: (romPath, platform, exeDir) => {
      const coreName = RETROARCH_CORES[platform]
      if (!coreName) return [romPath]
      return ['-L', path.join(exeDir, 'cores', `${coreName}.dll`), romPath]
    },
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    platforms: ['PS1'],
    install: {
      method: 'github',
      repo: 'stenzek/duckstation',
      assetPattern: /windows.*x64.*\.zip$|x64.*windows.*\.zip$|duckstation.*windows.*\.zip$/i,
    },
    exeName: 'duckstation-qt',
    buildArgs: (romPath) => [romPath],
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    platforms: ['PS2'],
    install: {
      method: 'github',
      repo: 'PCSX2/pcsx2',
      assetPattern: /pcsx2.*windows.*x64-Qt\.7z$/i,
    },
    exeName: 'pcsx2-qt',
    buildArgs: (romPath) => [romPath],
  },
]

// ── Detección de ejecutables ──────────────────────────────────────────────────

function findExe(exeName: string, emuId: string): string | null {
  // 1. Buscar en nuestra carpeta local de emuladores
  const localDir = path.join(getEmulatorsDir(), emuId)
  if (fs.existsSync(localDir)) {
    for (const entry of fs.readdirSync(localDir, { recursive: true }) as string[]) {
      if (!entry.toLowerCase().endsWith('.exe')) continue
      const base = path.basename(entry, '.exe').toLowerCase()
      if (base === exeName.toLowerCase() || base.startsWith(exeName.toLowerCase() + '-')) {
        return path.join(localDir, entry)
      }
    }
  }

  // 2. Buscar en PATH del sistema ampliado con directorios de winget
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files'
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'

  const wingetLinks = path.join(localAppData, 'Microsoft', 'WinGet', 'Links')
  try {
    const result = execSync(`where ${exeName}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, PATH: `${process.env.PATH ?? ''}${path.delimiter}${wingetLinks}` },
    }).trim()
    const first = result.split(/\r?\n/)[0].trim()
    if (first) return first
  } catch {
    // not in PATH
  }

  // 3. Buscar en rutas comunes de instalación y paquetes de winget
  const searchRoots = [
    path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'),
    path.join(programFiles, 'WinGet', 'Packages'),
    path.join(programFiles, 'RetroArch-Win64'),
    path.join(programFilesX86, 'RetroArch'),
    'C:\\RetroArch-Win64',
    'C:\\RetroArch',
  ]
  for (const dir of searchRoots) {
    if (!fs.existsSync(dir)) continue
    try {
      for (const entry of fs.readdirSync(dir, { recursive: true }) as string[]) {
        if (!entry.toLowerCase().endsWith('.exe')) continue
        const base = path.basename(entry, '.exe').toLowerCase()
        if (base === exeName.toLowerCase() || base.startsWith(exeName.toLowerCase() + '-')) {
          return path.join(dir, entry)
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  return null
}

// ── Instalación via winget ────────────────────────────────────────────────────

function installViaWinget(wingetId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'winget',
      ['install', '--id', wingetId, '--accept-source-agreements', '--accept-package-agreements'],
      { shell: true, stdio: 'ignore' },
    )
    proc.on('close', (code) => {
      // Treat 0 as success. Also treat known "soft" codes as success:
      // 0x8A15002B (2316632107) = package already installed / no upgrade applicable
      // 0x8A150014 (2316632084) = no applicable installer found / install blocked (app in use / needs reboot)
      const softCodes = new Set([0, 2316632107, 2316632084])
      if (softCodes.has(code ?? -1)) resolve()
      else reject(new Error(`winget finalizó con código ${code}`))
    })
    proc.on('error', reject)
  })
}

// ── Instalación via GitHub releases ──────────────────────────────────────────

interface GithubAsset { name: string; browser_download_url: string }
interface GithubRelease { assets: GithubAsset[] }

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Retrio/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson<T>(res.headers.location).then(resolve).catch(reject)
        return
      }
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T) } catch (e) { reject(e) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadZip(url: string, dest: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doDownload = (dlUrl: string) => {
      https.get(dlUrl, { headers: { 'User-Agent': 'Retrio/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doDownload(res.headers.location)
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const file = fs.createWriteStream(dest)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          onProgress?.(received, total)
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    doDownload(url)
  })
}

type ArchiveTool = { exe: string; args: (src: string, dest: string) => string[] }

function findArchiveTool(): ArchiveTool | null {
  // 7-Zip
  const sevenZipCandidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ]
  for (const p of sevenZipCandidates) {
    if (fs.existsSync(p)) return { exe: p, args: (src, dest) => ['x', src, `-o${dest}`, '-y'] }
  }
  try {
    const result = execSync('where 7z', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const first = result.split(/\r?\n/)[0].trim()
    if (first) return { exe: first, args: (src, dest) => ['x', src, `-o${dest}`, '-y'] }
  } catch { /* not in PATH */ }

  // WinRAR
  const winRarCandidates = [
    'C:\\Program Files\\WinRAR\\WinRAR.exe',
    'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe',
  ]
  for (const p of winRarCandidates) {
    if (fs.existsSync(p)) return { exe: p, args: (src, dest) => ['x', '-y', src, `${dest}\\`] }
  }
  try {
    const result = execSync('where WinRAR', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const first = result.split(/\r?\n/)[0].trim()
    if (first) return { exe: first, args: (src, dest) => ['x', '-y', src, `${dest}\\`] }
  } catch { /* not in PATH */ }

  return null
}

function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const ext = path.extname(archivePath).toLowerCase()

  if (ext === '.7z') {
    const tool = findArchiveTool()
    if (!tool) {
      return Promise.reject(new Error(
        'Se requiere 7-Zip o WinRAR para extraer este emulador. Instala 7-Zip desde https://www.7-zip.org/',
      ))
    }
    return new Promise((resolve, reject) => {
      const proc = spawn(tool.exe, tool.args(archivePath, destDir), { stdio: 'ignore' })
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Extracción finalizó con código ${code}`))
      })
      proc.on('error', reject)
    })
  }

  // Default: ZIP via PowerShell
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'powershell',
      ['-NoProfile', '-Command',
       `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`],
      { shell: false, stdio: 'ignore' },
    )
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`PowerShell Expand-Archive finalizó con código ${code}`))
    })
    proc.on('error', reject)
  })
}

async function installViaGithub(repo: string, assetPattern: RegExp, emuId: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  const release = await fetchJson<GithubRelease>(
    `https://api.github.com/repos/${repo}/releases/latest`,
  )
  const asset = release.assets.find((a) => assetPattern.test(a.name))
  if (!asset) {
    const available = release.assets.map((a) => a.name).join(', ') || '(sin assets)'
    throw new Error(
      `No se encontró un instalador Windows en ${repo}. Assets disponibles: ${available}`,
    )
  }

  const destDir = path.join(getEmulatorsDir(), emuId)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  const archivePath = path.join(destDir, asset.name)
  await downloadZip(asset.browser_download_url, archivePath, onProgress)
  await extractArchive(archivePath, destDir)
  fs.unlink(archivePath, () => {})
}

// ── API pública ───────────────────────────────────────────────────────────────

export function getEmulatorStatus(): Emulator[] {
  return EMULATOR_CONFIGS.map((cfg) => {
    const exePath = findExe(cfg.exeName, cfg.id)
    return {
      id: cfg.id,
      name: cfg.name,
      platforms: cfg.platforms,
      status: exePath ? ('installed' as const) : ('not_installed' as const),
      version: null,
    }
  })
}

export async function installEmulator(id: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  const cfg = EMULATOR_CONFIGS.find((c) => c.id === id)
  if (!cfg) throw new Error(`Emulador desconocido: ${id}`)

  if (cfg.install.method === 'winget') {
    try {
      await installViaWinget(cfg.install.id)
    } catch (err) {
      // Winget may return a non-zero code even when the package ends up installed
      // (e.g. already installed, update not applicable). If the exe is now findable, treat as success.
      if (!findExe(cfg.exeName, cfg.id)) throw err
      return
    }
    // Even on a "success" code, verify the exe is actually present.
    if (!findExe(cfg.exeName, cfg.id)) {
      throw new Error(`winget reportó éxito pero no se encontró ${cfg.exeName}.exe. Es posible que la instalación requiera reiniciar o que se instaló en una ruta no estándar.`)
    }
  } else {
    await installViaGithub(cfg.install.repo, cfg.install.assetPattern, cfg.id, onProgress)
  }
}

export function launchGame(romPath: string, platform: Platform): void {
  const cfg = EMULATOR_CONFIGS.find((c) => c.platforms.includes(platform))
  if (!cfg) throw new Error(`No hay emulador configurado para: ${platform}`)

  const exePath = findExe(cfg.exeName, cfg.id)
  if (!exePath) throw new Error(`${cfg.name} no está instalado`)

  const stat = fs.statSync(exePath)
  if (!stat.isFile()) {
    throw new Error(`La ruta resuelta es un directorio, no un ejecutable: ${exePath}`)
  }

  const exeDir = path.dirname(exePath)
  const args = cfg.buildArgs(romPath, platform, exeDir)

  console.log('[launchGame] exePath:', exePath)
  console.log('[launchGame] args:', args)
  console.log('[launchGame] cwd:', exeDir)

  const child = spawn(exePath, args, { cwd: exeDir, stdio: 'ignore', detached: true })
  child.unref()
}
