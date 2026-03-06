# RETRIO — Launcher de Juegos Retro
> Documento de proyecto — Para usar como contexto en Visual Studio Code con Claude

---

## ¿Qué es Retrio?

Launcher de juegos retro estilo Stremio. El usuario busca un juego, lo descarga via torrent y le da play directamente desde la app, sin configurar nada manualmente. La app instala los emuladores automáticamente y lanza el correcto según la consola detectada.

**El hueco que llena:** ninguna app combina de forma elegante estas tres cosas juntas:
- Buscar y descargar torrents de ROMs
- Instalar emuladores automáticamente
- Lanzar el juego con un solo click

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| **Electron** | v40 | Convierte la app web en app de escritorio instalable (Win/Mac/Linux) |
| **React** | v19 | UI del launcher |
| **TypeScript** | v5 | Tipado estático en todo el proyecto (main + renderer) |
| **Vite** | v7 | Bundler para el renderer — hot reload en desarrollo |
| **tsx** | v4 | Ejecuta TypeScript en el main process de Electron sin compilación previa |
| **WebTorrent** | — | Cliente torrent nativo en Node.js, integrado sin programas externos |
| **SQLite (better-sqlite3)** | — | Base de datos local para la biblioteca de juegos del usuario |
| **IGDB API** | v4 | Metadata automática: portadas, descripciones, géneros, año |
| **dotenv** | — | Variables de entorno para credenciales de IGDB |

### Convenciones de código
- Todo el código en **TypeScript estricto** (`"strict": true`)
- Main process: `.ts` con módulos CommonJS
- Renderer: `.tsx` con módulos ESM (manejado por Vite)
- Tipos compartidos en `src/shared/types.ts`

---

## Consolas Soportadas

| Consola | Emulador | Modo |
|---|---|---|
| NES / SNES | RetroArch | Embebido |
| Sega Genesis / Mega Drive | RetroArch | Embebido |
| PlayStation 1 (PS1) | DuckStation | Embebido |
| PlayStation 2 (PS2) | PCSX2 | Descarga opcional (pesa más) |
| Nintendo 64 | Mupen64Plus / RetroArch | Embebido |

**Estrategia de emuladores:**
- RetroArch embebido cubre el 90% de las consolas (invisible para el usuario)
- Para PS2, ofrecerlo como descarga opcional dentro de la app
- La app detecta la consola por la extensión del archivo y lanza el emulador correcto automáticamente

---

## Fuentes de ROMs / Torrents

| Fuente | Tipo | Seguridad |
|---|---|---|
| **Archive.org** | ROMs retro + abandonware PC | ✅ Segura y verificable |
| **No-Intro** | Base de datos de hashes verificados | ✅ Estándar de preservación |
| **Redump** | Verificación de discos (PS1, PS2) | ✅ Estándar de preservación |

**Seguridad:** la app solo acepta extensiones conocidas (`.iso`, `.bin`, `.rom`, `.cue`, `.chd`) y verifica el hash SHA1 contra bases de datos No-Intro/Redump antes de ejecutar. Esto hace prácticamente imposible que un archivo malicioso pase como ROM.

---

## Juegos de PC

- **Abandonware (Archive.org):** incluir, son juegos viejos sin soporte activo
- **Juegos modernos crackeados:** NO incluir — riesgo legal y de seguridad alto
- Los juegos de PC son ejecutables que corren directo en el sistema, sin la capa protectora de un emulador

---

## Controles

- **Teclado:** funciona en todas las consolas. Muy cómodo en 2D (NES, SNES, Genesis). Funciona pero se siente incómodo en juegos 3D de PS1/PS2.
- **Mouse:** no se usa salvo excepciones muy específicas
- **Joystick/Gamepad:** opcional pero recomendado para PS1/PS2/N64
  - Control Xbox: plug & play en Windows (drivers nativos)
  - Control PS4/PS5: requiere DS4Windows (gratuito)
  - Controles genéricos USB: compatibles

**Feature a implementar:** mapeador de controles visual integrado en la app, con imagen del control de cada consola para asignar botones al teclado o joystick.

---

## Features del Launcher

