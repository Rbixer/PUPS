import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allows as userAllows } from './access'
import { parseBackup } from './backup'
import { createSeed, DATA_VERSION } from './seed'
import { digits, hashPassword, newId, normalizePhone } from './format'
import * as ops from './ops'
import { nextDocument, type Op } from './ops'
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

export type ChargeNote = { document: string; amount: number; created: boolean; removed?: boolean }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const AUTO_CHARGE = 'Cobro al completar la cita.'
const DENIED = 'No tienes permiso para esta acción.'

function syncIncome(appointment: Appointment, movements: Movement[], method?: string) {
  const auto = movements.find((item) => item.type === 'ingreso' && item.folio === appointment.folio && item.notes === AUTO_CHARGE)
  if (appointment.status !== 'completada' || appointment.cost <= 0) {
    if (!auto) return { movements, note: null as ChargeNote | null }
    return {
      movements: movements.filter((item) => item.id !== auto.id),
      note: { document: auto.document, amount: auto.amount, created: false, removed: true } satisfies ChargeNote,
    }
  }
  const existing = movements.find((item) => item.type === 'ingreso' && item.folio === appointment.folio)
  if (!existing) {
    const created: Movement = {
      id: newId(),
      type: 'ingreso',
      date: appointment.date,
      concept: `Servicio cita #${appointment.folio}`,
      amount: appointment.cost,
      method: method ?? 'Efectivo',
      notes: AUTO_CHARGE,
      document: nextDocument(movements, 'ingreso'),
      folio: appointment.folio,
    }
    return { movements: [created, ...movements], note: { document: created.document, amount: created.amount, created: true } }
  }
  if (existing.amount === appointment.cost && (!method || existing.method === method)) {
    return { movements, note: null as ChargeNote | null }
  }
  return {
    movements: movements.map((item) =>
      item.id === existing.id
        ? { ...item, amount: appointment.cost, method: method && item.notes === AUTO_CHARGE ? method : item.method }
        : item,
    ),
    note: { document: existing.document, amount: appointment.cost, created: false },
  }
}

const KEY = 'pups-monica-v1'
const SESSION = 'pups-session'

function bump(current: AppState, patch: Partial<AppState>): AppState {
  return { ...current, ...patch, revision: (current.revision ?? 0) + 1 }
}

function shared(state: AppState): AppState {
  return { ...state, sessionUserId: null }
}

/** Copia ligera para localStorage: las fotos pesan y el cupo del navegador es corto. */
function lightweight(state: AppState): AppState {
  return {
    ...state,
    appointments: state.appointments.map((item) => ({
      ...item,
      beforePhoto: undefined,
      afterPhoto: undefined,
      report: item.report ? { ...item.report, photos: item.report.photos?.map(() => '') } : item.report,
    })),
    products: state.products?.map((item) => ({
      ...item,
      image: item.image.startsWith('data:') ? '' : item.image,
    })),
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

function persist(payload: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(lightweight(payload)))
    } catch {
      /* Sin cupo: el equipo del local sigue siendo la copia principal. */
    }
  }
}

const REMEMBER = 'pups-remember'
const LOCK = 'pups-login-lock'
const MAX_TRIES = 5
const LOCK_MS = 30_000

function readLock() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCK) ?? 'null') as { tries: number; until: number } | null
    return raw && typeof raw.tries === 'number' ? raw : { tries: 0, until: 0 }
  } catch {
    return { tries: 0, until: 0 }
  }
}

export function lockSeconds() {
  const { until } = readLock()
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}

