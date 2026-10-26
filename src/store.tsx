import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allows as userAllows } from './access'
import { createSeed, DATA_VERSION } from './seed'
import { digits, hashPassword, normalizePhone } from './format'
import type { Appointment, AppState, Conversation, Lead, Movement, Permission, Settings, User, WaMessage } from './types'

export type ChargeNote = { document: string; amount: number; created: boolean; removed?: boolean }

const AUTO_CHARGE = 'Cobro al completar la cita.'

function nextDocument(movements: Movement[], type: Movement['type']) {
  const same = movements.filter((item) => item.type === type)
  const seq = same.reduce((max, item) => {
    const value = Number(item.document.replace(/\D/g, '')) || 0
    return Math.max(max, value)
  }, type === 'egreso' ? 12 : 100)
  const prefix = type === 'egreso' ? 'EG' : 'ING'
  return `${prefix}-${String(seq + 1).padStart(3, '0')}`
}

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
      id: crypto.randomUUID(),
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
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  addAppointment: (appointment: Omit<Appointment, 'id' | 'folio'>) => Appointment
  updateAppointment: (id: string, patch: Partial<Appointment>, method?: string) => ChargeNote | null
  setVisitPhoto: (id: string, slot: 'antes' | 'despues', data: string) => boolean
  addUser: (user: Omit<User, 'id' | 'active'>) => string | null
  updateUser: (
    id: string,
    patch: { name: string; username: string; role: User['role']; permissions: Permission[]; password?: string },
  ) => string | null
  toggleUser: (id: string) => string | null
  addMovement: (movement: Omit<Movement, 'id' | 'document'> & { document?: string }) => Movement | null
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => void
  updateSettings: (patch: Partial<Settings>) => void
  ensureThread: (phone: string, name: string, petName: string) => string | null
  sendMessage: (conversationId: string, body: string) => void
  markRead: (conversationId: string) => void
  resetDemo: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const initial = load()
    const session = sessionStorage.getItem(SESSION) || initial.sessionUserId
    if (session) sessionStorage.setItem(SESSION, session)
    return { ...initial, sessionUserId: session }
  })
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
              return {
                ...remote,
                sessionUserId: sessionStorage.getItem(SESSION),
                conversations: remote.conversations ?? [],
                leads: remote.leads ?? [],
              }
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
    const timer = window.setInterval(() => {
      if (!booted.current) return
      void fetch('/api/state')
        .then(async (response) => {
          if (!response.ok) return
          const remote = (await response.json()) as AppState
          setState((current) => {
            if ((remote.revision ?? 0) <= (current.revision ?? 0)) return current
            return { ...remote, sessionUserId: current.sessionUserId, conversations: remote.conversations ?? [], leads: remote.leads ?? [] }
          })
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      cancel = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!booted.current) return
    const payload = shared(state)
    localStorage.setItem(KEY, JSON.stringify(payload))
    const handle = window.setTimeout(() => {
      void fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (response.status !== 409) return
          const remote = (await response.json()) as AppState
          setState((current) => ({ ...remote, sessionUserId: current.sessionUserId }))
        })
        .catch(() => undefined)
    }, 200)
    return () => window.clearTimeout(handle)
  }, [state])

  const api = useMemo<Store>(() => {
    const currentUser = state.users.find((user) => user.id === state.sessionUserId && user.active) ?? null

    return {
      state,
      currentUser,
      isAdmin: currentUser?.role === 'Administrador',
      allows: (permission) => userAllows(currentUser, permission),
      login: async (username, password) => {
        const hashed = await hashPassword(password)
        const user = state.users.find(
          (item) =>
            item.username.toLowerCase() === username.trim().toLowerCase() &&
            (item.password === hashed || item.password === password) &&
            item.active,
        )
        if (!user) return false
        sessionStorage.setItem(SESSION, user.id)
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
        setState((current) => ({ ...current, sessionUserId: null }))
      },
      addAppointment: (appointment) => {
        const folio = state.appointments.reduce((max, item) => Math.max(max, item.folio), 900) + 1
        const next: Appointment = { ...appointment, id: crypto.randomUUID(), folio, phone: normalizePhone(appointment.phone) }
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
        const next: User = { ...user, id: crypto.randomUUID(), name, username, active: true }
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
      addMovement: (movement) => {
        if (!userAllows(currentUser, 'caja')) return null
        const same = state.movements.filter((item) => item.type === movement.type)
        const seq = same.reduce((max, item) => {
          const value = Number(item.document.replace(/\D/g, '')) || 0
          return Math.max(max, value)
        }, movement.type === 'egreso' ? 12 : 100)
        const prefix = movement.type === 'egreso' ? 'EG' : 'ING'
        const document = movement.document?.trim() || `${prefix}-${String(seq + 1).padStart(3, '0')}`
        const next: Movement = { ...movement, id: crypto.randomUUID(), document, concept: movement.concept.trim(), notes: movement.notes.trim() }
        setState((current) => bump(current, { movements: [next, ...current.movements] }))
        return next
      },
      addLead: (lead) => {
        const next: Lead = {
          ...lead,
          id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
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
