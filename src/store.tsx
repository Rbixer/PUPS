import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allows as userAllows } from './access'
import { parseBackup } from './backup'
import { createSeed, DATA_VERSION } from './seed'
import { digits, newId, normalizePhone } from './format'
import * as ops from './ops'
import type { ChargeNote, Op } from './ops'
import type { ShopLine } from './shop'
import type {
  Appointment,
  AppState,
  CashClose,
  CatalogItem,
  ControlField,
  Conversation,
  FixedCost,
  Lead,
  Movement,
  Payable,
  PayrollLine,
  PayrollRun,
  Permission,
  Purchase,
  Sale,
  Settings,
  StockMove,
  Supplier,
  Task,
  TaskStatus,
  User,
  WaMessage,
} from './types'

export type { ChargeNote } from './ops'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

type Mutation = (current: AppState) => AppState | null

type PublicData = {
  revision: number
  products: CatalogItem[]
  settings: Pick<Settings, 'whatsapp' | 'address' | 'hours'>
  busy: { date: string; time: string; minutes: number }[]
}

const DENIED = 'No tienes permiso para esta acción.'
const OFFLINE = 'No hay conexión con el equipo del local. Revisa la red e inténtalo de nuevo.'
const KEY = 'pups-monica-v1'
const SYNC = 'pups-sync'
const TOKEN = 'pups-token'
const PUBLIC = 'pups-public'
const WEAK = 'pups-weak'
const EXPIRED = 'pups-expired'
const POLL_MS = 3000
const PUBLIC_POLL_MS = 20_000

/** Copia ligera para localStorage: las fotos que todavía no subieron pesan y el cupo del navegador es corto. */
function lightweight(state: AppState): AppState {
  const light = (value?: string) => (value?.startsWith('data:') ? '' : value)
  return {
    ...state,
    appointments: state.appointments.map((item) => ({
      ...item,
      beforePhoto: light(item.beforePhoto),
      afterPhoto: light(item.afterPhoto),
      report: item.report ? { ...item.report, photos: item.report.photos?.map((photo) => light(photo) ?? '') } : item.report,
    })),
    products: state.products?.map((item) => ({ ...item, image: light(item.image) ?? '' })),
  }
}

function absorb(remote: AppState, sessionUserId: string | null): AppState {
  const seed = createSeed()
  return {
    ...seed,
    ...remote,
    sessionUserId,
    settings: { ...seed.settings, ...remote.settings },
    conversations: remote.conversations ?? [],
    leads: remote.leads ?? [],
    controlRows: remote.controlRows ?? [],
    products: Array.isArray(remote.products) ? remote.products : seed.products,
  }
}

/** Estado del sitio público: sin datos de clientes, solo catálogo, datos del negocio y horas ocupadas. */
function anonymous(data?: PublicData | null): AppState {
  const seed = createSeed()
  const busy: Appointment[] = (data?.busy ?? []).map((item, index) => ({
    id: `ocupado-${index}`,
    folio: 0,
    petName: '',
    date: item.date,
    time: item.time,
    status: 'pendiente',
    clientName: '',
    phone: '',
    sex: '',
    breed: '',
    service: item.minutes >= 90 ? 'Premium' : item.minutes <= 30 ? 'Consulta veterinaria' : 'Baño y corte',
    size: '',
    coat: '',
    allergies: '',
    cost: 0,
  }))
  return {
    ...seed,
    users: [],
    appointments: busy,
    movements: [],
    leads: [],
    conversations: [],
    controlRows: [],
    sales: [],
    stockMoves: [],
    suppliers: [],
    purchases: [],
    payables: [],
    fixedCosts: [],
    payrolls: [],
    tasks: [],
    cashCloses: [],
    products: data?.products ?? seed.products,
    settings: { ...seed.settings, ...(data?.settings ?? {}) },
    sessionUserId: null,
    revision: data?.revision ?? 0,
  }
}

