import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { createApi } from './server/api'

function pupsApi(): Plugin {
  const handle = createApi()
  return {
    name: 'pups-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => void handle(request, response, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => void handle(request, response, next))
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(),
    pupsApi(),
    react(),
    VitePWA({
      injectRegister: null,
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico,woff2}'],
        globIgnores: ['**/exceljs*', '**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/api\/media\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pups-media',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/.+\.(?:js|woff2)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pups-lazy',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/shop\/.+\.jpg$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'pups-shop', expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [200] } },
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
