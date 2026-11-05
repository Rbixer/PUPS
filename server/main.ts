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

const server = http.createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('X-Frame-Options', 'DENY')
  void api(request, response, () => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)
    const target = path.normalize(path.join(root, pathname))
    if (!target.startsWith(root)) {
      response.statusCode = 400
      response.end()
      return
    }
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      serveFile(target, response)
      return
    }
    serveFile(path.join(root, 'index.html'), response)
  })
})

server.listen(port, host, () => {
  console.log(`PUP'S listo en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
})
