import { spawn, exec as execCb, execSync } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const exec = promisify(execCb)
import https from 'https'
import { app } from 'electron'
import type { Emulator, Platform } from '../shared/types'
import { readConfig } from './config'

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
  install:
    | { method: 'winget'; id: string }
    | { method: 'github'; repo: string; assetPattern: RegExp }
    | { method: 'buildbot'; versionRepo: string; urlTemplate: string }
  exeName: string
  buildArgs: (romPath: string, platform: Platform, exeDir: string) => string[]
}

const RETROARCH_CORES: Partial<Record<Platform, string>> = {
  NES:            'nestopia_libretro',
  SNES:           'snes9x_libretro',
  'Sega Genesis': 'genesis_plus_gx_libretro',
  'Sega Saturn':  'mednafen_saturn_libretro',
  N64:            'mupen64plus_next_libretro',
}

const EMULATOR_CONFIGS: EmulatorConfig[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    platforms: ['NES', 'SNES', 'Sega Genesis', 'Sega Saturn', 'N64'],
    install: {
      method: 'buildbot',
      versionRepo: 'libretro/RetroArch',
      urlTemplate: 'https://buildbot.libretro.com/stable/{VERSION}/windows/x86_64/RetroArch.7z',
    },
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
      assetPattern: /duckstation-windows-x64-release\.zip$/i,
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

async function findExe(exeName: string, emuId: string): Promise<string | null> {
  // 1. Buscar en nuestra carpeta local de emuladores
  const localDir = path.join(getEmulatorsDir(), emuId)
  if (fs.existsSync(localDir)) {
    try {
      const entries = await fs.promises.readdir(localDir, { recursive: true }) as string[]
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.exe')) continue
        const base = path.basename(entry, '.exe').toLowerCase()
        if (base === exeName.toLowerCase() || base.startsWith(exeName.toLowerCase() + '-')) {
          return path.join(localDir, entry)
        }
      }
    } catch { /* skip */ }
  }

  // 2. Buscar en PATH del sistema ampliado con directorios de winget
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files'
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  const wingetLinks = path.join(localAppData, 'Microsoft', 'WinGet', 'Links')
  try {
    const { stdout } = await exec(`where ${exeName}`, {
      env: { ...process.env, PATH: `${process.env.PATH ?? ''}${path.delimiter}${wingetLinks}` },
    })
    const first = stdout.trim().split(/\r?\n/)[0].trim()
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
      const entries = await fs.promises.readdir(dir, { recursive: true }) as string[]
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.exe')) continue
        const base = path.basename(entry, '.exe').toLowerCase()
        if (base === exeName.toLowerCase() || base.startsWith(exeName.toLowerCase() + '-')) {
          return path.join(dir, entry)
        }
      }
    } catch { /* skip */ }
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

// ── Instalación via buildbot (RetroArch) ─────────────────────────────────────

