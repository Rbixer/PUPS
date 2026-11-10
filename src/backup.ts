import { isoDate } from './format'
import { createSeed, DATA_VERSION } from './seed'
import type { AppState } from './types'

type Current = Pick<AppState, 'sessionUserId' | 'revision'>

export type BackupResult = { state: AppState } | { error: string }

const NOT_BACKUP = "El archivo no es un respaldo de PUP'S."

export function parseBackup(raw: string, current: Current): BackupResult {
  let parsed: AppState
  try {
    parsed = JSON.parse(raw) as AppState
  } catch {
    return { error: NOT_BACKUP }
  }
  const valid =
    parsed &&
    typeof parsed === 'object' &&
    parsed.version === DATA_VERSION &&
    Array.isArray(parsed.users) &&
    Array.isArray(parsed.appointments) &&
    Array.isArray(parsed.movements)
  if (!valid) return { error: NOT_BACKUP }
  const lists = ['conversations', 'leads', 'controlRows', 'products', 'sales', 'purchases', 'suppliers', 'stockMoves', 'payables', 'fixedCosts', 'payrolls', 'tasks', 'cashCloses', 'deposits', 'attendance'] as const
  if (lists.some((key) => parsed[key] !== undefined && !Array.isArray(parsed[key]))) return { error: NOT_BACKUP }
  const text = (value: unknown) => typeof value === 'string'
  if (!parsed.users.every((user) => user && text(user.id) && text(user.username) && text(user.name))) {
    return { error: 'El respaldo tiene usuarios incompletos.' }
  }
  if (!parsed.appointments.every((item) => item && text(item.id) && Number.isFinite(item.folio) && text(item.date) && text(item.time))) {
    return { error: 'El respaldo tiene citas incompletas.' }
  }
  if (!parsed.movements.every((item) => item && text(item.id) && (item.type === 'ingreso' || item.type === 'egreso') && Number.isFinite(item.amount) && text(item.date))) {
    return { error: 'El respaldo tiene movimientos de caja incompletos.' }
  }
  if (!parsed.users.some((user) => user.active && user.role === 'Administrador')) {
    return { error: 'El respaldo no tiene un administrador activo.' }
  }
  const base = createSeed()
  return {
    state: {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
      conversations: parsed.conversations ?? [],
      leads: parsed.leads ?? [],
      controlRows: parsed.controlRows ?? [],
      products: Array.isArray(parsed.products) ? parsed.products : base.products,
      sessionUserId: parsed.users.some((user) => user.id === current.sessionUserId && user.active) ? current.sessionUserId : null,
      revision: Math.max(parsed.revision ?? 0, current.revision ?? 0) + 1,
    },
  }
}

const BACKUP_AT = 'pups-backup-at'
const BACKUP_SEEN = 'pups-backup-seen'
const BACKUP_SNOOZE = 'pups-backup-snooze'
export const BACKUP_EVERY_DAYS = 7

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Sin almacenamiento no hay recordatorio, pero nada se rompe. */
  }
}

export function saveBackupFile(data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `pups-respaldo-${isoDate()}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  write(BACKUP_AT, new Date().toISOString())
}

/** Días desde el último respaldo (o desde el primer uso) cuando toca avisar; null si no toca. */
export function backupDueDays(now = Date.now()): number | null {
  if (!read(BACKUP_SEEN)) write(BACKUP_SEEN, new Date(now).toISOString())
  const snooze = Date.parse(read(BACKUP_SNOOZE) ?? '')
  if (Number.isFinite(snooze) && snooze > now) return null
  const reference = Date.parse(read(BACKUP_AT) ?? read(BACKUP_SEEN) ?? '')
  if (!Number.isFinite(reference)) return null
  const days = Math.floor((now - reference) / 86_400_000)
  return days >= BACKUP_EVERY_DAYS ? days : null
}

export function snoozeBackupReminder(days = 3, now = Date.now()) {
  write(BACKUP_SNOOZE, new Date(now + days * 86_400_000).toISOString())
}

export function hasBackedUp() {
  return Boolean(read(BACKUP_AT))
}
