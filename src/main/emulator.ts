import { execSync, spawn } from 'child_process'
import path from 'path'
import type { Emulator, Platform } from '../shared/types'

// ── Configuración de emuladores ───────────────────────────────────────────────

interface EmulatorConfig {
  id: string
  name: string
  platforms: Platform[]
  wingetId: string
  exeName: string
  buildArgs: (romPath: string, platform: Platform, exeDir: string) => string[]
}

const RETROARCH_CORES: Partial<Record<Platform, string>> = {
  NES: 'nestopia_libretro',
  SNES: 'snes9x_libretro',
  'Sega Genesis': 'genesis_plus_gx_libretro',
  N64: 'mupen64plus_next_libretro',
}

const EMULATOR_CONFIGS: EmulatorConfig[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    platforms: ['NES', 'SNES', 'Sega Genesis', 'N64'],
    wingetId: 'Libretro.RetroArch',
    exeName: 'retroarch',
    buildArgs: (romPath, platform, exeDir) => {
      const coreName = RETROARCH_CORES[platform]
      if (!coreName) return [romPath]
      const corePath = path.join(exeDir, 'cores', `${coreName}.dll`)
      return ['-L', corePath, romPath]
    },
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    platforms: ['PS1'],
    wingetId: 'DuckStation.DuckStation',
    exeName: 'duckstation-qt',
    buildArgs: (romPath) => [romPath],
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    platforms: ['PS2'],
    wingetId: 'PCSX2.PCSX2',
    exeName: 'pcsx2-qt',
    buildArgs: (romPath) => [romPath],
  },
]

// ── Detección ─────────────────────────────────────────────────────────────────

function findExe(exeName: string): string | null {
  try {
    const result = execSync(`where ${exeName}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const first = result.split(/\r?\n/)[0].trim()
    return first || null
  } catch {
    return null
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

export function getEmulatorStatus(): Emulator[] {
  return EMULATOR_CONFIGS.map((cfg) => {
    const exePath = findExe(cfg.exeName)
    return {
      id: cfg.id,
      name: cfg.name,
      platforms: cfg.platforms,
      status: exePath ? ('installed' as const) : ('not_installed' as const),
      version: null,
    }
  })
}

export function installEmulator(id: string): Promise<void> {
  const cfg = EMULATOR_CONFIGS.find((c) => c.id === id)
  if (!cfg) return Promise.reject(new Error(`Emulador desconocido: ${id}`))

  return new Promise((resolve, reject) => {
    const proc = spawn(
      'winget',
      ['install', '--id', cfg.wingetId, '--accept-source-agreements', '--accept-package-agreements'],
      { shell: true, stdio: 'ignore' }
    )
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`winget finalizó con código ${code}`))
    })
    proc.on('error', reject)
  })
}

export function launchGame(romPath: string, platform: Platform): void {
  const cfg = EMULATOR_CONFIGS.find((c) => c.platforms.includes(platform))
  if (!cfg) throw new Error(`No hay emulador configurado para: ${platform}`)

  const exePath = findExe(cfg.exeName)
  if (!exePath) throw new Error(`${cfg.name} no está instalado`)

  const exeDir = path.dirname(exePath)
  const args = cfg.buildArgs(romPath, platform, exeDir)

  spawn(exePath, args, { detached: true, stdio: 'ignore' }).unref()
}
