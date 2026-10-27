import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function pupsState(): Plugin {
  const file = path.resolve('data/pups.json')
  const handle = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = request.url?.split('?')[0]
    if (url !== '/api/state') {
      next()
      return
    }
    if (request.method === 'GET') {
      if (!fs.existsSync(file)) {
        response.statusCode = 204
        response.end()
        return
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(fs.readFileSync(file, 'utf8'))
      return
    }
    if (request.method === 'PUT') {
      const chunks: Buffer[] = []
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        let nextState: { revision?: number }
        try {
          nextState = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { revision?: number }
        } catch {
          response.statusCode = 400
          response.end()
          return
        }
        let current: { revision?: number } | null = null
        if (fs.existsSync(file)) {
          try {
            current = JSON.parse(fs.readFileSync(file, 'utf8')) as { revision?: number }
          } catch {
            current = null
          }
        }
        if (current && (nextState.revision ?? 0) < (current.revision ?? 0)) {
          response.statusCode = 409
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(current))
          return
        }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(nextState))
        response.statusCode = 204
        response.end()
      })
      return
    }
    response.statusCode = 405
    response.end()
  }
  return {
    name: 'pups-state',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), 
    pupsState(),
    react(),
    VitePWA({
      injectRegister: null,
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pups-fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
