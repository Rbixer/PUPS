import type { Permission, Role, User } from './types'
import { PERMISSIONS_VERSION } from './types'

export type PermissionMeta = { id: Permission; label: string; detail: string; kind: 'module' | 'action' }

export type PermissionAction = { id: Permission; label: string; detail: string }

export type PermissionNode = {
  id: Permission
  label: string
  detail: string
  /** Ruta del panel que abre este módulo. */
  route: string
  /** Otras rutas que también cubre este permiso. */
  routes?: string[]
  /** Acciones hijas: lo sensible que se hace dentro del módulo. */
  actions?: PermissionAction[]
}

export type PermissionGroup = {
  id: string
  label: string
  nodes: PermissionNode[]
}

/** Catálogo: un permiso por cada módulo del lanzador y uno por cada acción sensible de su interior. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'operacion',
    label: 'Operación',
    nodes: [
      {
        id: 'citas',
        label: 'Citas',
        detail: 'Agenda, altas y cambios del día.',
        route: '/admin',
        actions: [
          { id: 'citas_cobrar', label: 'Cobrar al completar la cita', detail: 'Registrar el pago automático cuando una cita queda completada.' },
          { id: 'citas_cancelar', label: 'Cancelar citas', detail: 'Pasar una cita a cancelada (revierte su cobro).' },
          { id: 'costos', label: 'Cambiar precio de cita', detail: 'Editar el monto de una cita ya guardada.' },
        ],
      },
      {
        id: 'fichas',
        label: 'Fichas',
        detail: 'Historial de cada mascota.',
        route: '/admin/fichas',
        actions: [
          { id: 'fichas_fotos', label: 'Subir y quitar fotos', detail: 'Fotos de antes y después de cada visita.' },
          { id: 'fichas_publicar', label: 'Publicar fotos en el sitio', detail: 'Enviar una foto a la galería pública.' },
        ],
      },
      { id: 'clientes', label: 'Clientes', detail: 'Tutores, mascotas, visitas y compras.', route: '/admin/clientes' },
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        detail: 'Bandeja y línea del negocio.',
        route: '/admin/whatsapp',
        actions: [
          { id: 'whatsapp_enviar', label: 'Enviar mensajes', detail: 'Escribir a los clientes. Sin esto solo se lee la bandeja.' },
          { id: 'whatsapp_linea', label: 'Cambiar el número público', detail: 'El número que aparece en el sitio y en los botones de contacto.' },
        ],
      },
      {
        id: 'tareas',
        label: 'Tareas',
        detail: 'Ver y asignar tareas del equipo.',
        route: '/admin/tareas',
        actions: [{ id: 'tareas_borrar', label: 'Borrar tareas de otros', detail: 'Eliminar tareas que creó otra persona.' }],
      },
    ],
  },
  {
    id: 'caja',
    label: 'Ventas y caja',
    nodes: [
      {
        id: 'caja',
        label: 'Punto de venta',
        detail: 'Cobrar productos y servicios en mostrador.',
        route: '/admin/ventas',
        actions: [
          { id: 'pedidos_cobrar', label: 'Cobrar pedidos en línea', detail: 'Cobrar los pedidos de la tienda en la pestaña Pedidos por cobrar.' },
          { id: 'anular', label: 'Anular ventas', detail: 'Anular ventas de mostrador y cancelar pedidos.' },
        ],
      },
      {
        id: 'tienda',
        label: 'Tienda en línea',
        detail: 'Pedidos y productos del sitio.',
        route: '/admin/tienda',
        actions: [
          { id: 'tienda_precios', label: 'Crear productos y cambiar precios', detail: 'Altas y precios de lo que ve el público.' },
          { id: 'tienda_visibilidad', label: 'Mostrar u ocultar en el sitio', detail: 'Decidir qué productos salen en la portada pública.' },
        ],
      },
      { id: 'constancias', label: 'Constancias', detail: 'Constancias de visita guardadas.', route: '/admin/constancias' },
      {
        id: 'empleados',
        label: 'Compras de empleados',
        detail: 'Ventas al personal, al contado o a crédito.',
        route: '/admin/compras-empleados',
        actions: [{ id: 'empleados_credito', label: 'Vender a crédito y cobrar crédito', detail: 'Dejar saldo a un empleado y registrar sus abonos.' }],
      },
      { id: 'movimientos', label: 'Registrar ingreso', detail: 'Entradas de dinero fuera del punto de venta.', route: '/admin/ingresos' },
      { id: 'egresos', label: 'Documento de egreso', detail: 'Constancia de salida de la mascota y salidas de caja.', route: '/admin/egresos' },
      {
        id: 'corte',
        label: 'Corte de caja',
        detail: 'Cierre acumulado del día.',
        route: '/admin/corte',
        actions: [{ id: 'corte_depositos', label: 'Registrar y quitar depósitos', detail: 'Depósitos al banco dentro del corte.' }],
      },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    nodes: [
      {
        id: 'inventario',
        label: 'Inventario',
        detail: 'Existencias, kárdex y productos.',
        route: '/admin/inventario',
        actions: [
          { id: 'inventario_crear', label: 'Crear insumos y categorías', detail: 'Altas de insumos de grooming y categorías de producto.' },
          { id: 'ajustar', label: 'Ajustar existencias y costos', detail: 'Ajustes, consumos y ver o editar el costo del producto.' },
        ],
      },
    ],
  },
  {
    id: 'compras',
    label: 'Compras y gastos',
    nodes: [
      { id: 'compras', label: 'Compras y proveedores', detail: 'Compras a proveedores que alimentan el inventario.', route: '/admin/compras' },
      { id: 'gastos', label: 'Gastos y caja chica', detail: 'Gastos, pago de servicios, caja chica y gastos fijos.', route: '/admin/gastos' },
      { id: 'por_pagar', label: 'Facturas por pagar', detail: 'Registrar y pagar lo que se debe a proveedores.', route: '/admin/por-pagar' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    nodes: [
      {
        id: 'planilla',
        label: 'Planilla',
        detail: 'Pago, comisiones, metas y pasivo laboral.',
        route: '/admin/planilla',
        actions: [
          { id: 'planilla_pagar', label: 'Pagar planilla', detail: 'Registrar el pago del mes a cada trabajador.' },
          { id: 'planilla_anular', label: 'Anular planilla pagada', detail: 'Deshacer un pago de planilla ya registrado.' },
          { id: 'planilla_salarios', label: 'Ver y editar salarios', detail: 'Salarios, comisiones y metas de cada persona.' },
        ],
      },
      {
        id: 'contabilidad',
        label: 'Contabilidad',
        detail: 'Estado de resultados y balance.',
        route: '/admin/contabilidad',
        actions: [
          { id: 'conta_diario', label: 'Libro diario', detail: 'Ver el libro diario de ventas y compras.' },
          { id: 'conta_bancos', label: 'Bancos', detail: 'Depósitos y cobros por banco.' },
          { id: 'conta_impuestos', label: 'Impuestos', detail: 'IVA o régimen del mes.' },
          { id: 'conta_regimen', label: 'Cambiar el régimen fiscal', detail: 'Cambia cómo se calculan los impuestos de todo el negocio.' },
        ],
      },
      {
        id: 'estadisticas',
        label: 'Estadísticas',
        detail: 'Tablero del mes.',
        route: '/admin/estadisticas',
        actions: [{ id: 'reportes', label: 'Descargar Excel / PDF', detail: 'Exportar reportes y el libro contable.' }],
      },
      {
        id: 'control',
        label: 'Control general',
        detail: 'Resumen anual de paquetes, ingresos y gastos.',
        route: '/admin/control',
        actions: [{ id: 'control_editar', label: 'Editar cifras y meta', detail: 'Sobrescribir los valores automáticos de cada mes.' }],
      },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    nodes: [
      { id: 'asistencia_equipo', label: 'Asistencia del equipo', detail: 'Ver y corregir la asistencia de todos. Marcar la propia no necesita permiso.', route: '/admin/asistencia' },
      {
        id: 'equipo',
        label: 'Usuarios y negocio',
        detail: 'Usuarios, trabajadores, permisos y claves. Incluye la ficha de trabajadores.',
        route: '/admin/usuarios',
        routes: ['/admin/trabajadores'],
        actions: [
          { id: 'respaldo', label: 'Respaldo y restauración', detail: 'Descargar o restaurar todos los datos.' },
          { id: 'negocio', label: 'Datos del negocio y del sitio', detail: 'Dirección, horarios, contenido público y categorías.' },
        ],
      },
    ],
  },
]

export const PERMISSIONS: PermissionMeta[] = PERMISSION_GROUPS.flatMap((group) =>
  group.nodes.flatMap((node) => [
    { id: node.id, label: node.label, detail: node.detail, kind: 'module' as const },
    ...(node.actions ?? []).map((action) => ({ id: action.id, label: action.label, detail: action.detail, kind: 'action' as const })),
  ]),
)

const ALL = PERMISSIONS.map((item) => item.id)

export const NODES: PermissionNode[] = PERMISSION_GROUPS.flatMap((group) => group.nodes)

/** Padre de cada acción (para dependencias en la UI). */
export const ACTION_PARENT: Partial<Record<Permission, Permission>> = Object.fromEntries(
  NODES.flatMap((node) => (node.actions ?? []).map((action) => [action.id, node.id] as const)),
)

