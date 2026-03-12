import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { Game } from '../shared/types'

export function imageCacheDir(): string {
  return path.join(app.getPath('userData'), 'image-cache')
}

export function gameImageDir(gameId: number): string {
  return path.join(imageCacheDir(), String(gameId))
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, buffer)
  } catch {
    // Silently fail — las imágenes son opcionales
  }
}

export function cacheGameImages(game: Game): void {
  const dir = gameImageDir(game.id)
  const tasks: Promise<void>[] = []

  if (game.coverUrl)   tasks.push(downloadImage(game.coverUrl,   path.join(dir, 'cover.jpg')))
  if (game.coverUrlHd) tasks.push(downloadImage(game.coverUrlHd, path.join(dir, 'cover_hd.jpg')))

  if (game.screenshots) {
    for (let i = 0; i < game.screenshots.length; i++) {
      tasks.push(downloadImage(game.screenshots[i], path.join(dir, `screenshot_${i}.jpg`)))
    }
  }

  void Promise.allSettled(tasks)
}

export function localizeGameUrls(game: Game): Game {
  const dir = gameImageDir(game.id)
  const result = { ...game }

  if (game.coverUrl && fs.existsSync(path.join(dir, 'cover.jpg'))) {
    result.coverUrl = `retrio-img://${game.id}/cover.jpg`
  }
  if (game.coverUrlHd && fs.existsSync(path.join(dir, 'cover_hd.jpg'))) {
    result.coverUrlHd = `retrio-img://${game.id}/cover_hd.jpg`
  }
  if (game.screenshots) {
    result.screenshots = game.screenshots.map((url, i) =>
      fs.existsSync(path.join(dir, `screenshot_${i}.jpg`))
        ? `retrio-img://${game.id}/screenshot_${i}.jpg`
        : url
    )
  }

  return result
}

export function clearImageCache(): void {
  const dir = imageCacheDir()
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}