async function installViaBuildbot(versionRepo: string, urlTemplate: string, emuId: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  // Get latest version tag from GitHub
  const release = await fetchJson<{ tag_name: string }>(
    `https://api.github.com/repos/${versionRepo}/releases/latest`,
  )
  const version = release.tag_name.replace(/^v/, '')
  const downloadUrl = urlTemplate.replace('{VERSION}', version)
  const fileName = downloadUrl.split('/').pop() ?? 'retroarch.7z'

  const destDir = path.join(getEmulatorsDir(), emuId)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  const archivePath = path.join(destDir, fileName)
  await downloadZip(downloadUrl, archivePath, onProgress)
  await extractArchive(archivePath, destDir)
  fs.unlink(archivePath, () => {})
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function getEmulatorStatus(): Promise<Emulator[]> {
  return Promise.all(EMULATOR_CONFIGS.map(async (cfg) => {
    const exePath = await findExe(cfg.exeName, cfg.id)
    return {
      id: cfg.id,
      name: cfg.name,
      platforms: cfg.platforms,
      status: exePath ? ('installed' as const) : ('not_installed' as const),
      version: null,
    }
  }))
}

export async function installEmulator(id: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  const cfg = EMULATOR_CONFIGS.find((c) => c.id === id)
  if (!cfg) throw new Error(`Emulador desconocido: ${id}`)

  if (cfg.install.method === 'winget') {
    try {
      await installViaWinget(cfg.install.id)
    } catch (err) {
      if (!await findExe(cfg.exeName, cfg.id)) throw err
      return
    }
    if (!await findExe(cfg.exeName, cfg.id)) {
      throw new Error(`winget reportó éxito pero no se encontró ${cfg.exeName}.exe. Es posible que la instalación requiera reiniciar o que se instaló en una ruta no estándar.`)
    }
  } else if (cfg.install.method === 'github') {
    await installViaGithub(cfg.install.repo, cfg.install.assetPattern, cfg.id, onProgress)
  } else {
    await installViaBuildbot(cfg.install.versionRepo, cfg.install.urlTemplate, cfg.id, onProgress)
  }
}

export function deleteEmulator(id: string): void {
  const dir = path.join(getEmulatorsDir(), id)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

export async function openEmulator(id: string): Promise<void> {
  const cfg = EMULATOR_CONFIGS.find((c) => c.id === id)
  if (!cfg) throw new Error(`Emulador desconocido: ${id}`)
  const exePath = await findExe(cfg.exeName, cfg.id)
  if (!exePath) throw new Error(`${cfg.name} no está instalado`)
  const child = spawn(exePath, [], { cwd: path.dirname(exePath), stdio: 'ignore', detached: true })
  child.unref()
}

export async function launchGame(romPath: string, platform: Platform, onExit?: (seconds: number) => void): Promise<void> {
  const config = readConfig()
  const customExePath = config.customEmulatorPaths?.[platform]

  let exePath: string
  let args: string[]

  if (customExePath) {
    if (!fs.existsSync(customExePath)) throw new Error(`Emulador personalizado no encontrado: ${customExePath}`)
    const stat = fs.statSync(customExePath)
    if (!stat.isFile()) throw new Error(`La ruta del emulador personalizado no es un ejecutable: ${customExePath}`)
    exePath = customExePath
    args = [romPath]
  } else {
    const cfg = EMULATOR_CONFIGS.find((c) => c.platforms.includes(platform))
    if (!cfg) throw new Error(`No hay emulador configurado para: ${platform}`)

    const found = await findExe(cfg.exeName, cfg.id)
    if (!found) throw new Error(`${cfg.name} no está instalado`)

    const stat = fs.statSync(found)
    if (!stat.isFile()) {
      return Promise.reject(new Error(`La ruta resuelta es un directorio, no un ejecutable: ${found}`))
    }

    exePath = found
    args = cfg.buildArgs(romPath, platform, path.dirname(found))
  }

  const exeDir = path.dirname(exePath)

  console.log('[launchGame] exePath:', exePath)
  console.log('[launchGame] args:', args)
  console.log('[launchGame] cwd:', exeDir)

  // Verify core file exists (RetroArch -L arg)
  const coreArg = args.indexOf('-L')
  if (coreArg !== -1 && args[coreArg + 1]) {
    const corePath = args[coreArg + 1]
    if (!fs.existsSync(corePath)) {
      return Promise.reject(new Error(`Core de RetroArch no encontrado: ${path.basename(corePath)}. Abre RetroArch y descarga el core manualmente desde Online Updater.`))
    }
  }

  // Sega Saturn requires BIOS files in RetroArch's system/ folder
  if (platform === 'Sega Saturn') {
    const retroarchSystemDir = path.join(path.dirname(exePath), 'system')
    const requiredBios = ['sega_101.bin', 'mpr-17933.bin']
    const missing = requiredBios.filter((f) => !fs.existsSync(path.join(retroarchSystemDir, f)))
    if (missing.length === requiredBios.length) {
      return Promise.reject(new Error(
        `Sega Saturn requiere BIOS (sega_101.bin o mpr-17933.bin) en la carpeta system/ de RetroArch`
      ))
    }
  }

  const child = spawn(exePath, args, {
    cwd: exeDir,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
    windowsHide: false,
  })

  let stderrOutput = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderrOutput += chunk.toString() })

  const sessionStart = Date.now()

  // Resolve after 3 s (process still running → assume OK).
  // Reject immediately if the process exits before that (crash / bad core / bad ROM).
  return new Promise((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.unref()
        // Track play time: fire onExit when the process eventually closes
        if (onExit) {
          child.once('close', () => {
            const seconds = Math.round((Date.now() - sessionStart) / 1000)
            onExit(seconds)
          })
        }
        resolve()
      }
    }, 3000)

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        child.unref()
        if (code !== 0 && code !== null) {
          const detail = stderrOutput.trim().split('\n').pop()?.trim()
          const suffix = detail ? `: ${detail}` : '. Verifica que el core y la ROM sean compatibles.'
          reject(new Error(`${cfg.name} cerró con código ${code}${suffix}`))
        } else {
          resolve()
        }
      }
    })
  })
}
