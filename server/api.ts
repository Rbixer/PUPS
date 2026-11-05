import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { allows } from '../src/access'
import { SERVICE_NAMES } from '../src/catalog'
import { isoDate, newId, normalizePhone, PROMO_MAX, safeLink } from '../src/format'
import { nextFolio, placeOrder, withCounters } from '../src/ops'
import { createSeed, DATA_VERSION } from '../src/seed'
import { visibleCatalog } from '../src/shop'
import type { Appointment, AppState, Lead, Movement, Permission, User } from '../src/types'
import { BOOKING_SLOTS, slotPassed, slotTaken, visitMinutes } from '../src/visit'

type Session = { userId: string; expires: number; remember: boolean }
type Auth = { passwords: Record<string, string>; sessions: Record<string, Session> }
type Lock = { count: number; strikes: number; until: number }

const HOUR = 3_600_000
const SESSION_MS = 12 * HOUR
const REMEMBER_MS = 30 * 24 * HOUR
const MAX_TRIES = 5
const PRIVATE_LIMIT = 40 * 1024 * 1024
const PUBLIC_LIMIT = 64 * 1024
const PUBLIC_WINDOW = 10 * 60_000
const PUBLIC_MAX = 20
const KEEP_BACKUPS = 30
const DEMO_PASSWORD = 'pups2026'
const HASH = /^[0-9a-f]{64}$/
const DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/
const MEDIA_NAME = /^[0-9a-f]{32}\.(png|jpg|webp|gif)$/

/** Quién puede cambiar cada colección. Si llega cambiada sin alguno de esos permisos, se conserva lo del servidor. */
const GUARDED: [keyof AppState, Permission[]][] = [
  ['appointments', ['citas', 'fichas', 'caja']],
  ['movements', ['caja', 'compras', 'planilla']],
  ['sales', ['caja']],
  ['products', ['caja', 'compras']],
  ['stockMoves', ['caja', 'compras']],
  ['payrolls', ['planilla']],
  ['payables', ['compras', 'planilla']],
  ['purchases', ['compras']],
  ['suppliers', ['compras']],
  ['fixedCosts', ['compras']],
  ['cashCloses', ['caja']],
  ['tasks', ['tareas']],
  ['conversations', ['whatsapp']],
  ['controlRows', ['equipo']],
  ['leads', ['equipo']],
]

