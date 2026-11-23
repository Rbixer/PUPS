import type { Permission, Role, User } from './types'
import { PERMISSIONS_VERSION } from './types'

export type PermissionMeta = { id: Permission; label: string; detail: string; kind: 'module' | 'action' }

export type PermissionNode = {
  id: Permission
  label: string
  detail: string
  /** Acciones hijas (solo en módulos). */
  actions?: { id: Permission; label: string; detail: string }[]
}

export type PermissionGroup = {
  id: string
  label: string
  nodes: PermissionNode[]
}

/** Árbol compacto para la UI de Usuarios (módulos + pocas acciones). */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'operacion',
    label: 'Operación',
    nodes: [
      {
        id: 'citas',
        label: 'Citas',
        detail: 'Agenda, altas y cambios del día.',
        actions: [{ id: 'costos', label: 'Cambiar precio de cita', detail: 'Editar el monto de una cita ya guardada.' }],
      },
      { id: 'fichas', label: 'Fichas', detail: 'Historial de cada mascota.' },
      { id: 'whatsapp', label: 'WhatsApp', detail: 'Bandeja y línea del negocio.' },
      { id: 'tareas', label: 'Tareas', detail: 'Ver y asignar tareas del equipo.' },
    ],
  },
  {
    id: 'caja',
    label: 'Ventas y caja',
    nodes: [
      {
        id: 'caja',
        label: 'Punto de venta',
        detail: 'Ventas, tienda, clientes, constancias y compras de empleados.',
        actions: [{ id: 'anular', label: 'Anular ventas', detail: 'Anular ventas de mostrador y cancelar pedidos.' }],
      },
      { id: 'corte', label: 'Corte de caja', detail: 'Cierre del día y depósitos al banco.' },
      { id: 'movimientos', label: 'Ingresos y egresos', detail: 'Entradas y salidas de dinero fuera del punto de venta.' },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario y compras',
    nodes: [
      {
        id: 'inventario',
        label: 'Inventario',
        detail: 'Existencias, kárdex y productos.',
        actions: [{ id: 'ajustar', label: 'Ajustar stock y costos', detail: 'Ajustes, consumos y ver/editar costo de producto.' }],
      },
      { id: 'compras', label: 'Compras y gastos', detail: 'Proveedores, compras, gastos y facturas por pagar.' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    nodes: [
      { id: 'planilla', label: 'Planilla', detail: 'Pago, comisiones y pasivo laboral.' },
      { id: 'contabilidad', label: 'Contabilidad', detail: 'Libro diario, resultados, balance e impuestos.' },
      {
        id: 'estadisticas',
        label: 'Estadísticas',
        detail: 'Tablero del mes.',
        actions: [{ id: 'reportes', label: 'Descargar Excel / PDF', detail: 'Exportar reportes y el libro contable.' }],
      },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    nodes: [{ id: 'equipo', label: 'Usuarios y negocio', detail: 'Usuarios, permisos, trabajadores, backup y datos del sitio.' }],
  },
]

export const PERMISSIONS: PermissionMeta[] = PERMISSION_GROUPS.flatMap((group) =>
  group.nodes.flatMap((node) => [
    { id: node.id, label: node.label, detail: node.detail, kind: 'module' as const },
    ...(node.actions ?? []).map((action) => ({ id: action.id, label: action.label, detail: action.detail, kind: 'action' as const })),
  ]),
)

const ALL = PERMISSIONS.map((item) => item.id)

/** Padre de cada acción (para dependencias en la UI). */
export const ACTION_PARENT: Partial<Record<Permission, Permission>> = {
  costos: 'citas',
  anular: 'caja',
  ajustar: 'inventario',
  reportes: 'estadisticas',
}

const RECEPTION: Permission[] = ['citas', 'fichas', 'whatsapp', 'caja', 'movimientos', 'tareas', 'estadisticas', 'reportes']

export const DESTINATIONS: { permission: Permission; to: string }[] = [
  { permission: 'citas', to: '/admin' },
  { permission: 'fichas', to: '/admin/fichas' },
  { permission: 'whatsapp', to: '/admin/whatsapp' },
  { permission: 'caja', to: '/admin/ventas' },
  { permission: 'corte', to: '/admin/corte' },
  { permission: 'movimientos', to: '/admin/ingresos' },
  { permission: 'tareas', to: '/admin/tareas' },
  { permission: 'inventario', to: '/admin/inventario' },
  { permission: 'compras', to: '/admin/compras' },
  { permission: 'planilla', to: '/admin/planilla' },
  { permission: 'contabilidad', to: '/admin/contabilidad' },
  { permission: 'estadisticas', to: '/admin/estadisticas' },
  { permission: 'equipo', to: '/admin/usuarios' },
]

export function defaultsFor(role: Role): Permission[] {
  return role === 'Administrador' ? [...ALL] : [...RECEPTION]
}

/** Expande permisos viejos de caja/compras a los ids partidos (solo lectura legacy). */
export function expandLegacyPermissions(source: Permission[]): Permission[] {
  const next = new Set(source)
  if (source.includes('caja')) {
    next.add('corte')
    next.add('movimientos')
    next.add('anular')
  }
  if (source.includes('compras')) {
    next.add('inventario')
    next.add('ajustar')
  }
  return ALL.filter((item) => next.has(item))
}

export function resolvePermissions(user: Pick<User, 'role' | 'permissions' | 'permissionsVersion'>): Permission[] {
  const source = user.permissions ?? defaultsFor(user.role)
  const known = ALL.filter((item) => source.includes(item))
  if ((user.permissionsVersion ?? 0) >= PERMISSIONS_VERSION) return known
  // Sin versión: rol default ya viene completo; lista guardada vieja se expande.
  if (!user.permissions) return known
  return expandLegacyPermissions(known)
}

export function allows(
  user: Pick<User, 'role' | 'permissions' | 'permissionsVersion' | 'active'> | null,
  permission: Permission,
) {
  if (!user || user.active === false) return false
  return resolvePermissions(user).includes(permission)
}

export function homeFor(user: Pick<User, 'role' | 'permissions' | 'permissionsVersion' | 'active'>) {
  const permissions = resolvePermissions(user)
  return DESTINATIONS.find((item) => permissions.includes(item.permission))?.to ?? '/admin/asistencia'
}

export function permissionLabel(id: Permission) {
  return PERMISSIONS.find((item) => item.id === id)?.label ?? id
}

/** Chips cortos por grupo para la tarjeta de usuario. */
export function permissionGroupChips(permissions: Permission[]): string[] {
  return PERMISSION_GROUPS.filter((group) => group.nodes.some((node) => permissions.includes(node.id) || node.actions?.some((action) => permissions.includes(action.id)))).map(
    (group) => group.label,
  )
}

/** Enciende o apaga un módulo y, al apagar, sus acciones. */
export function toggleModule(list: Permission[], id: Permission, on: boolean): Permission[] {
  const node = PERMISSION_GROUPS.flatMap((group) => group.nodes).find((item) => item.id === id)
  const actions = node?.actions?.map((item) => item.id) ?? []
  if (on) return ALL.filter((item) => item === id || list.includes(item))
  return list.filter((item) => item !== id && !actions.includes(item))
}

/** Enciende o apaga una acción; al encender, asegura el módulo padre. */
export function toggleAction(list: Permission[], id: Permission, on: boolean): Permission[] {
  const parent = ACTION_PARENT[id]
  if (on) {
    const withParent = parent && !list.includes(parent) ? [...list, parent] : list
    return ALL.filter((item) => item === id || withParent.includes(item))
  }
  return list.filter((item) => item !== id)
}

/** Marca módulo + todas sus acciones. */
export function grantModuleAll(list: Permission[], id: Permission): Permission[] {
  const node = PERMISSION_GROUPS.flatMap((group) => group.nodes).find((item) => item.id === id)
  if (!node) return list
  const add = [node.id, ...(node.actions?.map((item) => item.id) ?? [])]
  return ALL.filter((item) => add.includes(item) || list.includes(item))
}

export { PERMISSIONS_VERSION }