/** Lo que recepción ya podía hacer antes de la versión 3; se expande igual que un usuario guardado. */
const RECEPTION_V2: Permission[] = ['citas', 'fichas', 'whatsapp', 'caja', 'movimientos', 'tareas', 'estadisticas', 'reportes']

export const DESTINATIONS: { permission: Permission; to: string }[] = [
  { permission: 'citas', to: '/admin' },
  { permission: 'fichas', to: '/admin/fichas' },
  { permission: 'whatsapp', to: '/admin/whatsapp' },
  { permission: 'caja', to: '/admin/ventas' },
  { permission: 'corte', to: '/admin/corte' },
  { permission: 'movimientos', to: '/admin/ingresos' },
  { permission: 'egresos', to: '/admin/egresos' },
  { permission: 'tareas', to: '/admin/tareas' },
  { permission: 'clientes', to: '/admin/clientes' },
  { permission: 'tienda', to: '/admin/tienda' },
  { permission: 'constancias', to: '/admin/constancias' },
  { permission: 'empleados', to: '/admin/compras-empleados' },
  { permission: 'inventario', to: '/admin/inventario' },
  { permission: 'compras', to: '/admin/compras' },
  { permission: 'gastos', to: '/admin/gastos' },
  { permission: 'por_pagar', to: '/admin/por-pagar' },
  { permission: 'planilla', to: '/admin/planilla' },
  { permission: 'contabilidad', to: '/admin/contabilidad' },
  { permission: 'estadisticas', to: '/admin/estadisticas' },
  { permission: 'control', to: '/admin/control' },
  { permission: 'equipo', to: '/admin/usuarios' },
]

