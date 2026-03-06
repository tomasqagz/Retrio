import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Plugin que agrega rutas /api/igdb/* al dev server de Vite
// Así IGDB funciona en el navegador durante el desarrollo
function igdbDevPlugin() {
  return {
    name: 'igdb-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/igdb', async (req, res) => {
        try {
          require('dotenv').config()
          const { searchGames, getPopularGames, getGameById } = require('./src/main/igdb.js')

          const url = new URL(req.url, 'http://localhost')
          const pathname = url.pathname  // e.g. '/search', '/popular', '/game/123'

          let data

          if (pathname === '/search') {
            const q = url.searchParams.get('q') || ''
            const platform = url.searchParams.get('platform') || null
            data = await searchGames(q, platform)
          } else if (pathname === '/popular') {
            const platform = url.searchParams.get('platform') || null
            data = await getPopularGames(platform)
          } else if (pathname.startsWith('/game/')) {
            const id = parseInt(pathname.replace('/game/', ''), 10)
            data = await getGameById(id)
          } else {
            res.statusCode = 404
            res.end('Not found')
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), igdbDevPlugin()],
  server: {
    port: 5173,
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
})