const LISTS = GUARDED.map(([key]) => key)
const COUNTER_JUMP = 1000
const MAX_LINE_QTY = 20
const MAX_DAILY_BOOKINGS = 2
const PRUNE_EVERY = 10 * 60_000

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function hashSecret(password: string) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password.trim(), salt, 64).toString('hex')}`
}

export function verifySecret(stored: string, password: string) {
  const clean = password.trim()
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$')
    if (!salt || !hash) return false
    const expected = Buffer.from(hash, 'hex')
    const derived = scryptSync(clean, Buffer.from(salt, 'hex'), expected.length)
    return timingSafeEqual(derived, expected)
  }
  if (HASH.test(stored)) {
    const legacy = createHash('sha256').update(`pups:${clean}`).digest()
    return timingSafeEqual(legacy, Buffer.from(stored, 'hex'))
  }
  return false
}

let decoyHash = ''

/** Clave de relleno: un usuario inexistente tarda lo mismo en responder que uno real. */
function decoy() {
  if (!decoyHash) decoyHash = hashSecret(randomBytes(16).toString('hex'))
  return decoyHash
}

export function weakSecret(password: string) {
  const clean = password.trim()
  return clean === DEMO_PASSWORD || clean.length < 8
}

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function writeAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temp, data, { mode: 0o600 })
  fs.renameSync(temp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function send(response: ServerResponse, status: number, body?: unknown) {
  response.statusCode = status
  response.setHeader('Cache-Control', 'no-store')
  if (body === undefined) {
    response.end()
    return
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage, limit: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'La información enviada es demasiado grande.'))
        request.destroy()
        return
      }
      chunks.push(Buffer.from(chunk))
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function readJsonBody<T>(request: IncomingMessage, limit: number): Promise<T> {
  const raw = await readBody(request, limit)
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, 'La solicitud no es válida.')
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Detrás de un proxy local (PUPS_TRUST_PROXY=1) la IP real llega en X-Real-IP; sin esa variable no se confía en encabezados. */
function clientIp(request: IncomingMessage) {
  const direct = request.socket.remoteAddress ?? 'desconocido'
  const forwarded = request.headers['x-real-ip']
  const ip = process.env.PUPS_TRUST_PROXY === '1' && LOOPBACK.has(direct) && typeof forwarded === 'string' && forwarded.trim() ? forwarded.trim().slice(0, 64) : direct
  return networkOf(ip)
}

/** Una IPv6 se agrupa por su red /64: rotar la parte final no da intentos nuevos. */
export function networkOf(ip: string) {
  const clean = ip.replace(/^::ffff:/, '')
  if (!clean.includes(':')) return clean
  const [head] = clean.split('::')
  const groups = head.split(':').filter(Boolean)
  if (clean.includes('::') && groups.length < 4) return `${groups.join(':')}::/64`
  return `${clean.split(':').slice(0, 4).join(':')}::/64`
}

function text(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function strip(state: AppState): AppState {
  return { ...state, sessionUserId: null, users: state.users.map(({ password: _password, ...user }) => user as User) }
}

/** Lo que cada usuario puede leer: sin claves y sin planillas, salarios ni compras si su rol no los usa. */
export function viewFor(user: User, state: AppState): AppState {
  const base = strip(state)
  const books = allows(user, 'contabilidad') || allows(user, 'equipo')
  const pay = books || allows(user, 'planilla')
  const buy = books || allows(user, 'compras')
  return {
    ...base,
    users: pay ? base.users : base.users.map(({ salary: _salary, bonus: _bonus, ...item }) => item as User),
    ...(pay ? {} : { payrolls: [] }),
    ...(buy ? {} : { purchases: [], suppliers: [], fixedCosts: [] }),
    ...(buy || pay ? {} : { payables: [] }),
  }
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

type Keyed = { id: string }

function byId<T extends Keyed>(items: T[] | undefined) {
  return new Map((items ?? []).map((item) => [item.id, item]))
}

/** Revisa que cada colección tenga la forma esperada antes de guardarla. */
function validShape(incoming: AppState) {
  if (incoming.version !== DATA_VERSION) return false
  if (!Array.isArray(incoming.users) || !Array.isArray(incoming.appointments) || !Array.isArray(incoming.movements)) return false
  if (!incoming.settings || typeof incoming.settings !== 'object' || Array.isArray(incoming.settings)) return false
  for (const key of [...LISTS, 'users'] as (keyof AppState)[]) {
    const value = incoming[key]
    if (value === undefined) continue
    if (!Array.isArray(value)) return false
    if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) return false
    if (key !== 'controlRows' && value.some((item) => typeof (item as Partial<Keyed>).id !== 'string')) return false
  }
  if (incoming.counters !== undefined) {
    if (!incoming.counters || typeof incoming.counters !== 'object') return false
    if (Object.values(incoming.counters).some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return false
  }
  return true
}

/** Un día con corte de caja queda congelado: sus movimientos cobrados no se agregan, cambian ni borran. */
function lockClosedDays(current: AppState, incoming: Movement[]) {
  const closed = new Set((current.cashCloses ?? []).map((item) => item.date))
  if (closed.size === 0) return incoming
  const frozen = (item: Movement) => closed.has(item.date) && item.method !== 'Pedido'
  const before = byId(current.movements)
  const result = incoming.flatMap((item) => {
    const previous = before.get(item.id)
    if (previous && frozen(previous)) return [previous]
    if (frozen(item)) return previous ? [previous] : []
    return [item]
  })
  const present = new Set(result.map((item) => item.id))
  for (const item of current.movements) if (frozen(item) && !present.has(item.id)) result.push(item)
  return result
}

/** Con solo caja se cambian o quitan cobros de citas y pedidos por cobrar; egresos, compras y planillas quedan como estaban. */
function limitCashier(current: AppState, incoming: Movement[]) {
  const open = (item: Movement) => item.type === 'ingreso' && (item.method === 'Pedido' || item.folio != null)
  const before = byId(current.movements)
  const result = incoming.map((item) => {
    const previous = before.get(item.id)
    return previous && !open(previous) && !same(previous, item) ? previous : item
  })
  const present = new Set(result.map((item) => item.id))
  for (const item of current.movements) if (!open(item) && !present.has(item.id)) result.push(item)
  return result
}

export function createApi(dataDir = path.resolve('data')) {
  const stateFile = path.join(dataDir, 'pups.json')
  const authFile = path.join(dataDir, 'auth.json')
  const mediaDir = path.join(dataDir, 'media')
  const backupDir = path.join(dataDir, 'respaldos')
  const locks = new Map<string, Lock>()
  const publicHits = new Map<string, number[]>()
  let cached: { state: AppState; mtime: number } | null = null

  function loadAuth(): Auth {
    const raw = readJson<Auth>(authFile)
    return { passwords: raw?.passwords ?? {}, sessions: raw?.sessions ?? {} }
  }

  function saveAuth(auth: Auth) {
    const now = Date.now()
    for (const [key, session] of Object.entries(auth.sessions)) if (session.expires < now) delete auth.sessions[key]
    writeAtomic(authFile, JSON.stringify(auth))
  }

  function backup() {
    if (!fs.existsSync(stateFile)) return
    const day = isoDate()
    const target = path.join(backupDir, `pups-${day}.json`)
    if (fs.existsSync(target)) return
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
    fs.copyFileSync(stateFile, target)
    fs.chmodSync(target, 0o600)
    if (fs.existsSync(authFile)) {
      const authCopy = path.join(backupDir, `auth-${day}.json`)
      fs.copyFileSync(authFile, authCopy)
      fs.chmodSync(authCopy, 0o600)
    }
    const old = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith('pups-'))
      .sort()
      .slice(0, -KEEP_BACKUPS)
    for (const name of old) {
      fs.rmSync(path.join(backupDir, name), { force: true })
      fs.rmSync(path.join(backupDir, name.replace('pups-', 'auth-')), { force: true })
    }
  }

  /** Solo se guardan fotos subidas o archivos del propio sitio; una URL externa se descarta. */
  function storeMedia(value: string | undefined) {
    if (!value) return value
    if (!value.startsWith('data:')) return value.startsWith('/') && !value.startsWith('//') ? value : ''
    const match = DATA_URL.exec(value)
    if (!match) return ''
    const buffer = Buffer.from(match[2], 'base64')
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
    const name = `${sha(buffer.toString('base64')).slice(0, 32)}.${extension}`
    const file = path.join(mediaDir, name)
    if (!fs.existsSync(file)) {
      fs.mkdirSync(mediaDir, { recursive: true })
      fs.writeFileSync(file, buffer)
    }
    return `/api/media/${name}`
  }

  /** Las fotos viajan como archivo aparte; el estado solo guarda la ruta. */
  function extractMedia(state: AppState) {
    let changed = false
    const swap = (value: string | undefined) => {
      const next = storeMedia(value)
      if (next !== value) changed = true
      return next
    }
    const appointments = state.appointments.map((item) => {
      const beforePhoto = swap(item.beforePhoto)
      const afterPhoto = swap(item.afterPhoto)
      const photos = item.report?.photos?.map((photo) => swap(photo) ?? '')
      return {
        ...item,
        beforePhoto,
        afterPhoto,
        ...(item.report ? { report: { ...item.report, photos: photos ?? item.report.photos } } : {}),
      }
    })
    const products = state.products?.map((item) => ({ ...item, image: swap(item.image) ?? '' }))
    return { state: { ...state, appointments, products }, changed }
  }

  /** Pasa las claves del archivo de datos al archivo de acceso. Ninguna clave sale del servidor. */
  function migrate(state: AppState) {
    const pending = state.users.filter((user) => typeof user.password === 'string' && user.password)
    if (pending.length === 0) return state
    const auth = loadAuth()
    for (const user of pending) {
      if (auth.passwords[user.id]) continue
      const stored = user.password as string
      auth.passwords[user.id] = HASH.test(stored) || stored.startsWith('scrypt$') ? stored : hashSecret(stored)
    }
    saveAuth(auth)
    return strip(state)
  }

  function readState(): AppState {
    if (fs.existsSync(stateFile)) {
      const mtime = fs.statSync(stateFile).mtimeMs
      if (cached && cached.mtime === mtime) return cached.state
      const parsed = readJson<AppState>(stateFile)
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.appointments)) {
        const clean = migrate(parsed)
        const { state: withMedia, changed } = extractMedia(clean)
        if (clean !== parsed || changed) return writeState({ ...withMedia, revision: (parsed.revision ?? 0) + 1 })
        cached = { state: parsed, mtime }
        return parsed
      }
      fs.copyFileSync(stateFile, `${stateFile}.danado-${Date.now()}`)
    }
    const seed = createSeed()
    return writeState(migrate({ ...seed, revision: 1 }))
  }

  function writeState(state: AppState) {
    backup()
    const ready = { ...state, sessionUserId: null }
    writeAtomic(stateFile, JSON.stringify(ready))
    cached = { state: ready, mtime: fs.statSync(stateFile).mtimeMs }
    return ready
  }

  /** Los consecutivos nunca bajan, aunque se borre un documento o un equipo mande números viejos. */
  function commit(state: AppState, current: AppState) {
    const counters: Record<string, number> = {}
    for (const key of new Set([...Object.keys(state.counters ?? {}), ...Object.keys(current.counters ?? {})])) {
      const saved = current.counters?.[key] ?? 0
      counters[key] = Math.max(saved, Math.min(state.counters?.[key] ?? 0, saved + COUNTER_JUMP))
    }
    return writeState(withCounters({ ...state, counters, revision: (current.revision ?? 0) + 1 }))
  }

  function authenticate(request: IncomingMessage) {
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) return null
    const auth = loadAuth()
    const key = sha(token)
    const session = auth.sessions[key]
    if (!session || session.expires < Date.now()) return null
    const state = readState()
    const user = state.users.find((item) => item.id === session.userId && item.active)
    if (!user) return null
    if (!session.remember && session.expires - Date.now() < SESSION_MS / 2) {
      session.expires = Date.now() + SESSION_MS
      saveAuth(auth)
    }
    return { user, key, state }
  }

  function requireUser(request: IncomingMessage) {
    const found = authenticate(request)
    if (!found) throw new HttpError(401, 'La sesión venció. Vuelve a entrar.')
    return found
  }

  let prunedAt = Date.now()

  /** Los mapas de intentos y solicitudes se limpian solos para no crecer sin fin. */
  function prune(now: number) {
    if (now - prunedAt < PRUNE_EVERY) return
    prunedAt = now
    for (const [ip, hits] of publicHits) if (hits.every((at) => now - at >= PUBLIC_WINDOW)) publicHits.delete(ip)
    for (const [key, lock] of locks) if (lock.until < now - PRUNE_EVERY) locks.delete(key)
  }

  function limitPublic(request: IncomingMessage) {
    const ip = clientIp(request)
    const now = Date.now()
    prune(now)
    const hits = (publicHits.get(ip) ?? []).filter((at) => now - at < PUBLIC_WINDOW)
    if (hits.length >= PUBLIC_MAX) throw new HttpError(429, 'Demasiadas solicitudes. Espera unos minutos.')
    hits.push(now)
    publicHits.set(ip, hits)
  }

  /** Une lo que manda el panel con lo guardado, respetando lo que cada permiso puede cambiar. */
  function guard(user: User, current: AppState, incoming: AppState): AppState {
    if (!validShape(incoming)) throw new HttpError(400, 'Los datos enviados no son válidos.')
    const team = allows(user, 'equipo')
    let users: User[]
    if (team) {
      const auth = loadAuth()
      let adopted = false
      users = incoming.users.map(({ password, ...rest }) => {
        if (typeof password === 'string' && (HASH.test(password) || password.startsWith('scrypt$')) && !auth.passwords[rest.id]) {
          auth.passwords[rest.id] = password
          adopted = true
        }
        return rest as User
      })
      if (adopted) saveAuth(auth)
      if (!users.some((item) => item.active && item.role === 'Administrador' && allows(item, 'equipo'))) {
        throw new HttpError(400, 'Debe quedar un administrador activo con acceso a Equipo.')
      }
    } else {
      const payroll = allows(user, 'planilla')
      users = current.users.map((item) => {
        const next = payroll ? incoming.users.find((candidate) => candidate.id === item.id) : undefined
        if (!next) return item
        return { ...item, commissionRate: next.commissionRate, bonus: next.bonus, hiredAt: next.hiredAt, salary: next.salary }
      })
    }
    const settings = team
      ? { ...current.settings, ...incoming.settings }
      : {
          ...current.settings,
          ...(allows(user, 'whatsapp') ? { whatsapp: incoming.settings?.whatsapp ?? current.settings.whatsapp } : {}),
          ...(allows(user, 'contabilidad') ? { taxRegime: incoming.settings?.taxRegime, taxHistory: incoming.settings?.taxHistory } : {}),
          ...(allows(user, 'caja') ? { cashFloat: incoming.settings?.cashFloat } : {}),
        }
    const merged: AppState = { ...incoming, users, settings, sessionUserId: null }
    for (const [key, permissions] of GUARDED) {
      if (!permissions.some((permission) => allows(user, permission)) && !same(incoming[key], current[key])) {
        ;(merged as Record<string, unknown>)[key] = current[key]
      }
    }
    if (!['compras', 'planilla', 'equipo'].some((permission) => allows(user, permission as Permission))) {
      merged.movements = limitCashier(current, merged.movements)
    }
    merged.movements = lockClosedDays(current, merged.movements)
    if (!allows(user, 'costos')) {
      const before = byId(current.appointments)
      merged.appointments = merged.appointments.map((item) => {
        const previous = before.get(item.id)
        return previous && previous.cost > 0 && item.cost !== previous.cost ? { ...item, cost: previous.cost } : item
      })
    }
    if (!allows(user, 'compras') && merged.products) {
      const before = byId(current.products)
      merged.products = merged.products.map((item) => {
        const previous = before.get(item.id)
        return previous && item.cost !== previous.cost && item.stock === previous.stock ? { ...item, cost: previous.cost } : item
      })
    }
    return merged
  }

  async function login(request: IncomingMessage, response: ServerResponse) {
    const body = await readJsonBody<{ username?: string; password?: string; remember?: boolean }>(request, PUBLIC_LIMIT)
    const username = text(body.username).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    const lockKey = `${username}|${clientIp(request)}`
    const lock = locks.get(lockKey)
    const now = Date.now()
    if (lock && lock.until > now) {
      const wait = Math.ceil((lock.until - now) / 1000)
      send(response, 429, { error: `Demasiados intentos. Espera ${wait} s e inténtalo de nuevo.`, wait })
      return
    }
    const state = readState()
    const auth = loadAuth()
    const user = state.users.find((item) => item.username.toLowerCase() === username && item.active)
    const stored = user ? auth.passwords[user.id] : undefined
    const valid = verifySecret(stored ?? decoy(), password)
    if (!user || !stored || !password || !valid) {
      const next = lock ?? { count: 0, strikes: 0, until: 0 }
      next.count += 1
      if (next.count >= MAX_TRIES) {
        next.strikes += 1
        next.count = 0
        next.until = now + Math.min(15 * 60_000, 60_000 * 2 ** (next.strikes - 1))
      }
      locks.set(lockKey, next)
      send(response, 401, { error: 'Usuario o clave incorrectos.' })
      return
    }
    locks.delete(lockKey)
    if (!stored.startsWith('scrypt$')) auth.passwords[user.id] = hashSecret(password)
    const token = randomBytes(32).toString('base64url')
    const remember = body.remember === true
    auth.sessions[sha(token)] = { userId: user.id, remember, expires: now + (remember ? REMEMBER_MS : SESSION_MS) }
    saveAuth(auth)
    send(response, 200, { token, userId: user.id, weak: weakSecret(password) })
  }

  async function changePassword(request: IncomingMessage, response: ServerResponse) {
    const { user, key } = requireUser(request)
    const body = await readJsonBody<{ userId?: string; password?: string; current?: string }>(request, PUBLIC_LIMIT)
    const userId = text(body.userId, 80)
    const password = typeof body.password === 'string' ? body.password : ''
    const auth = loadAuth()
    if (!allows(user, 'equipo')) {
      if (userId !== user.id) throw new HttpError(403, 'No tienes permiso para cambiar esa clave.')
      const stored = auth.passwords[user.id]
      if (!stored || !verifySecret(stored, typeof body.current === 'string' ? body.current : '')) {
        throw new HttpError(400, 'La clave actual no coincide.')
      }
    }
    if (password.trim().length < 8) throw new HttpError(400, 'La clave debe tener al menos 8 caracteres.')
    if (password.trim() === DEMO_PASSWORD) throw new HttpError(400, 'Elige una clave distinta a la de demostración.')
    auth.passwords[userId] = hashSecret(password)
    for (const [other, session] of Object.entries(auth.sessions)) if (session.userId === userId && other !== key) delete auth.sessions[other]
    saveAuth(auth)
    send(response, 204)
  }

  function publicData() {
    const state = readState()
    const today = isoDate()
    return {
      revision: state.revision ?? 0,
      products: visibleCatalog(state.products).map(({ cost: _cost, minStock: _min, sku: _sku, ...item }) => item),
      settings: {
        whatsapp: state.settings.whatsapp,
        address: state.settings.address,
        hours: state.settings.hours,
        promoText: typeof state.settings.promoText === 'string' ? state.settings.promoText.trim().slice(0, PROMO_MAX) : '',
        promoLink: safeLink(typeof state.settings.promoLink === 'string' ? state.settings.promoLink : ''),
      },
      busy: state.appointments
        .filter((item) => item.status !== 'cancelada' && item.date >= today)
        .map((item) => ({ date: item.date, time: item.time, minutes: visitMinutes(item) })),
    }
  }

  async function book(request: IncomingMessage, response: ServerResponse) {
    limitPublic(request)
    const body = await readJsonBody<Record<string, unknown>>(request, PUBLIC_LIMIT)
    const clientName = text(body.clientName)
    const phone = text(body.phone, 40)
    const petName = text(body.petName)
    const service = text(body.service)
    const date = text(body.date, 10)
    const time = text(body.time, 5)
    if (!clientName || !phone || !petName) throw new HttpError(400, 'Cliente, teléfono y mascota son obligatorios.')
    if (!SERVICE_NAMES.includes(service)) throw new HttpError(400, 'Elige un servicio de la lista.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !BOOKING_SLOTS.includes(time)) throw new HttpError(400, 'Elige fecha y horario.')
    if (slotPassed(date, time)) throw new HttpError(400, 'Ese horario ya pasó. Elige otro.')
    const state = readState()
    if (slotTaken(state.appointments, date, time, service)) throw new HttpError(409, 'Esa hora ya está ocupada. Elige otro horario libre.')
    const sameDay = state.appointments.filter((item) => item.date === date && item.status !== 'cancelada' && item.phone === normalizePhone(phone))
    if (sameDay.length >= MAX_DAILY_BOOKINGS) throw new HttpError(429, 'Ya tienes citas ese día. Escríbenos si necesitas otra.')
    const folio = nextFolio(state)
    const appointment: Appointment = {
      id: newId(),
      folio,
      clientName,
      phone: normalizePhone(phone),
      petName,
      sex: text(body.sex, 20),
      breed: text(body.breed),
      size: text(body.size, 20),
      coat: text(body.coat, 20),
      service,
      date,
      time,
      allergies: text(body.allergies, 500),
      status: 'pendiente',
      cost: 0,
    }
    commit({ ...state, appointments: [appointment, ...state.appointments] }, state)
    send(response, 200, { folio })
  }

  async function order(request: IncomingMessage, response: ServerResponse) {
    limitPublic(request)
    const body = await readJsonBody<{ name?: string; phone?: string; lines?: { id?: unknown; qty?: unknown }[] }>(request, PUBLIC_LIMIT)
    const lines = Array.isArray(body.lines)
      ? body.lines.slice(0, 50).map((line) => ({ id: text(line.id, 80), qty: Number(line.qty) })).filter((line) => line.id && Number.isFinite(line.qty))
      : []
    if (lines.some((line) => !Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_LINE_QTY)) {
      throw new HttpError(400, `Cada producto admite de 1 a ${MAX_LINE_QTY} unidades por pedido.`)
    }
    const state = readState()
    const result = placeOrder(state, { name: text(body.name), phone: text(body.phone, 40), lines })
    if (!result.ok) throw new HttpError(400, result.error)
    commit({ ...state, ...result.patch }, state)
    send(response, 200, result.value)
  }

  async function lead(request: IncomingMessage, response: ServerResponse) {
    limitPublic(request)
    const body = await readJsonBody<Record<string, unknown>>(request, PUBLIC_LIMIT)
    const name = text(body.name)
    const message = text(body.message, 2000)
    if (!name || !message) throw new HttpError(400, 'Nombre y mensaje son obligatorios.')
    const state = readState()
    const next: Lead = { id: newId(), createdAt: new Date().toISOString(), name, phone: text(body.phone, 40), message }
    commit({ ...state, leads: [next, ...state.leads] }, state)
    send(response, 204)
  }

  async function putState(request: IncomingMessage, response: ServerResponse) {
    const { user, state: current } = requireUser(request)
    const body = await readJsonBody<{ base?: number; state?: AppState }>(request, PRIVATE_LIMIT)
    if (!body.state) throw new HttpError(400, 'Faltan los datos.')
    if (body.base !== (current.revision ?? 0)) {
      send(response, 409, { state: viewFor(user, current) })
      return
    }
    const merged = guard(user, current, body.state)
    const { state: withMedia, changed } = extractMedia(merged)
    const saved = commit(withMedia, current)
    const view = viewFor(user, saved)
    const sent = body.state
    const adjusted = changed || [...LISTS, 'users', 'settings'].some((key) => !same(view[key as keyof AppState], key === 'users' ? strip(sent).users : sent[key as keyof AppState]))
    send(response, 200, adjusted ? { revision: saved.revision, state: view } : { revision: saved.revision })
  }

  function media(name: string, response: ServerResponse) {
    if (!MEDIA_NAME.test(name)) {
      send(response, 404)
      return
    }
    const file = path.join(mediaDir, name)
    if (!fs.existsSync(file)) {
      send(response, 404)
      return
    }
    const extension = name.split('.').pop()
    response.statusCode = 200
    response.setHeader('Content-Type', extension === 'jpg' ? 'image/jpeg' : `image/${extension}`)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    fs.createReadStream(file).pipe(response)
  }

  async function route(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://local')
    const method = request.method ?? 'GET'
    const at = url.pathname
    if (at.startsWith('/api/media/') && method === 'GET') return media(at.slice('/api/media/'.length), response)
    if (at === '/api/public' && method === 'GET') return send(response, 200, publicData())
    if (at === '/api/public/booking' && method === 'POST') return book(request, response)
    if (at === '/api/public/order' && method === 'POST') return order(request, response)
    if (at === '/api/public/lead' && method === 'POST') return lead(request, response)
    if (at === '/api/login' && method === 'POST') return login(request, response)
    if (at === '/api/logout' && method === 'POST') {
      const found = authenticate(request)
      if (found) {
        const auth = loadAuth()
        delete auth.sessions[found.key]
        saveAuth(auth)
      }
      return send(response, 204)
    }
    if (at === '/api/password' && method === 'POST') return changePassword(request, response)
    if (at === '/api/state' && method === 'GET') {
      const { user, state } = requireUser(request)
      const since = Number(url.searchParams.get('since'))
      if (url.searchParams.has('since') && since === (state.revision ?? 0)) return send(response, 204)
      return send(response, 200, viewFor(user, state))
    }
    if (at === '/api/state' && method === 'PUT') return putState(request, response)
    send(response, 404, { error: 'No existe.' })
  }

  return async function handle(request: IncomingMessage, response: ServerResponse, next?: () => void) {
    if (!request.url?.startsWith('/api/')) {
      if (next) next()
      else send(response, 404)
      return
    }
    try {
      await route(request, response)
    } catch (error) {
      if (response.headersSent) return
      if (error instanceof HttpError) send(response, error.status, { error: error.message })
      else {
        console.error('[pups-api]', error)
        send(response, 500, { error: 'El servidor no pudo guardar. Inténtalo de nuevo.' })
      }
    }
  }
}