/**
 * Versión 1 → 2: los permisos viejos de caja y compras se partieron en ids propios.
 * Solo se aplica a listas guardadas antes de la versión 2.
 */
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

/** Quién recibía cada permiso nuevo de forma implícita antes de la versión 3: nadie pierde acceso al migrar. */
const V3_GRANTS: [Permission[], Permission[]][] = [
  [['citas'], ['citas_cancelar']],
  [['caja'], ['citas_cobrar', 'clientes', 'tienda', 'tienda_precios', 'tienda_visibilidad', 'constancias', 'empleados', 'empleados_credito', 'pedidos_cobrar']],
  [['fichas'], ['fichas_fotos']],
  [['whatsapp'], ['whatsapp_enviar', 'whatsapp_linea']],
  [['movimientos'], ['egresos']],
  [['corte'], ['corte_depositos']],
  [['inventario'], ['inventario_crear']],
  [['compras'], ['gastos', 'por_pagar']],
  [['planilla'], ['planilla_pagar', 'planilla_anular', 'planilla_salarios', 'asistencia_equipo']],
  [['contabilidad'], ['conta_diario', 'conta_bancos', 'conta_impuestos', 'conta_regimen']],
  [
    ['equipo'],
    ['control', 'control_editar', 'asistencia_equipo', 'respaldo', 'negocio', 'tareas_borrar', 'fichas_publicar', 'whatsapp_linea'],
  ],
]

/** Versión 2 → 3: reparte los permisos nuevos entre quienes ya podían hacer eso. */
export function expandV3Permissions(source: Permission[]): Permission[] {
  const next = new Set(source)
  for (const [parents, grants] of V3_GRANTS) {
    if (parents.some((parent) => source.includes(parent))) for (const id of grants) next.add(id)
  }
  return ALL.filter((item) => next.has(item))
}

const RECEPTION = expandV3Permissions(RECEPTION_V2)

/** Lo del piso: agenda y fichas de su trabajo, sus tareas y su propia asistencia (esa no pide permiso). */
const WORKER: Permission[] = ['citas', 'fichas', 'fichas_fotos', 'tareas']

export function defaultsFor(role: Role): Permission[] {
  if (role === 'Administrador') return [...ALL]
  if (role === 'Trabajador') return [...WORKER]
  return [...RECEPTION]
}

