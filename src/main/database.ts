import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import type { Game } from '../shared/types'

// ── Setup ─────────────────────────────────────────────────────────────────────

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const DB_PATH = path.join(app.getPath('userData'), 'retrio.db')
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
  }
  return db
}

// ── Migrations ────────────────────────────────────────────────────────────────

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      platform    TEXT    NOT NULL,
      year        INTEGER,
      cover_url   TEXT,
      cover_url_hd TEXT,
      summary     TEXT,
      rating      INTEGER,
      genres      TEXT,        -- JSON array
      developers  TEXT,        -- JSON array
      downloaded  INTEGER NOT NULL DEFAULT 0,
      downloading INTEGER NOT NULL DEFAULT 0,
      progress    INTEGER NOT NULL DEFAULT 0,
      rom_path    TEXT,
      dl_dismissed INTEGER NOT NULL DEFAULT 0,
      added_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  // Add dl_dismissed column if it doesn't exist (for existing databases)
  try { db.exec(`ALTER TABLE games ADD COLUMN dl_dismissed INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE games ADD COLUMN no_rom INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE games ADD COLUMN play_time INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE games ADD COLUMN last_played_at INTEGER`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE games ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  // Reset any downloads that were in progress when the app was last closed
  db.exec(`DELETE FROM games WHERE downloading = 1 AND downloaded = 0`)
}

// ── Row type (SQLite returns plain objects) ───────────────────────────────────

interface GameRow {
  id: number
  title: string
  platform: string
  year: number | null
  cover_url: string | null
  cover_url_hd: string | null
  summary: string | null
  rating: number | null
  genres: string | null
  developers: string | null
  downloaded: number
  downloading: number
  progress: number
  rom_path: string | null
  dl_dismissed: number
  no_rom: number
  play_time: number
  last_played_at: number | null
  added_at: number
  favorite: number
}

function rowToGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform as Game['platform'],
    year: row.year,
    coverUrl: row.cover_url,
    coverUrlHd: row.cover_url_hd,
    summary: row.summary,
    rating: row.rating,
    genres: row.genres ? (JSON.parse(row.genres) as string[]) : undefined,
    developers: row.developers ? (JSON.parse(row.developers) as string[]) : undefined,
    downloaded: Boolean(row.downloaded),
    downloading: Boolean(row.downloading),
    progress: row.progress,
    romPath: row.rom_path ?? undefined,
    dlDismissed: Boolean(row.dl_dismissed),
    noRom: Boolean(row.no_rom),
    playTime: row.play_time ?? 0,
    lastPlayedAt: row.last_played_at ?? undefined,
    addedAt: row.added_at,
    favorite: Boolean(row.favorite),
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getLibrary(): Game[] {
  const rows = getDb()
    .prepare('SELECT * FROM games ORDER BY added_at DESC')
    .all() as GameRow[]
  return rows.map(rowToGame)
}

export function getGameFromLibrary(id: number): Game | null {
  const row = getDb()
    .prepare('SELECT * FROM games WHERE id = ?')
    .get(id) as GameRow | undefined
  return row ? rowToGame(row) : null
}

export function addToLibrary(game: Game): void {
  getDb()
    .prepare(`
      INSERT INTO games (
        id, title, platform, year, cover_url, cover_url_hd,
        summary, rating, genres, developers, downloaded, downloading, progress, rom_path
      ) VALUES (
        @id, @title, @platform, @year, @coverUrl, @coverUrlHd,
        @summary, @rating, @genres, @developers, @downloaded, @downloading, @progress, @romPath
      )
      ON CONFLICT(id) DO UPDATE SET
        title       = excluded.title,
        platform    = excluded.platform,
        year        = excluded.year,
        cover_url   = excluded.cover_url,
        cover_url_hd= excluded.cover_url_hd,
        summary     = excluded.summary,
        rating      = excluded.rating,
        genres      = excluded.genres,
        developers  = excluded.developers
    `)
    .run({
      id: game.id,
      title: game.title,
      platform: game.platform,
      year: game.year,
      coverUrl: game.coverUrl,
      coverUrlHd: game.coverUrlHd,
      summary: game.summary,
      rating: game.rating,
      genres: game.genres ? JSON.stringify(game.genres) : null,
      developers: game.developers ? JSON.stringify(game.developers) : null,
      downloaded: game.downloaded ? 1 : 0,
      downloading: game.downloading ? 1 : 0,
      progress: game.progress ?? 0,
      romPath: game.romPath ?? null,
    })
}

export function removeFromLibrary(id: number): void {
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id)
}

export function updateDownloadProgress(id: number, progress: number): void {
  getDb()
    .prepare('UPDATE games SET downloading = 1, progress = ? WHERE id = ?')
    .run(Math.round(progress), id)
}

export function markAsDownloaded(id: number, romPath: string): void {
  getDb()
    .prepare('UPDATE games SET downloaded = 1, downloading = 0, progress = 100, rom_path = ? WHERE id = ?')
    .run(romPath, id)
}

export function dismissDownload(id: number): void {
  getDb().prepare('UPDATE games SET dl_dismissed = 1 WHERE id = ?').run(id)
}

export function setNoRom(id: number, value: boolean): void {
  getDb().prepare('UPDATE games SET no_rom = ? WHERE id = ?').run(value ? 1 : 0, id)
}

export function addPlayTime(id: number, seconds: number, startedAt: number): void {
  getDb()
    .prepare('UPDATE games SET play_time = play_time + ?, last_played_at = ? WHERE id = ?')
    .run(seconds, startedAt, id)
}

export function toggleFavorite(id: number): void {
  getDb().prepare('UPDATE games SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id)
}

export function isInLibrary(id: number): boolean {
  const row = getDb()
    .prepare('SELECT id FROM games WHERE id = ?')
    .get(id)
  return row !== undefined
}
