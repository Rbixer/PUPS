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

/** WhatsApp y Facebook solo leen la imagen de vista previa si la dirección es completa. */
function originOf(request: http.IncomingMessage) {
  const host = request.headers.host ?? ''
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return ''
  const forwarded = request.headers['x-forwarded-proto']
  const proto = process.env.PUPS_TRUST_PROXY === '1' && forwarded === 'https' ? 'https' : 'http'
  return `${proto}://${host.toLowerCase()}`
}

/** Páginas públicas: cada una lleva su título y descripción en el HTML para buscadores y vistas previas. */
const PAGES: Record<string, { title: string; description: string }> = {
  '/': {
    title: "PUP'S · Pet Shop y Grooming",
    description: "PUP'S Pet Shop y Grooming en Guatemala. Grooming, veterinaria y tienda para tu mascota. Reserva tu cita en línea.",
  },
  '/servicios': {
    title: "Servicios · PUP'S",
    description: 'Precios de grooming por tamaño, paquete premium, veterinaria y pet shop en PUP\'S Guatemala.',
  },
  '/reservar': {
    title: "Reservar · PUP'S",
    description: 'Reserva en línea el grooming o la consulta de tu mascota en PUP\'S: eliges servicio, día y hora.',
  },
  '/contacto': {
    title: "Contacto · PUP'S",
    description: "Escríbele a PUP'S Pet Shop y Grooming en Guatemala.",
  },
}

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function pagePath(request: http.IncomingMessage) {
  try {
    const pathname = new URL(request.url ?? '/', 'http://local').pathname
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  } catch {
    return '/'
  }
}

function serveIndex(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = originOf(request)
  const pathname = pagePath(request)
  const page = PAGES[pathname]
  const app = pathname === '/login' || pathname === '/admin' || pathname.startsWith('/admin/')
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('content="/og.jpg"', `content="${origin}/og.jpg"`)
  if (page) {
    const url = attr(`${origin}${pathname}`)
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${attr(page.title)}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${attr(page.description)}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${attr(page.description)}"`)
      .replace('</head>', `  <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`)
  } else {
    html = html.replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>')
  }
  response.statusCode = page || app ? 200 : 404
  response.setHeader('Content-Type', TYPES['.html'])
  response.setHeader('Cache-Control', 'no-cache')
  response.end(html)
}

function serveRobots(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = originOf(request)
  const lines = ['User-agent: *', 'Disallow: /admin', 'Disallow: /login', 'Disallow: /api/', ...(origin ? ['', `Sitemap: ${origin}/sitemap.xml`] : [])]
  response.statusCode = 200
  response.setHeader('Content-Type', TYPES['.txt'])
  response.setHeader('Cache-Control', 'public, max-age=3600')
  response.end(`${lines.join('\n')}\n`)
}

function serveSitemap(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = originOf(request)
  const urls = Object.keys(PAGES).map((page) => `  <url><loc>${attr(`${origin}${page}`)}</loc></url>`)
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/xml; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=3600')
  response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
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
  if (pathname === '/robots.txt') return serveRobots(request, response)
  if (pathname === '/sitemap.xml') return serveSitemap(request, response)
  const target = path.normalize(path.join(root, pathname))
  if (target !== root && !target.startsWith(root + path.sep)) {
    reject(response, 400)
    return
  }
  if (path.basename(target) !== 'index.html' && fs.existsSync(target) && fs.statSync(target).isFile()) {
    serveFile(target, response)
    return
  }
  serveIndex(request, response)
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