/** El administrador siempre puede todo; el resto sigue su lista, migrada por pasos si es de una versión anterior. */
export function resolvePermissions(user: Pick<User, 'role' | 'permissions' | 'permissionsVersion'>): Permission[] {
  if (user.role === 'Administrador') return [...ALL]
  if (!user.permissions) return defaultsFor(user.role)
  const known = ALL.filter((item) => user.permissions?.includes(item))
  const version = user.permissionsVersion ?? 0
  if (version >= PERMISSIONS_VERSION) return known
  return expandV3Permissions(version < 2 ? expandLegacyPermissions(known) : known)
}

export function allows(
  user: Pick<User, 'role' | 'permissions' | 'permissionsVersion' | 'active'> | null,
  permission: Permission,
) {
  if (!user || user.active === false) return false
  return resolvePermissions(user).includes(permission)
}

/** Verdadero si tiene al menos uno de los permisos. */
export function allowsAny(
  user: Pick<User, 'role' | 'permissions' | 'permissionsVersion' | 'active'> | null,
  permissions: Permission[],
) {
  return permissions.some((permission) => allows(user, permission))
}

export function homeFor(user: Pick<User, 'role' | 'permissions' | 'permissionsVersion' | 'active'>) {
  const permissions = resolvePermissions(user)
  return DESTINATIONS.find((item) => permissions.includes(item.permission))?.to ?? '/admin/asistencia'
}

export function permissionLabel(id: Permission) {
  return PERMISSIONS.find((item) => item.id === id)?.label ?? id
}

/** Módulos y acciones concretos que tiene una persona, para la tarjeta de usuario. */
export function permissionSummary(permissions: Permission[]): { label: string; extra: number }[] {
  return NODES.filter((node) => permissions.includes(node.id)).map((node) => ({
    label: node.label,
    extra: (node.actions ?? []).filter((action) => permissions.includes(action.id)).length,
  }))
}

/** Chips cortos por grupo (compatibilidad). */
export function permissionGroupChips(permissions: Permission[]): string[] {
  return PERMISSION_GROUPS.filter((group) => group.nodes.some((node) => permissions.includes(node.id) || node.actions?.some((action) => permissions.includes(action.id)))).map(
    (group) => group.label,
  )
}

/** Cuántos permisos tiene marcados un módulo (él mismo más sus acciones) y cuántos puede tener. */
export function nodeCount(permissions: Permission[], node: PermissionNode) {
  const ids = [node.id, ...(node.actions ?? []).map((action) => action.id)]
  return { on: ids.filter((id) => permissions.includes(id)).length, total: ids.length }
}

/** Módulo del catálogo que abre una ruta del panel. */
export function nodeAt(route: string): PermissionNode | undefined {
  const clean = route.replace(/\/+$/, '').toLowerCase() || '/'
  const hit = (path: string) => (path === '/admin' ? clean === '/admin' : clean === path || clean.startsWith(`${path}/`))
  const routes = NODES.flatMap((node) => [node.route, ...(node.routes ?? [])].map((path) => ({ path, node })))
  return routes.sort((a, b) => b.path.length - a.path.length).find((item) => hit(item.path))?.node
}

/** Enciende o apaga un módulo y, al apagar, sus acciones. */
export function toggleModule(list: Permission[], id: Permission, on: boolean): Permission[] {
  const node = NODES.find((item) => item.id === id)
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
  const node = NODES.find((item) => item.id === id)
  if (!node) return list
  const add = [node.id, ...(node.actions?.map((item) => item.id) ?? [])]
  return ALL.filter((item) => add.includes(item) || list.includes(item))
}

/** Quita el módulo y todas sus acciones. */
export function revokeModuleAll(list: Permission[], id: Permission): Permission[] {
  return toggleModule(list, id, false)
}

/** Ajustes que se cambian con un permiso más fino; el resto pide «Datos del negocio» (negocio). */
export const SETTING_PERMISSIONS: Record<string, Permission[]> = {
  whatsapp: ['whatsapp_linea'],
  productCategories: ['inventario_crear'],
  gallery: ['fichas_publicar'],
  controlGoal: ['control_editar'],
  taxRegime: ['conta_regimen'],
  taxHistory: ['conta_regimen'],
  cashFloat: ['caja', 'corte'],
}

export function settingAllowed(user: Parameters<typeof allows>[0], key: string) {
  return allows(user, 'negocio') || (SETTING_PERMISSIONS[key] ?? []).some((permission) => allows(user, permission))
}

export { PERMISSIONS_VERSION }