### Esenciales (MVP)
- [x] Búsqueda de juegos con metadata automática (portadas, descripción) — **IGDB API**
- [ ] Descarga via torrent con WebTorrent
- [ ] Detección automática de consola por extensión de archivo
- [ ] Instalación automática de emuladores (primera vez)
- [ ] Biblioteca personal de juegos descargados — **SQLite**
- [ ] Lanzar juego con un click

### Segunda iteración
- [ ] Filtro por consola / plataforma
- [ ] Mapeador de controles visual
- [ ] Progreso de descarga en tiempo real
- [ ] Verificación de hash contra No-Intro/Redump
- [ ] Configuración por juego (resolución, filtros de imagen)

### Futuro
- [ ] Sección de abandonware PC (Archive.org)
- [ ] Saves en la nube
- [ ] Multijugador online via NetPlay (RetroArch lo soporta)

---

## Estructura de Carpetas

```
retrio/
├── src/
│   ├── main/                  # Proceso principal de Electron (TypeScript)
│   │   ├── index.ts           # Entry point Electron
│   │   ├── igdb.ts            # Servicio IGDB (búsqueda + metadata)
│   │   ├── torrent.ts         # Lógica WebTorrent (próximamente)
│   │   ├── emulators.ts       # Gestión e instalación de emuladores (próximamente)
│   │   └── preload.ts         # Bridge seguro renderer ↔ main
│   ├── renderer/              # React + TypeScript (la UI)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Search.tsx
│   │   │   ├── Library.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── GameCard.tsx
│   │   │   ├── GameDetail.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── DownloadBar.tsx  (próximamente)
│   │   └── styles/
│   └── shared/                # Tipos compartidos main/renderer
│       └── types.ts           # Interfaces: Game, Platform, RetrioAPI, etc.
├── emulators/                 # Emuladores portables (se descargan automáticamente)
├── roms/                      # ROMs descargadas por el usuario
├── tsconfig.json              # Config TypeScript para el renderer
├── tsconfig.node.json         # Config TypeScript para el main process
├── vite.config.ts             # Config Vite (incluye plugin dev para IGDB)
├── electron-builder.json      # Config para generar instalador
├── .env                       # Credenciales IGDB (no versionado)
└── package.json
```

---

## Cómo Arrancar el Proyecto

```bash
# 1. Clonar el repo
git clone https://github.com/tomasqagz/Retrio
cd Retrio

# 2. Instalar dependencias
npm install

# 3. Configurar credenciales IGDB en .env
#    (obtener en dev.twitch.tv/console)
IGDB_CLIENT_ID=tu_client_id
IGDB_CLIENT_SECRET=tu_client_secret

# 4. Correr en desarrollo (solo UI en el browser)
npm run dev

# 5. Correr con Electron completo
npm run dev:electron

# 6. Verificar tipos
npm run typecheck
```

---

## Cómo Probar Durante el Desarrollo

| Etapa | Dónde se prueba |
|---|---|
| UI / diseño visual | Navegador (Chrome) — `npm run dev` |
| IGDB / metadata / portadas | Navegador — el plugin de Vite proxea las llamadas |
| App completa con torrents y emuladores | Electron — `npm run dev:electron` |

---

## Referencias y Links Útiles

- Electron: https://www.electronjs.org
- WebTorrent: https://webtorrent.io
- RetroArch: https://www.retroarch.com
- DuckStation (PS1): https://github.com/stenzek/duckstation
- PCSX2 (PS2): https://pcsx2.net
- IGDB API (metadata): https://www.igdb.com/api
- No-Intro (hashes): https://www.no-intro.org
- Archive.org ROMs: https://archive.org/details/software

---

## Notas Importantes

- Las ROMs de consolas retro están en zona gris legal pero culturalmente aceptadas para consolas discontinuadas
- Usar solo Archive.org y fuentes verificables como fuentes de torrents
- Verificar siempre el hash SHA1 antes de ejecutar cualquier archivo
- No incluir juegos de PC modernos crackeados (riesgo legal y de seguridad)
- El nombre del dominio **retrio.io** podría estar disponible (verificar)
