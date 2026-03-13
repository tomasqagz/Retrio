# Retrio

A retro game launcher built with Electron and React, inspired by Stremio. Discover games via IGDB, manage your library, download ROMs via torrent, and launch them with the right emulator — all from a single interface.

## Features

- **Game discovery** — Search the IGDB database with filters by platform, genre, and sorting options
- **Library management** — Track your games, favorites, playtime, and download status
- **Torrent downloads** — Download ROMs directly via WebTorrent with real-time progress
- **Emulator management** — Install, launch, and remove emulators from within the app
- **Auto-updates** — Automatically checks for new app releases via GitHub
- **Local ROMs** — Add games from local files without IGDB
- **Stats dashboard** — Games count, playtime, favorites, and storage breakdown by platform
- **Internationalization** — Multi-language support via i18next

## Supported Platforms

| Platform | Emulator |
|---|---|
| NES | RetroArch (Nestopia core) |
| SNES | RetroArch (Snes9x core) |
| Sega Genesis | RetroArch (Genesis Plus GX core) |
| Sega Saturn | RetroArch (Mednafen Saturn core) |
| Nintendo 64 | RetroArch (Mupen64plus core) |
| PlayStation 1 | DuckStation |
| PlayStation 2 | PCSX2 |

## Tech Stack

- **Electron 34** — Desktop application framework
- **React 19 + TypeScript** — UI
- **Vite 7** — Build tool
- **better-sqlite3** — Local database for library and cache
- **electron-updater** — Auto-update via GitHub Releases
- **WebTorrent** — BitTorrent-powered ROM downloads
- **i18next** — Internationalization

## Setup

### Requirements

- Node.js 20+
- Windows x64

### Install dependencies

```bash
npm install
```

### Rebuild native module for Electron

```bash
cd node_modules/better-sqlite3 && npx prebuild-install --runtime=electron --target=34.5.8 --arch=x64
```

### IGDB credentials (optional)

Game metadata is powered by the [IGDB API](https://api-docs.igdb.com/). To enable search:

1. Go to [dev.twitch.tv](https://dev.twitch.tv/console) and create an application
2. Copy the **Client ID** and **Client Secret**
3. Enter them in the app's Settings → IGDB section (or during first-run onboarding)

You can also set them via environment variables for development:

```
IGDB_CLIENT_ID=your_client_id
IGDB_CLIENT_SECRET=your_client_secret
```

## Development

```bash
# Start Vite dev server + Electron
npm run dev:electron

# TypeScript type check
npm run typecheck
```

> **Note:** Run from a terminal outside VSCode, or ensure `ELECTRON_RUN_AS_NODE` is not set in your environment. The `npm run dev:electron` script handles this automatically.

## Building

```bash
npm run build        # Compile TypeScript + Vite
npm run dist         # Build + package installer
```

Output is placed in `dist/app/`.

## Releases

Releases are published automatically via GitHub Actions when a version tag is pushed:

```bash
git tag v0.x.x
git push origin v0.x.x
```

The CI pipeline builds the installer and publishes it to GitHub Releases. The app will detect and offer the update on next launch.

## User data

All user data (library, settings, image cache, ROMs, emulators) is stored in `%APPDATA%\Retrio\` and is never affected by updates or reinstalls.

## License

ISC
