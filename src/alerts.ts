import { allows } from './access'
import { count, isoDate, longDate, money } from './format'
import { closedOn, PETTY_CASH, PETTY_REFILL } from './ops'
import { behindGoal, goalProgress, workersOf } from './payroll'
import type { AppState, Permission, User } from './types'

export type AlertKind = 'citas' | 'caja' | 'whatsapp' | 'metas' | 'tareas'

export type Alert = {
  id: string
  kind: AlertKind
  title: string
  detail: string
  to: string
  tone: 'warn' | 'bad' | 'info'
}

/** Movimientos que piden un corte de caja (sin pedidos ni caja chica). */
function needsClose(item: AppState['movements'][number]) {
  if (item.method === 'Pedido' || item.method === PETTY_CASH) return false
  if (item.category === PETTY_REFILL) return false
  return true
}

/** Días anteriores a hoy con movimiento de caja y sin corte. */
export function openCashDays(state: Pick<AppState, 'movements' | 'cashCloses'>, today = isoDate()) {
  const days = new Set(
    state.movements.filter((item) => item.date < today && needsClose(item)).map((item) => item.date),
  )
  return [...days].filter((day) => !closedOn(state, day)).sort()
}

export function scheduledToday(state: Pick<AppState, 'appointments'>, today = isoDate()) {
  return state.appointments.filter((item) => item.date === today && item.status === 'pendiente')
}

export function unreadThreads(state: Pick<AppState, 'conversations'>) {
  return state.conversations.filter((item) => item.unread > 0)
}

export function overdueTasks(state: Pick<AppState, 'tasks'>, today = isoDate(), assigneeId?: string) {
  return (state.tasks ?? []).filter(
    (item) =>
      item.status !== 'hecha' &&
      item.dueDate &&
      item.dueDate < today &&
      (!assigneeId || item.assigneeId === assigneeId || !item.assigneeId),
  )
}

export function workersBehind(state: Pick<AppState, 'users' | 'appointments' | 'sales'>, today = isoDate()) {
  const period = today.slice(0, 7)
  return workersOf(state.users).flatMap((user) => {
    const progress = goalProgress(user, state, period)
    const behind = behindGoal(progress, period, today)
    if (!behind.length) return []
    const parts = behind.map((kind) =>
      kind === 'ventas'
        ? `ventas ${money(progress.sales)} de ${money(progress.salesGoal)}`
        : `servicios ${progress.services} de ${progress.servicesGoal}`,
    )
    return [{ user, progress, behind, detail: parts.join(' · ') }]
  })
}

function can(user: User | null, permission: Permission) {
  return user ? allows(user, permission) : false
}

/**
 * Alertas del día según lo que el usuario puede ver. Se armán para el aviso del panel
 * y para los números del menú.
 */
