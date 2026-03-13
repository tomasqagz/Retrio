import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function igdbDevPlugin() {
  return {
    name: 'igdb-dev-api',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any) => Promise<void>) => void } }) {
      server.middlewares.use('/api/igdb', async (req: any, res: any) => {
        try {
          require('dotenv').config()
          const { searchGames, getPopularGames, getGameById } = require('./src/main/igdb.ts')

          const url = new URL(req.url as string, 'http://localhost')
          const pathname = url.pathname

          let data: unknown

          if (pathname === '/search') {
            const q = url.searchParams.get('q') ?? ''
            const platform = url.searchParams.get('platform')
            data = await searchGames(q, platform)
          } else if (pathname === '/popular') {
            const platform = url.searchParams.get('platform')
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
          res.end(JSON.stringify({ error: (err as Error).message }))
        }
      })
    },
  }
}

export default defineConfig({
  root: 'src/renderer',
  publicDir: resolve(__dirname, 'public'),
  plugins: [react(), igdbDevPlugin()],
  server: {
    port: 5173,
  },
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
})