/** Une lo hecho sin conexión con lo que el servidor guardó mientras tanto: suma los registros nuevos de este equipo. */
export function mergeOffline(remote: AppState, local: AppState): AppState {
  const keys = ['appointments', 'movements', 'leads', 'conversations', 'sales', 'stockMoves', 'suppliers', 'purchases', 'payables', 'fixedCosts', 'payrolls', 'tasks', 'cashCloses'] as const
  const merged: AppState = { ...remote }
  for (const key of keys) {
    const theirs = (remote[key] ?? []) as { id: string }[]
    const mine = (local[key] ?? []) as { id: string }[]
    const known = new Set(theirs.map((item) => item.id))
    const added = mine.filter((item) => !known.has(item.id))
    if (added.length) (merged as Record<string, unknown>)[key] = [...added, ...theirs]
  }
  const used = new Set(remote.movements.map((item) => item.document))
  const renumbered: Movement[] = []
  for (const item of merged.movements) {
    if (remote.movements.some((theirs) => theirs.id === item.id) || !used.has(item.document)) {
      used.add(item.document)
      renumbered.push(item)
      continue
    }
    const document = ops.nextDocument({ ...merged, movements: [...renumbered, ...merged.movements] }, item.type)
    used.add(document)
    renumbered.push({ ...item, document })
  }
  return { ...merged, movements: renumbered }
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function readSession(): { token: string; userId: string } | null {
  const found = readJson<{ token: string; userId: string }>(sessionStorage, TOKEN) ?? readJson<{ token: string; userId: string }>(localStorage, TOKEN)
  return found && typeof found.token === 'string' && typeof found.userId === 'string' ? found : null
}

function saveSession(session: { token: string; userId: string }, remember: boolean) {
  sessionStorage.setItem(TOKEN, JSON.stringify(session))
  if (remember) localStorage.setItem(TOKEN, JSON.stringify(session))
  else localStorage.removeItem(TOKEN)
}

function clearSession() {
  sessionStorage.removeItem(TOKEN)
  sessionStorage.removeItem(WEAK)
  localStorage.removeItem(TOKEN)
}

function readCache(): AppState | null {
  const parsed = readJson<AppState>(localStorage, KEY)
  if (!parsed || parsed.version !== DATA_VERSION || !Array.isArray(parsed.users) || !Array.isArray(parsed.appointments)) return null
  return absorb(parsed, null)
}

function readSync() {
  return readJson<{ base: number; dirty: boolean }>(localStorage, SYNC) ?? { base: 0, dirty: false }
}

function persist(payload: AppState, sync: { base: number; dirty: boolean }) {
  try {
    localStorage.setItem(SYNC, JSON.stringify(sync))
    localStorage.setItem(KEY, JSON.stringify(lightweight({ ...payload, sessionUserId: null })))
  } catch {
    /* Sin cupo en el navegador: el servidor del local sigue siendo la copia principal. */
  }
}

function clearCache() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(SYNC)
}

function outgoing(state: AppState): AppState {
  return { ...state, sessionUserId: null, users: state.users.map(({ password: _password, ...user }) => user as User) }
}

