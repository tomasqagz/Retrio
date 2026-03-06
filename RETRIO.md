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

| Tecnología | Rol |
|---|---|
| **Electron** | Convierte la app web en app de escritorio instalable (Win/Mac/Linux) |
| **React** | UI del launcher |
| **WebTorrent** | Cliente torrent nativo en Node.js, integrado sin programas externos |
| **SQLite** | Base de datos local para la biblioteca de juegos del usuario |
| **IGDB API** | Metadata automática: portadas, descripciones, géneros, año |

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
- [ ] Búsqueda de juegos con metadata automática (portadas, descripción)
- [ ] Descarga via torrent con WebTorrent
- [ ] Detección automática de consola por extensión de archivo
- [ ] Instalación automática de emuladores (primera vez)
- [ ] Biblioteca personal de juegos descargados
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

## Estructura de Carpetas Sugerida

```
retrio/
├── public/
├── src/
│   ├── main/                  # Proceso principal de Electron
│   │   ├── index.js           # Entry point Electron
│   │   ├── torrent.js         # Lógica WebTorrent
│   │   ├── emulators.js       # Gestión e instalación de emuladores
│   │   └── database.js        # SQLite - biblioteca de juegos
│   ├── renderer/              # React (la UI)
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx       # Pantalla principal / destacados
│   │   │   ├── Search.jsx     # Búsqueda de juegos
│   │   │   ├── Library.jsx    # Juegos descargados
│   │   │   └── Settings.jsx   # Configuración y emuladores
│   │   └── components/
│   │       ├── GameCard.jsx
│   │       ├── DownloadBar.jsx
│   │       └── ControlMapper.jsx
│   └── shared/                # Código compartido main/renderer
├── emulators/                 # Emuladores portables (se descargan automáticamente)
├── roms/                      # ROMs descargadas por el usuario
├── package.json
└── electron-builder.json      # Config para generar instalador
```

---

## Cómo Arrancar el Proyecto

```bash
# 1. Instalar Node.js desde nodejs.org

# 2. Crear el proyecto
mkdir retrio
cd retrio
npm init -y

# 3. Instalar dependencias principales
npm install electron react react-dom webtorrent better-sqlite3

# 4. Instalar dependencias de desarrollo
npm install --save-dev @electron-forge/cli vite @vitejs/plugin-react electron-builder

# 5. Correr en desarrollo
npm run dev
```

---

## Cómo Probar Durante el Desarrollo

| Etapa | Dónde se prueba |
|---|---|
| UI / diseño visual | Navegador (Chrome) — sin instalar nada |
| App completa con torrents y emuladores | Electron — requiere Node.js instalado |

**Estrategia:** primero construir y aprobar toda la UI en el navegador, luego conectar la lógica real con Electron.

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