function failLogin() {
  const current = readLock()
  const tries = current.until && current.until < Date.now() ? 1 : current.tries + 1
  const until = tries >= MAX_TRIES ? Date.now() + LOCK_MS : 0
  localStorage.setItem(LOCK, JSON.stringify({ tries: tries >= MAX_TRIES ? 0 : tries, until }))
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createSeed()
    const parsed = JSON.parse(raw) as AppState
    if (parsed.version !== DATA_VERSION || !parsed.users || !parsed.appointments) return createSeed()
    const seed = createSeed()
    return {
      ...parsed,
      settings: { ...seed.settings, ...parsed.settings },
      conversations: parsed.conversations?.length ? parsed.conversations : seed.conversations,
      leads: parsed.leads ?? [],
      controlRows: parsed.controlRows ?? [],
      products: Array.isArray(parsed.products) ? parsed.products : seed.products,
      revision: parsed.revision ?? 1,
    }
  } catch {
    return createSeed()
  }
}

type Store = {
  state: AppState
  currentUser: User | null
  isAdmin: boolean
  allows: (permission: Permission) => boolean
  login: (username: string, password: string, remember?: boolean) => Promise<boolean>
  logout: () => void
  addAppointment: (appointment: Omit<Appointment, 'id' | 'folio'>) => Appointment
  updateAppointment: (id: string, patch: Partial<Appointment>, method?: string) => ChargeNote | null
  setVisitPhoto: (id: string, slot: 'antes' | 'despues', data: string) => boolean
  addUser: (user: Omit<User, 'id' | 'active'>) => string | null
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
  ) => string | null
  setControl: (year: number, month: number, field: ControlField, value: number) => void
  toggleUser: (id: string) => string | null
  addMovement: (movement: Omit<Movement, 'id' | 'document'> & { document?: string }) => Result<Movement>
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => void
  placeShopOrder: (input: { name: string; phone: string; lines: ShopLine[] }) => { ok: true; document: string; total: number } | { ok: false; error: string }
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
  payFixedCost: (input: { fixedId: string; period: string; amount: number; method: string; date: string }) => Result<Movement>
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
  const [state, setState] = useState<AppState>(() => {
    const initial = load()
    const session = sessionStorage.getItem(SESSION) || localStorage.getItem(REMEMBER) || initial.sessionUserId
    if (session) sessionStorage.setItem(SESSION, session)
    return { ...initial, sessionUserId: session }
  })
  const latest = useRef(state)
  latest.current = state
  const booted = useRef(false)
  const bootRevision = useRef<number | null>(null)
  if (bootRevision.current === null) bootRevision.current = state.revision ?? 0

  useEffect(() => {
    let cancel = false
    const started = bootRevision.current ?? 0
    async function boot() {
      try {
        const response = await fetch('/api/state')
        if (response.status === 200) {
          const remote = JSON.parse(await response.text()) as AppState
          if (!remote.users || !remote.appointments) throw new Error('vacio')
          if (!cancel) {
            setState((current) => {
              if ((current.revision ?? 0) !== started) return current
              if ((remote.revision ?? 0) < (current.revision ?? 0)) return current
              return absorb(remote, sessionStorage.getItem(SESSION))
            })
          }
        } else if (response.status === 204) {
          await fetch('/api/state', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(shared(load())),
          })
        }
      } catch {
        /* El panel sigue con la copia de este navegador si el equipo no responde. */
      } finally {
        booted.current = true
        if (!cancel) setState((current) => ({ ...current }))
      }
    }
    void boot()
    const poll = () => {
      if (!booted.current || document.hidden || !navigator.onLine) return
      void fetch('/api/state')
        .then(async (response) => {
          if (!response.ok) return
          const remote = (await response.json()) as AppState
          setState((current) => {
            if ((remote.revision ?? 0) <= (current.revision ?? 0)) return current
            return absorb(remote, current.sessionUserId)
          })
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(poll, 2500)
    const wake = () => {
      if (!document.hidden) poll()
    }
    const resync = () => {
      wake()
      setState((current) => ({ ...current }))
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', resync)
    return () => {
      cancel = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', resync)
    }
  }, [])

  useEffect(() => {
    if (!booted.current) return
    const payload = shared(state)
    persist(payload)
    if (!navigator.onLine) return
    const handle = window.setTimeout(() => {
      void fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (response.status !== 409) return
          const remote = (await response.json()) as AppState
          setState((current) => absorb(remote, current.sessionUserId))
        })
        .catch(() => undefined)
    }, 200)
    return () => window.clearTimeout(handle)
  }, [state])

  const api = useMemo<Store>(() => {
    const currentUser = state.users.find((user) => user.id === state.sessionUserId && user.active) ?? null

    /** Aplica una operación y devuelve su resultado al instante; si el estado cambió antes del render, la repite sobre el vigente. */
    function run<T>(permission: Permission | null, op: (current: AppState) => Op<T>): Result<T> {
      if (permission && !userAllows(currentUser, permission)) return { ok: false, error: DENIED }
      const base = latest.current
      const result = op(base)
      if (!result.ok) return result
      const next = bump(base, result.patch)
      latest.current = next
      setState((live) => {
        if (live === base) return next
        const again = op(live)
        return again.ok ? bump(live, again.patch) : live
      })
      return { ok: true, value: result.value }
    }

    return {
      state,
      currentUser,
      isAdmin: currentUser?.role === 'Administrador',
      allows: (permission) => userAllows(currentUser, permission),
      login: async (username, password, remember = false) => {
        if (lockSeconds() > 0) return false
        const hashed = await hashPassword(password)
        const user = state.users.find(
          (item) =>
            item.username.toLowerCase() === username.trim().toLowerCase() &&
            (item.password === hashed || item.password === password) &&
            item.active,
        )
        if (!user) {
          failLogin()
          return false
        }
        localStorage.removeItem(LOCK)
        sessionStorage.setItem(SESSION, user.id)
        if (remember) localStorage.setItem(REMEMBER, user.id)
        else localStorage.removeItem(REMEMBER)
        setState((current) => ({
          ...current,
          sessionUserId: user.id,
          users:
            user.password === password
              ? current.users.map((item) => (item.id === user.id ? { ...item, password: hashed } : item))
              : current.users,
          revision: user.password === password ? (current.revision ?? 0) + 1 : current.revision,
        }))
        return true
      },
      logout: () => {
        sessionStorage.removeItem(SESSION)
        localStorage.removeItem(REMEMBER)
        setState((current) => ({ ...current, sessionUserId: null }))
      },
      addAppointment: (appointment) => {
        const folio = state.appointments.reduce((max, item) => Math.max(max, item.folio), 900) + 1
        const employeeCode = (appointment.employeeCode || currentUser?.employeeCode || '').trim()
        const employeeId = employeeCode ? state.users.find((item) => item.employeeCode === employeeCode)?.id : undefined
        const next: Appointment = {
          ...appointment,
          id: newId(),
          folio,
          phone: normalizePhone(appointment.phone),
          employeeCode: employeeCode || undefined,
          employeeId,
        }
        setState((current) => {
          const charged = syncIncome(next, current.movements)
          return bump(current, { movements: charged.movements, appointments: [next, ...current.appointments] })
        })
        return next
      },
      updateAppointment: (id, patch, method) => {
        if (!userAllows(currentUser, 'citas')) return null
        let note: ChargeNote | null = null
        setState((current) => {
          const previous = current.appointments.find((item) => item.id === id)
          if (!previous) return current
          const nextPatch = { ...patch }
          if (nextPatch.cost !== undefined && nextPatch.cost !== previous.cost && !userAllows(currentUser, 'costos')) {
            nextPatch.cost = previous.cost
          }
          if (nextPatch.employeeCode !== undefined) {
            const employeeCode = nextPatch.employeeCode.trim()
            nextPatch.employeeCode = employeeCode || undefined
            nextPatch.employeeId = employeeCode ? current.users.find((item) => item.employeeCode === employeeCode)?.id : undefined
          }
          const next = {
            ...previous,
            ...nextPatch,
            id: previous.id,
            folio: previous.folio,
            phone: nextPatch.phone !== undefined ? normalizePhone(nextPatch.phone) : previous.phone,
          }
          const charged = syncIncome(next, current.movements, method)
          note = charged.note
          return bump(current, {
            movements: charged.movements,
            appointments: current.appointments.map((item) => (item.id === id ? next : item)),
          })
        })
        return note
      },
      setVisitPhoto: (id, slot, data) => {
        if (!userAllows(currentUser, 'fichas')) return false
        if (!state.appointments.some((item) => item.id === id)) return false
        setState((current) => {
          const previous = current.appointments.find((item) => item.id === id)
          if (!previous) return current
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
          const next: Appointment = {
            ...previous,
            ...(slot === 'antes' ? { beforePhoto: data } : { afterPhoto: data }),
            ...(report ? { report } : {}),
          }
          return bump(current, {
            appointments: current.appointments.map((item) => (item.id === id ? next : item)),
          })
        })
        return true
      },
      addUser: (user) => {
        if (!userAllows(currentUser, 'equipo')) return 'No tienes permiso para gestionar el equipo.'
        const username = user.username.trim()
        const name = user.name.trim()
        if (!name || !username || !user.password.trim()) return 'Completa nombre, usuario y clave.'
        const exists = state.users.some((item) => item.username.toLowerCase() === username.toLowerCase())
        if (exists) return 'Ese usuario ya existe.'
        const next: User = { ...user, id: newId(), name, username, active: true }
        setState((current) => bump(current, { users: [...current.users, next] }))
        return null
      },
      updateUser: (id, patch) => {
        if (!userAllows(currentUser, 'equipo')) return 'No tienes permiso para gestionar el equipo.'
        const target = state.users.find((item) => item.id === id)
        if (!target) return 'Usuario no encontrado.'
        const name = patch.name.trim()
        const username = patch.username.trim()
        if (!name || !username) return 'Completa nombre y usuario.'
        const exists = state.users.some((item) => item.id !== id && item.username.toLowerCase() === username.toLowerCase())
        if (exists) return 'Ese usuario ya existe.'
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
          password: patch.password?.trim() ? patch.password : target.password,
        }
        const users = state.users.map((item) => (item.id === id ? next : item))
        if (!users.some((item) => item.active && item.role === 'Administrador' && userAllows(item, 'equipo'))) {
          return 'Debe quedar un administrador activo con acceso a Equipo.'
        }
        setState((current) => bump(current, { users }))
        return null
      },
      setControl: (year, month, field, value) => {
        if (!userAllows(currentUser, 'equipo')) return
        const amount = Number.isFinite(value) ? value : 0
        setState((current) => {
          const rows = current.controlRows ?? []
          const index = rows.findIndex((item) => item.year === year && item.month === month)
          const previous = index >= 0 ? rows[index] : { year, month, values: {} }
          const nextRow = { ...previous, values: { ...previous.values, [field]: amount } }
          const controlRows = index >= 0 ? rows.map((item, itemIndex) => (itemIndex === index ? nextRow : item)) : [...rows, nextRow]
          return bump(current, { controlRows })
        })
      },
      toggleUser: (id) => {
        if (!userAllows(currentUser, 'equipo')) return 'No tienes permiso para gestionar el equipo.'
        if (id === state.sessionUserId) return 'No puedes desactivar la sesión actual.'
        const target = state.users.find((item) => item.id === id)
        if (!target) return 'Usuario no encontrado.'
        const users = state.users.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
        if (!users.some((item) => item.active && item.role === 'Administrador' && userAllows(item, 'equipo'))) {
          return 'Debe quedar un administrador activo con acceso a Equipo.'
        }
        setState((current) => bump(current, { users }))
        return null
      },
      addMovement: (movement) =>
        run('caja', (current) => {
          const concept = movement.concept.trim()
          if (!concept || !Number.isFinite(movement.amount) || movement.amount <= 0) return { ok: false, error: 'Concepto y un monto mayor a cero son obligatorios.' }
          if ((current.cashCloses ?? []).some((item) => item.date === movement.date)) return { ok: false, error: 'La caja de ese día ya se cerró.' }
          const document = movement.document?.trim() || nextDocument(current.movements, movement.type)
          const next: Movement = { ...movement, id: newId(), document, concept, notes: movement.notes.trim(), amount: ops.round2(movement.amount) }
          return { ok: true, value: next, patch: { movements: [next, ...current.movements] } }
        }),
      placeShopOrder: (input) => {
        const result = run(null, (current) => ops.placeOrder(current, input))
        return result.ok ? { ok: true, ...result.value } : result
      },
      saveProduct: (product) => {
        if (!userAllows(currentUser, 'caja') && !userAllows(currentUser, 'compras')) return DENIED
        const result = run(null, (current) => ops.saveProduct(current, product))
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
          if (task && task.createdBy !== currentUser?.id && !userAllows(currentUser, 'equipo')) {
            return { ok: false, error: 'Solo quien creó la tarea o un administrador puede borrarla.' }
          }
          return ops.removeTask(current, id)
        }),
      closeCash: (input) => run('caja', (current) => ops.closeCash(current, { ...input, userId: currentUser?.id })),
      setTaxRegime: (regime) => {
        run('contabilidad', (current) => ({ ok: true, value: null, patch: { settings: { ...current.settings, taxRegime: regime } } }))
      },
      addLead: (lead) => {
        const next: Lead = {
          ...lead,
          id: newId(),
          createdAt: new Date().toISOString(),
          name: lead.name.trim(),
          phone: lead.phone.trim(),
          message: lead.message.trim(),
        }
        setState((current) => bump(current, { leads: [next, ...current.leads] }))
      },
      updateSettings: (patch) => {
        const onlyLine = Object.keys(patch).every((key) => key === 'whatsapp')
        if (!userAllows(currentUser, 'equipo') && !(onlyLine && userAllows(currentUser, 'whatsapp'))) return
        setState((current) => bump(current, { settings: { ...current.settings, ...patch } }))
      },
      ensureThread: (phone, name, petName) => {
        if (!userAllows(currentUser, 'whatsapp')) return null
        const key = digits(phone)
        const found = state.conversations.find((item) => digits(item.phone) === key)
        if (found) return found.id
        const next: Conversation = {
          id: newId(),
          phone: phone.trim(),
          name: name.trim() || 'Cliente',
          petName: petName.trim(),
          unread: 0,
          messages: [],
        }
        setState((current) => bump(current, { conversations: [next, ...current.conversations] }))
        return next.id
      },
      sendMessage: (conversationId, body) => {
        if (!userAllows(currentUser, 'whatsapp')) return
        const text = body.trim()
        if (!text) return
        const message: WaMessage = {
          id: newId(),
          direction: 'out',
          body: text,
          at: new Date().toISOString(),
          status: 'enviado',
        }
        setState((current) =>
          bump(current, {
            conversations: current.conversations.map((item) =>
              item.id === conversationId ? { ...item, unread: 0, messages: [...item.messages, message] } : item,
            ),
          }),
        )
      },
      markRead: (conversationId) => {
        if (!userAllows(currentUser, 'whatsapp')) return
        setState((current) =>
          bump(current, {
            conversations: current.conversations.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)),
          }),
        )
      },
      exportBackup: () => {
        if (!userAllows(currentUser, 'equipo')) return null
        return JSON.stringify({ ...shared(state), exportedAt: new Date().toISOString() })
      },
      importBackup: (raw) => {
        if (!userAllows(currentUser, 'equipo')) return 'No tienes permiso para restaurar datos.'
        const result = parseBackup(raw, state)
        if ('error' in result) return result.error
        setState(result.state)
        return null
      },
      resetDemo: () => {
        if (currentUser?.role !== 'Administrador') return
        const next = { ...createSeed(), sessionUserId: state.sessionUserId, revision: (state.revision ?? 0) + 1 }
        setState(next)
      },
    }
  }, [state])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStore() {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore debe usarse dentro de StoreProvider')
  return store
}
