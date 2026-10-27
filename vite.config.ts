import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
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
  plugins: [
    pupsState(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.png', 'login-pattern.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: "PUP'S Pet Shop y Grooming",
        short_name: "PUP'S",
        description: 'Citas, fichas de mascotas, caja y reportes. Funciona sin conexión.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#f6f2ec',
        theme_color: '#1d1c1f',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Nueva cita', short_name: 'Nueva cita', url: '/admin?nueva=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Fichas', short_name: 'Fichas', url: '/admin/fichas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Registrar ingreso', short_name: 'Caja', url: '/admin/ingresos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'WhatsApp', short_name: 'WhatsApp', url: '/admin/whatsapp', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
