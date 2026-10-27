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
      sessionUserId: parsed.users.some((user) => user.id === current.sessionUserId && user.active) ? current.sessionUserId : null,
      revision: Math.max(parsed.revision ?? 0, current.revision ?? 0) + 1,
    },
  }
}
