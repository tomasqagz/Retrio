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
    install: { method: 'winget', id: 'PCSX2.PCSX2' },
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
      // 2316632107 (0x8A15002B) = package already installed / no upgrade applicable
      const softCodes = new Set([0, 2316632107])
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

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'powershell',
      ['-NoProfile', '-Command',
       `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`],
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

  const zipPath = path.join(destDir, asset.name)
  await downloadZip(asset.browser_download_url, zipPath, onProgress)
  await extractZip(zipPath, destDir)
  fs.unlink(zipPath, () => {})
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
