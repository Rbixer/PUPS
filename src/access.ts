import type { Permission, Role, User } from './types'

export const PERMISSIONS: { id: Permission; label: string; detail: string }[] = [
  { id: 'citas', label: 'Citas', detail: 'Agenda, altas y cambios del día.' },
  { id: 'fichas', label: 'Fichas', detail: 'Historial de cada mascota.' },
  { id: 'whatsapp', label: 'WhatsApp', detail: 'Bandeja y línea del negocio.' },
  { id: 'caja', label: 'Caja', detail: 'Ingresos y documentos de egreso.' },
  { id: 'costos', label: 'Costos', detail: 'Cambiar el monto de una cita ya guardada.' },
  { id: 'estadisticas', label: 'Estadísticas', detail: 'Ver el tablero del mes.' },
  { id: 'reportes', label: 'Reportes', detail: 'Descargar Excel y guardar PDF.' },
  { id: 'equipo', label: 'Equipo', detail: 'Usuarios, permisos y datos del negocio.' },
]

const ALL = PERMISSIONS.map((item) => item.id)

const RECEPTION: Permission[] = ['citas', 'fichas', 'whatsapp', 'caja', 'estadisticas', 'reportes']

export const DESTINATIONS: { permission: Permission; to: string }[] = [
  { permission: 'citas', to: '/admin' },
  { permission: 'fichas', to: '/admin/fichas' },
  { permission: 'whatsapp', to: '/admin/whatsapp' },
  { permission: 'caja', to: '/admin/ingresos' },
  { permission: 'estadisticas', to: '/admin/estadisticas' },
  { permission: 'equipo', to: '/admin/usuarios' },
]

export function defaultsFor(role: Role): Permission[] {
  return role === 'Administrador' ? [...ALL] : [...RECEPTION]
}

export function resolvePermissions(user: Pick<User, 'role' | 'permissions'>): Permission[] {
  const source = user.permissions ?? defaultsFor(user.role)
  return ALL.filter((item) => source.includes(item))
}

export function allows(user: Pick<User, 'role' | 'permissions' | 'active'> | null, permission: Permission) {
  if (!user || user.active === false) return false
  return resolvePermissions(user).includes(permission)
}

export function homeFor(user: Pick<User, 'role' | 'permissions' | 'active'>) {
  const permissions = resolvePermissions(user)
  return DESTINATIONS.find((item) => permissions.includes(item.permission))?.to ?? '/admin/sin-acceso'
}

export function permissionLabel(id: Permission) {
  return PERMISSIONS.find((item) => item.id === id)?.label ?? id
}