export function buildAlerts(state: AppState, user: User | null, today = isoDate()): Alert[] {
  const alerts: Alert[] = []
  if (!user) return alerts

  if (can(user, 'citas')) {
    const visits = scheduledToday(state, today)
    if (visits.length) {
      alerts.push({
        id: 'citas-hoy',
        kind: 'citas',
        title: count(visits.length, 'servicio agendado hoy', 'servicios agendados hoy'),
        detail: visits
          .slice(0, 3)
          .map((item) => `${item.time} · ${item.petName}`)
          .join(' · ') + (visits.length > 3 ? '…' : ''),
        to: '/admin',
        tone: 'info',
      })
    }
  }

  if (can(user, 'caja')) {
    const open = openCashDays(state, today)
    if (open.length) {
      const first = open[0]
      const last = open[open.length - 1]
      alerts.push({
        id: 'caja-abierta',
        kind: 'caja',
        title: open.length === 1 ? `Falta el corte del ${longDate(first)}` : `Faltan ${open.length} cortes de caja`,
        detail:
          open.length === 1
            ? 'Hay movimientos de ese día sin cerrar.'
            : `Desde el ${longDate(first)} hasta el ${longDate(last)}.`,
        to: '/admin/corte',
        tone: 'bad',
      })
    }
  }

  if (can(user, 'whatsapp')) {
    const threads = unreadThreads(state)
    if (threads.length) {
      const messages = threads.reduce((sum, item) => sum + item.unread, 0)
      alerts.push({
        id: 'whatsapp',
        kind: 'whatsapp',
        title: count(messages, 'mensaje de WhatsApp sin leer', 'mensajes de WhatsApp sin leer'),
        detail: threads
          .slice(0, 3)
          .map((item) => item.name || item.phone)
          .join(' · '),
        to: '/admin/whatsapp',
        tone: 'warn',
      })
    }
  }

  if (can(user, 'planilla') || can(user, 'equipo') || can(user, 'estadisticas')) {
    const behind = workersBehind(state, today)
    for (const row of behind.slice(0, 4)) {
      alerts.push({
        id: `meta-${row.user.id}`,
        kind: 'metas',
        title: `${[row.user.name, row.user.lastName].filter(Boolean).join(' ')} va abajo de su meta`,
        detail: row.detail,
        to: can(user, 'planilla') ? '/admin/planilla' : '/admin/asistencia',
        tone: 'warn',
      })
    }
  } else if (user.salesGoal || user.servicesGoal) {
    const progress = goalProgress(user, state, today.slice(0, 7))
    const behind = behindGoal(progress, today.slice(0, 7), today)
    if (behind.length) {
      alerts.push({
        id: `meta-${user.id}`,
        kind: 'metas',
        title: 'Vas abajo del ritmo de tu meta',
        detail: behind.map((kind) => (kind === 'ventas' ? `ventas ${money(progress.sales)} de ${money(progress.salesGoal)}` : `servicios ${progress.services} de ${progress.servicesGoal}`)).join(' · '),
        to: '/admin/asistencia',
        tone: 'warn',
      })
    }
  }

  if (can(user, 'tareas')) {
    const late = overdueTasks(state, today)
    if (late.length) {
      alerts.push({
        id: 'tareas-vencidas',
        kind: 'tareas',
        title: count(late.length, 'tarea vencida', 'tareas vencidas'),
        detail: late
          .slice(0, 3)
          .map((item) => item.title)
          .join(' · '),
        to: '/admin/tareas',
        tone: 'bad',
      })
    }
  } else {
    const mine = overdueTasks(state, today, user.id).filter((item) => item.assigneeId === user.id)
    if (mine.length) {
      alerts.push({
        id: 'tareas-mias',
        kind: 'tareas',
        title: count(mine.length, 'tarea tuya vencida', 'tareas tuyas vencidas'),
        detail: mine.map((item) => item.title).join(' · '),
        to: '/admin/tareas',
        tone: 'bad',
      })
    }
  }

  return alerts
}

/** Números para el menú lateral, por ruta. */
export function alertBadges(state: AppState, user: User | null, today = isoDate()): Record<string, number> {
  if (!user) return {}
  const badges: Record<string, number> = {}
  if (can(user, 'citas')) {
    const n = scheduledToday(state, today).length
    if (n) badges['/admin'] = n
  }
  if (can(user, 'caja')) {
    const n = openCashDays(state, today).length
    if (n) badges['/admin/corte'] = n
  }
  if (can(user, 'whatsapp')) {
    const n = unreadThreads(state).length
    if (n) badges['/admin/whatsapp'] = n
  }
  if (can(user, 'tareas')) {
    const overdue = overdueTasks(state, today).length
    const mine = (state.tasks ?? []).filter((item) => item.assigneeId === user.id && item.status !== 'hecha').length
    const n = overdue || mine
    if (n) badges['/admin/tareas'] = n
  } else {
    const n = (state.tasks ?? []).filter((item) => item.assigneeId === user.id && item.status !== 'hecha').length
    if (n) badges['/admin/tareas'] = n
  }
  if (can(user, 'planilla') || can(user, 'equipo') || can(user, 'estadisticas')) {
    const n = workersBehind(state, today).length
    if (n) badges['/admin/asistencia'] = n
  }
  return badges
}
