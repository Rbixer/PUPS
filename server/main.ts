import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createApi } from './api'

const root = path.resolve(process.env.PUPS_DIST ?? 'dist')
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '0.0.0.0'
const api = createApi(path.resolve(process.env.PUPS_DATA ?? 'data'))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** Los scripts en línea de index.html se permiten por su huella; cualquier otro script en línea queda bloqueado. */
function inlineHashes() {
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
  } catch {
    return []
  }
}

const POLICY = [
  "default-src 'self'",
  `script-src 'self' ${inlineHashes().join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

function serveFile(file: string, response: http.ServerResponse) {
  const extension = path.extname(file).toLowerCase()
  response.statusCode = 200
  response.setHeader('Content-Type', TYPES[extension] ?? 'application/octet-stream')
  const name = path.basename(file)
  if (file.includes(`${path.sep}assets${path.sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  else if (name === 'sw.js' || name.startsWith('workbox-') || extension === '.html') response.setHeader('Cache-Control', 'no-cache')
  else response.setHeader('Cache-Control', 'public, max-age=3600')
  fs.createReadStream(file).pipe(response)
}

function reject(response: http.ServerResponse, status: number) {
  response.statusCode = status
  response.end()
}

function serveStatic(request: http.IncomingMessage, response: http.ServerResponse) {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)
  } catch {
    reject(response, 400)
    return
  }
  const target = path.normalize(path.join(root, pathname))
  if (target !== root && !target.startsWith(root + path.sep)) {
    reject(response, 400)
    return
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    serveFile(target, response)
    return
  }
  serveFile(path.join(root, 'index.html'), response)
}

const server = http.createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Content-Security-Policy', POLICY)
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()')
  api(request, response, () => serveStatic(request, response)).catch((error: unknown) => {
    console.error('[pups]', error)
    if (!response.headersSent) reject(response, 500)
    else response.destroy()
  })
})

process.on('unhandledRejection', (error) => console.error('[pups] promesa sin atrapar', error))

server.listen(port, host, () => {
  console.log(`PUP'S listo en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
})
