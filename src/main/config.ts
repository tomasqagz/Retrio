import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface AppConfig {
  igdbClientId?: string
  igdbClientSecret?: string
  customEmulatorPaths?: Record<string, string>
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(data) as AppConfig
  } catch {
    return {}
  }
}

export function writeConfig(config: Partial<AppConfig>): void {
  const current = readConfig()
  const updated = { ...current, ...config }
  fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), 'utf-8')
}