type Store = {
  state: AppState
  currentUser: User | null
  isAdmin: boolean
  /** Hay sesión guardada y los datos del servidor todavía vienen en camino. */
  booting: boolean
  /** Hay cambios de este equipo que todavía no llegan al servidor. */
  unsynced: boolean
  /** Aviso cuando otro equipo cambió lo mismo y un cambio de aquí no se pudo aplicar. */
  syncNotice: string
  dismissSyncNotice: () => void
  weakPassword: boolean
  allows: (permission: Permission) => boolean
  login: (username: string, password: string, remember?: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
  changeOwnPassword: (current: string, next: string) => Promise<string | null>
  bookAppointment: (input: Omit<Appointment, 'id' | 'folio' | 'status' | 'cost'>) => Promise<{ ok: true; folio: number } | { ok: false; error: string }>
  placeShopOrder: (input: { name: string; phone: string; lines: ShopLine[] }) => Promise<{ ok: true; document: string; total: number } | { ok: false; error: string }>
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => Promise<string | null>
  addAppointment: (appointment: Omit<Appointment, 'id' | 'folio'>, method?: string) => Result<Appointment>
  updateAppointment: (id: string, patch: Partial<Appointment>, method?: string) => Result<ChargeNote | null>
  setVisitPhoto: (id: string, slot: 'antes' | 'despues', data: string) => boolean
  addUser: (user: Omit<User, 'id' | 'active' | 'password'> & { password: string }) => Promise<string | null>
  updateUser: (
    id: string,
    patch: {
      name: string
      lastName?: string
      phone?: string
      email?: string
      salary?: number
      username: string
      role: User['role']
      permissions: Permission[]
      password?: string
    },
  ) => Promise<string | null>
  setControl: (year: number, month: number, field: ControlField, value: number) => void
  toggleUser: (id: string) => string | null
  addMovement: (movement: Omit<Movement, 'id' | 'document'> & { document?: string }) => Result<Movement>
  saveProduct: (product: CatalogItem) => string | null
  recordSale: (input: Omit<ops.SaleInput, 'userId'>) => Result<Sale>
  settleOrder: (movementId: string, method: string) => Result<Movement>
  voidSale: (saleId: string, reason: string) => Result<Sale>
  adjustStock: (input: { productId: string; qty: number; kind: 'ajuste' | 'consumo'; note: string }) => Result<StockMove>
  saveSupplier: (supplier: Supplier) => Result<Supplier>
  recordPurchase: (input: ops.PurchaseInput) => Result<Purchase>
  savePayable: (input: Parameters<typeof ops.savePayable>[1]) => Result<Payable>
  payPayable: (input: { payableId: string; amount: number; method: string; date: string }) => Result<Movement>
  saveFixedCost: (item: FixedCost) => Result<FixedCost>
  payFixedCost: (input: { fixedId: string; period: string; amount: number; method: string; date: string; withTax?: boolean }) => Result<Movement>
  updateWorker: (id: string, patch: Pick<User, 'commissionRate' | 'bonus' | 'hiredAt' | 'salary'>) => Result<User>
  payPayroll: (input: { period: string; lines: PayrollLine[]; method: string; date: string }) => Result<PayrollRun>
  voidPayroll: (id: string) => Result<null>
  saveTask: (task: Omit<Task, 'createdAt'> & { createdAt?: string }) => Result<Task>
  setTaskStatus: (id: string, status: TaskStatus) => Result<Task>
  removeTask: (id: string) => Result<null>
  closeCash: (input: { date: string; opening: number; counted: number; note: string }) => Result<CashClose>
  setTaxRegime: (regime: Settings['taxRegime']) => void
  updateSettings: (patch: Partial<Settings>) => void
  ensureThread: (phone: string, name: string, petName: string) => string | null
  sendMessage: (conversationId: string, body: string) => void
  markRead: (conversationId: string) => void
  resetDemo: () => void
  exportBackup: () => string | null
  importBackup: (raw: string) => string | null
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const bootSession = useRef(readSession())
  /** Copia de este equipo con cambios sin subir; se une una sola vez al llegar los datos del servidor. */
  const restoreRef = useRef(bootSession.current ? readCache() : null)
  const [state, setState] = useState<AppState>(() => {
    const session = bootSession.current
    const cached = restoreRef.current
    if (session) return { ...(cached ?? anonymous(null)), users: cached?.users ?? [], sessionUserId: session.userId }
    return anonymous(readJson<PublicData>(localStorage, PUBLIC))
  })
  const [unsynced, setUnsynced] = useState(false)
  const [booting, setBooting] = useState(() => Boolean(bootSession.current && !restoreRef.current))
  const [syncNotice, setSyncNotice] = useState('')
  const [weakPassword, setWeakPassword] = useState(() => sessionStorage.getItem(WEAK) === '1')
  const latest = useRef(state)
  const server = useRef<AppState | null>(null)
  const pending = useRef<Mutation[]>([])
  const token = useRef<string | null>(bootSession.current?.token ?? null)
  const pushing = useRef(false)
  const pushTimer = useRef<number | null>(null)
  const engine = useRef<{ push: () => void; loadPrivate: () => Promise<boolean>; loadPublic: () => Promise<void>; expire: () => void } | null>(null)

  function show(next: AppState) {
    latest.current = next
    setState(next)
    setUnsynced(pending.current.length > 0)
    if (token.current) {
      const base = server.current?.revision ?? readSync().base
      persist(next, { base, dirty: pending.current.length > 0 || (!server.current && readSync().dirty) })
    }
  }

  function request(method: string, url: string, body?: unknown) {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token.current) headers.authorization = `Bearer ${token.current}`
    return fetch(url, { method, cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  /** Vuelve a aplicar los cambios pendientes sobre la copia del servidor. Los que ya no caben se descartan con aviso. */
  function rebase() {
    if (!server.current) return
    let next = absorb(server.current, latest.current.sessionUserId)
    const kept: Mutation[] = []
    let dropped = 0
    for (const mutation of pending.current) {
      const applied = mutation(next)
      if (applied) {
        next = applied
        kept.push(mutation)
      } else dropped += 1
    }
    pending.current = kept
    if (dropped) setSyncNotice('Otro equipo cambió los mismos datos al mismo tiempo. Un cambio de este equipo no se pudo aplicar; revisa el registro y vuelve a hacerlo si hace falta.')
    show(next)
  }

  function schedulePush(delay = 150) {
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = null
      engine.current?.push()
    }, delay)
  }

  function commit(mutation: Mutation) {
    const next = mutation(latest.current)
    if (!next) return false
    pending.current.push(mutation)
    show(next)
    schedulePush()
    return true
  }

  engine.current = {
    async push() {
      if (pushing.current || !token.current || pending.current.length === 0) return
      if (!server.current) {
        if (navigator.onLine) await engine.current?.loadPrivate()
        return
      }
      if (!navigator.onLine) return
      pushing.current = true
      const sent = pending.current.length
      const payload = outgoing(latest.current)
      let retry = 0
      try {
        const response = await request('PUT', '/api/state', { base: server.current.revision ?? 0, state: payload })
        if (response.status === 200) {
          const body = (await response.json()) as { revision: number; state?: AppState }
          server.current = body.state ?? { ...payload, revision: body.revision }
          pending.current = pending.current.slice(sent)
          rebase()
        } else if (response.status === 409) {
          const body = (await response.json()) as { state: AppState }
          server.current = body.state
          rebase()
          retry = 50
        } else if (response.status === 401) {
          engine.current?.expire()
        } else {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          pending.current = []
          setSyncNotice(body.error ?? 'El servidor no aceptó el último cambio.')
          rebase()
        }
      } catch {
        retry = 4000
      } finally {
        pushing.current = false
        if (pending.current.length > 0 && retry) schedulePush(retry)
        else if (pending.current.length > 0) schedulePush()
      }
    },
    async loadPrivate() {
      try {
        const response = await request('GET', '/api/state')
        if (response.status === 401) {
          engine.current?.expire()
          return false
        }
        if (!response.ok) return false
        const remote = (await response.json()) as AppState
        const sync = readSync()
        server.current = remote
        const cached = restoreRef.current
        restoreRef.current = null
        if (cached && sync.dirty) {
          const same = (remote.revision ?? 0) === sync.base
          pending.current = [same ? () => ({ ...cached, revision: remote.revision }) : (current) => mergeOffline(current, cached), ...pending.current]
        }
        rebase()
        if (pending.current.length > 0) schedulePush()
        return true
      } catch {
        return false
      }
    },
    async loadPublic() {
      try {
        const response = await fetch('/api/public', { cache: 'no-store' })
        if (!response.ok) return
        const data = (await response.json()) as PublicData
        localStorage.setItem(PUBLIC, JSON.stringify(data))
        if (!token.current) show(anonymous(data))
      } catch {
        /* Sin conexión el sitio sigue con la última copia del catálogo. */
      }
    },
    expire() {
      const dirty = pending.current.length > 0
      clearSession()
      token.current = null
      server.current = null
      pending.current = []
      if (!dirty) clearCache()
      sessionStorage.setItem(EXPIRED, '1')
      setWeakPassword(false)
      show(anonymous(readJson<PublicData>(localStorage, PUBLIC)))
      void engine.current?.loadPublic()
    },
  }

  useEffect(() => {
    if (token.current) void engine.current?.loadPrivate().finally(() => setBooting(false))
    else void engine.current?.loadPublic()

    const poll = async () => {
      if (!token.current || pushing.current || pending.current.length > 0 || document.hidden || !navigator.onLine) return
      if (!server.current) {
        await engine.current?.loadPrivate()
        return
      }
      try {
        const response = await request('GET', `/api/state?since=${server.current.revision ?? 0}`)
        if (response.status === 204) return
        if (response.status === 401) {
          engine.current?.expire()
          return
        }
        if (!response.ok || pushing.current || pending.current.length > 0) return
        server.current = (await response.json()) as AppState
        rebase()
      } catch {
        /* Sin red: se reintenta en el siguiente ciclo. */
      }
    }
    const timer = window.setInterval(() => void poll(), POLL_MS)
    const publicTimer = window.setInterval(() => {
      if (!token.current && !document.hidden) void engine.current?.loadPublic()
    }, PUBLIC_POLL_MS)
    const wake = () => {
      if (document.hidden) return
      if (token.current) void poll()
      else void engine.current?.loadPublic()
    }
    const online = () => {
      engine.current?.push()
      wake()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', online)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(publicTimer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', online)
    }
  }, [])

  const api = useMemo<Store>(() => {
    const currentUser = state.users.find((user) => user.id === state.sessionUserId && user.active) ?? null
    const can = (permission: Permission) => userAllows(currentUser, permission)

    /** Aplica una operación al instante y la deja en cola; si otro equipo guardó antes, se repite sobre su versión. */
    function run<T>(permission: Permission | null, op: (current: AppState) => Op<T>): Result<T> {
      if (permission && !can(permission)) return { ok: false, error: DENIED }
      if (!currentUser) return { ok: false, error: 'Vuelve a entrar al panel.' }
      const result = op(latest.current)
      if (!result.ok) return result
      commit((current) => {
        const again = current === latest.current ? result : op(current)
        return again.ok ? ops.withCounters({ ...current, ...again.patch }) : null
      })
      return { ok: true, value: result.value }
    }

    async function setPassword(userId: string, password: string, current?: string) {
      try {
        const response = await request('POST', '/api/password', { userId, password, current })
        if (response.ok) return null
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        return body.error ?? 'No se pudo guardar la clave.'
      } catch {
        return OFFLINE
      }
    }

    async function postPublic<T>(url: string, body: unknown): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
      try {
        const response = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const data = (await response.json().catch(() => ({}))) as T & { error?: string }
        if (!response.ok) return { ok: false, error: data.error ?? 'No se pudo enviar. Inténtalo de nuevo.' }
        void engine.current?.loadPublic()
        return { ok: true, value: data }
      } catch {
        return { ok: false, error: 'No se pudo enviar. Revisa la conexión e inténtalo de nuevo.' }
      }
    }

    function teamCheck(users: User[]) {
      return users.some((item) => item.active && item.role === 'Administrador' && userAllows(item, 'equipo'))
    }

    return {
      state,
      currentUser,
      isAdmin: currentUser?.role === 'Administrador',
      booting,
      unsynced,
      syncNotice,
      dismissSyncNotice: () => setSyncNotice(''),
      weakPassword,
      allows: can,
      login: async (username, password, remember = false) => {
        let response: Response
        try {
          response = await fetch('/api/login', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username, password, remember }),
          })
        } catch {
          return { ok: false, error: OFFLINE }
        }
        const body = (await response.json().catch(() => ({}))) as { token?: string; userId?: string; weak?: boolean; error?: string }
        if (!response.ok || !body.token || !body.userId) return { ok: false, error: body.error ?? 'Usuario o clave incorrectos.' }
        saveSession({ token: body.token, userId: body.userId }, remember)
        sessionStorage.removeItem(EXPIRED)
        if (body.weak) sessionStorage.setItem(WEAK, '1')
        else sessionStorage.removeItem(WEAK)
        setWeakPassword(Boolean(body.weak))
        token.current = body.token
        server.current = null
        latest.current = { ...latest.current, sessionUserId: body.userId }
        restoreRef.current = readSync().dirty ? readCache() : null
        const loaded = await engine.current?.loadPrivate()
        if (!loaded) {
          clearSession()
          token.current = null
          return { ok: false, error: OFFLINE }
        }
        return { ok: true }
      },
      logout: () => {
        const old = token.current
        const dirty = pending.current.length > 0
        if (old) void fetch('/api/logout', { method: 'POST', headers: { authorization: `Bearer ${old}` }, keepalive: true }).catch(() => undefined)
        clearSession()
        token.current = null
        server.current = null
        pending.current = []
        if (!dirty) clearCache()
        setWeakPassword(false)
        show(anonymous(readJson<PublicData>(localStorage, PUBLIC)))
        void engine.current?.loadPublic()
      },
      changeOwnPassword: async (current, next) => {
        if (!currentUser) return 'Vuelve a entrar al panel.'
        const problem = await setPassword(currentUser.id, next, current)
        if (!problem) {
          sessionStorage.removeItem(WEAK)
          setWeakPassword(false)
        }
        return problem
      },
      bookAppointment: async (input) => {
        const result = await postPublic<{ folio: number }>('/api/public/booking', input)
        return result.ok ? { ok: true, folio: result.value.folio } : result
      },
      placeShopOrder: async (input) => {
        const result = await postPublic<{ document: string; total: number }>('/api/public/order', input)
        return result.ok ? { ok: true, document: result.value.document, total: result.value.total } : result
      },
      addLead: async (lead) => {
        const result = await postPublic('/api/public/lead', lead)
        return result.ok ? null : result.error
      },
      addAppointment: (appointment, method) =>
        run('citas', (current) => {
          const employeeCode = (appointment.employeeCode || currentUser?.employeeCode || '').trim()
          const next: Appointment = {
            ...appointment,
            id: newId(),
            folio: ops.nextFolio(current),
            phone: normalizePhone(appointment.phone),
            employeeCode: employeeCode || undefined,
            employeeId: employeeCode ? current.users.find((item) => item.employeeCode === employeeCode)?.id : undefined,
          }
          const charged = ops.chargeAppointment({ ...current, appointments: [next, ...current.appointments] }, next, method, can('caja'))
          if (!charged.ok) return charged
          return { ok: true, value: next, patch: { ...charged.patch, appointments: [next, ...current.appointments] } }
        }),
      updateAppointment: (id, patch, method) =>
        run('citas', (current) => {
          const previous = current.appointments.find((item) => item.id === id)
          if (!previous) return { ok: false, error: 'Esa cita ya no existe.' }
          const nextPatch = { ...patch }
          if (nextPatch.cost !== undefined && nextPatch.cost !== previous.cost && !can('costos')) nextPatch.cost = previous.cost
          if (nextPatch.employeeCode !== undefined) {
            const employeeCode = nextPatch.employeeCode.trim()
            nextPatch.employeeCode = employeeCode || undefined
            nextPatch.employeeId = employeeCode ? current.users.find((item) => item.employeeCode === employeeCode)?.id : undefined
          }
          const next: Appointment = {
            ...previous,
            ...nextPatch,
            id: previous.id,
            folio: previous.folio,
            phone: nextPatch.phone !== undefined ? normalizePhone(nextPatch.phone) : previous.phone,
          }
          const charged = ops.chargeAppointment(current, next, method, can('caja'))
          if (!charged.ok) return charged
          return {
            ok: true,
            value: charged.value,
            patch: { ...charged.patch, appointments: current.appointments.map((item) => (item.id === id ? next : item)) },
          }
        }),
      setVisitPhoto: (id, slot, data) =>
        run('fichas', (current) => {
          const previous = current.appointments.find((item) => item.id === id)
          if (!previous) return { ok: false, error: 'Esa cita ya no existe.' }
          const index = slot === 'antes' ? 0 : 2
          let report = previous.report
          if (report) {
            const photos = ['', '', '']
            report.photos?.forEach((photo, photoIndex) => {
              if (photoIndex < 3) photos[photoIndex] = photo
            })
            photos[index] = data
            report = { ...report, photos }
          }
          const next: Appointment = { ...previous, ...(slot === 'antes' ? { beforePhoto: data } : { afterPhoto: data }), ...(report ? { report } : {}) }
          return { ok: true, value: null, patch: { appointments: current.appointments.map((item) => (item.id === id ? next : item)) } }
        }).ok,
      addUser: async (user) => {
        if (!can('equipo')) return 'No tienes permiso para gestionar el equipo.'
        const { password, ...rest } = user
        const username = rest.username.trim()
        const name = rest.name.trim()
        if (!name || !username || !password.trim()) return 'Completa nombre, usuario y clave.'
        if (password.trim().length < 8) return 'La clave debe tener al menos 8 caracteres.'
        const id = newId()
        const result = run('equipo', (current) => {
          if (current.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) return { ok: false, error: 'Ese usuario ya existe.' }
          const next: User = { ...rest, id, name, username, active: true }
          return { ok: true, value: next, patch: { users: [...current.users, next] } }
        })
        if (!result.ok) return result.error
        return setPassword(id, password)
      },
      updateUser: async (id, patch) => {
        if (!can('equipo')) return 'No tienes permiso para gestionar el equipo.'
        const name = patch.name.trim()
        const username = patch.username.trim()
        if (!name || !username) return 'Completa nombre y usuario.'
        if (patch.password?.trim() && patch.password.trim().length < 8) return 'La clave debe tener al menos 8 caracteres.'
        const result = run('equipo', (current) => {
          const target = current.users.find((item) => item.id === id)
          if (!target) return { ok: false, error: 'Usuario no encontrado.' }
          if (current.users.some((item) => item.id !== id && item.username.toLowerCase() === username.toLowerCase())) return { ok: false, error: 'Ese usuario ya existe.' }
          const next: User = {
            ...target,
            name,
            lastName: patch.lastName !== undefined ? patch.lastName.trim() : target.lastName,
            phone: patch.phone !== undefined ? patch.phone.trim() : target.phone,
            email: patch.email !== undefined ? patch.email.trim() : target.email,
            salary: patch.salary !== undefined ? patch.salary : target.salary,
            username,
            role: patch.role,
            permissions: patch.permissions,
          }
          const users = current.users.map((item) => (item.id === id ? next : item))
          if (!teamCheck(users)) return { ok: false, error: 'Debe quedar un administrador activo con acceso a Equipo.' }
          return { ok: true, value: next, patch: { users } }
        })
        if (!result.ok) return result.error
        return patch.password?.trim() ? setPassword(id, patch.password) : null
      },
      setControl: (year, month, field, value) => {
        run('equipo', (current) => {
          const amount = Number.isFinite(value) ? value : 0
          const rows = current.controlRows ?? []
          const index = rows.findIndex((item) => item.year === year && item.month === month)
          const previous = index >= 0 ? rows[index] : { year, month, values: {} }
          const nextRow = { ...previous, values: { ...previous.values, [field]: amount } }
          const controlRows = index >= 0 ? rows.map((item, itemIndex) => (itemIndex === index ? nextRow : item)) : [...rows, nextRow]
          return { ok: true, value: null, patch: { controlRows } }
        })
      },
      toggleUser: (id) => {
        if (id === state.sessionUserId) return 'No puedes desactivar la sesión actual.'
        const result = run('equipo', (current) => {
          if (!current.users.some((item) => item.id === id)) return { ok: false, error: 'Usuario no encontrado.' }
          const users = current.users.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
          if (!teamCheck(users)) return { ok: false, error: 'Debe quedar un administrador activo con acceso a Equipo.' }
          return { ok: true, value: null, patch: { users } }
        })
        return result.ok ? null : result.error
      },
      addMovement: (movement) =>
        run('caja', (current) => {
          const concept = movement.concept.trim()
          if (!concept || !Number.isFinite(movement.amount) || movement.amount <= 0) return { ok: false, error: 'Concepto y un monto mayor a cero son obligatorios.' }
          if (!movement.method || movement.method === 'Pedido') return { ok: false, error: 'Elige el medio de pago.' }
          if (ops.closedOn(current, movement.date)) return { ok: false, error: 'La caja de ese día ya se cerró.' }
          const document = movement.document?.trim() || ops.nextDocument(current, movement.type)
          const next: Movement = { ...movement, id: newId(), document, concept, notes: movement.notes.trim(), amount: ops.round2(movement.amount) }
          return { ok: true, value: next, patch: { movements: [next, ...current.movements] } }
        }),
      saveProduct: (product) => {
        if (!can('caja') && !can('compras')) return DENIED
        const result = run(null, (current) => ops.saveProduct(current, product, can('compras')))
        return result.ok ? null : result.error
      },
      recordSale: (input) => run('caja', (current) => ops.recordSale(current, { ...input, userId: currentUser?.id })),
      settleOrder: (movementId, method) => run('caja', (current) => ops.settleOrder(current, movementId, method)),
      voidSale: (saleId, reason) => run('caja', (current) => ops.voidSale(current, saleId, reason)),
      adjustStock: (input) => run('compras', (current) => ops.adjustStock(current, input)),
      saveSupplier: (supplier) => run('compras', (current) => ops.saveSupplier(current, supplier)),
      recordPurchase: (input) => run('compras', (current) => ops.recordPurchase(current, input)),
      savePayable: (input) => run('compras', (current) => ops.savePayable(current, input)),
      payPayable: (input) => run('compras', (current) => ops.payPayable(current, input)),
      saveFixedCost: (item) => run('compras', (current) => ops.saveFixedCost(current, item)),
      payFixedCost: (input) => run('compras', (current) => ops.payFixedCost(current, input)),
      updateWorker: (id, patch) => run('planilla', (current) => ops.updateWorker(current, id, patch)),
      payPayroll: (input) => run('planilla', (current) => ops.payPayroll(current, input)),
      voidPayroll: (id) => run('planilla', (current) => ops.voidPayroll(current, id)),
      saveTask: (task) => run('tareas', (current) => ops.saveTask(current, task, currentUser?.id)),
      setTaskStatus: (id, status) => run('tareas', (current) => ops.setTaskStatus(current, id, status)),
      removeTask: (id) =>
        run('tareas', (current) => {
          const task = (current.tasks ?? []).find((item) => item.id === id)
          if (task && task.createdBy !== currentUser?.id && !can('equipo')) {
            return { ok: false, error: 'Solo quien creó la tarea o un administrador puede borrarla.' }
          }
          return ops.removeTask(current, id)
        }),
      closeCash: (input) => run('caja', (current) => ops.closeCash(current, { ...input, userId: currentUser?.id })),
      setTaxRegime: (regime) => {
        run('contabilidad', (current) => ({ ok: true, value: null, patch: { settings: ops.changeRegime(current.settings, regime) } }))
      },
      updateSettings: (patch) => {
        const onlyLine = Object.keys(patch).every((key) => key === 'whatsapp')
        if (!can('equipo') && !(onlyLine && can('whatsapp'))) return
        run(null, (current) => ({ ok: true, value: null, patch: { settings: { ...current.settings, ...patch } } }))
      },
      ensureThread: (phone, name, petName) => {
        if (!can('whatsapp')) return null
        const key = digits(phone)
        const found = state.conversations.find((item) => digits(item.phone) === key)
        if (found) return found.id
        const next: Conversation = { id: newId(), phone: phone.trim(), name: name.trim() || 'Cliente', petName: petName.trim(), unread: 0, messages: [] }
        const result = run('whatsapp', (current) => ({ ok: true, value: next.id, patch: { conversations: [next, ...current.conversations] } }))
        return result.ok ? result.value : null
      },
      sendMessage: (conversationId, body) => {
        const text = body.trim()
        if (!text) return
        const message: WaMessage = { id: newId(), direction: 'out', body: text, at: new Date().toISOString(), status: 'enviado' }
        run('whatsapp', (current) => ({
          ok: true,
          value: null,
          patch: {
            conversations: current.conversations.map((item) => (item.id === conversationId ? { ...item, unread: 0, messages: [...item.messages, message] } : item)),
          },
        }))
      },
      markRead: (conversationId) => {
        if (!state.conversations.some((item) => item.id === conversationId && item.unread > 0)) return
        run('whatsapp', (current) => ({
          ok: true,
          value: null,
          patch: { conversations: current.conversations.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)) },
        }))
      },
      exportBackup: () => {
        if (!can('equipo')) return null
        return JSON.stringify({ ...outgoing(state), exportedAt: new Date().toISOString() })
      },
      importBackup: (raw) => {
        if (!can('equipo')) return 'No tienes permiso para restaurar datos.'
        const parsed = parseBackup(raw, state)
        if ('error' in parsed) return parsed.error
        const result = run('equipo', () => ({ ok: true, value: null, patch: { ...parsed.state, sessionUserId: state.sessionUserId, revision: undefined } }))
        return result.ok ? null : result.error
      },
      resetDemo: () => {
        if (currentUser?.role !== 'Administrador') return
        run('equipo', () => ({ ok: true, value: null, patch: { ...createSeed(), sessionUserId: state.sessionUserId, revision: undefined } }))
      },
    }
  }, [state, booting, unsynced, syncNotice, weakPassword])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStore() {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore debe usarse dentro de StoreProvider')
  return store
}
