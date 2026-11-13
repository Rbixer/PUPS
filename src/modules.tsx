import type { ReactNode } from 'react'
import type { Permission } from './types'

export type ModuleLink = { to: string; label: string; detail: string; end: boolean; permission?: Permission }
export type ModuleGroup = { id: string; label: string; tone: string; links: ModuleLink[] }

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'operacion',
    label: 'Operación',
    tone: '#0e9aa7',
    links: [
      { to: '/admin', label: 'Citas', detail: 'Agenda del día y del mes.', end: true, permission: 'citas' },
      { to: '/admin/fichas', label: 'Fichas', detail: 'Historial y comportamiento de cada mascota.', end: false, permission: 'fichas' },
      { to: '/admin/clientes', label: 'Clientes', detail: 'Tutores, mascotas, visitas y compras.', end: false, permission: 'caja' },
      { to: '/admin/tareas', label: 'Tareas', detail: 'Pendientes asignados al equipo.', end: false, permission: 'tareas' },
      { to: '/admin/whatsapp', label: 'WhatsApp', detail: 'Chat del negocio con los clientes.', end: false, permission: 'whatsapp' },
    ],
  },
  {
    id: 'caja',
    label: 'Ventas y caja',
    tone: '#e07a2f',
    links: [
      { to: '/admin/ventas', label: 'Punto de venta', detail: 'Cobrar productos y servicios en mostrador.', end: false, permission: 'caja' },
      { to: '/admin/tienda', label: 'Tienda en línea', detail: 'Pedidos y productos del sitio.', end: false, permission: 'caja' },
      { to: '/admin/ingresos', label: 'Registrar ingreso', detail: 'Entradas de dinero fuera del punto de venta.', end: false, permission: 'caja' },
      { to: '/admin/egresos', label: 'Documento de egreso', detail: 'Constancia de salida de la mascota y salidas de caja.', end: false, permission: 'caja' },
      { to: '/admin/corte', label: 'Corte de caja', detail: 'Cierre acumulado y depósitos al banco.', end: false, permission: 'caja' },
      { to: '/admin/compras-empleados', label: 'Compras de empleados', detail: 'Al contado o con descuento en planilla.', end: false, permission: 'caja' },
      { to: '/admin/constancias', label: 'Constancias', detail: 'Constancias de visita guardadas.', end: false, permission: 'caja' },
    ],
  },
  {
    id: 'compras',
    label: 'Compras y gastos',
    tone: '#7a5cc8',
    links: [
      { to: '/admin/compras', label: 'Compras', detail: 'Compras a proveedores que alimentan el inventario.', end: false, permission: 'compras' },
      { to: '/admin/inventario', label: 'Inventario', detail: 'Existencias para venta e insumos de grooming.', end: false, permission: 'compras' },
      { to: '/admin/gastos', label: 'Gastos', detail: 'Caja chica, rubros y pago de servicios.', end: false, permission: 'compras' },
      { to: '/admin/por-pagar', label: 'Facturas por pagar', detail: 'Lo que se debe a proveedores.', end: false, permission: 'compras' },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    tone: '#2e9a6a',
    links: [
      { to: '/admin/planilla', label: 'Planilla', detail: 'Pago, comisiones, metas y pasivo laboral.', end: false, permission: 'planilla' },
      { to: '/admin/contabilidad', label: 'Contabilidad', detail: 'Libro diario, resultados, balance e impuestos.', end: false, permission: 'contabilidad' },
      { to: '/admin/estadisticas', label: 'Estadísticas', detail: 'Cómo va el mes en números.', end: false, permission: 'estadisticas' },
      { to: '/admin/control', label: 'Control general', detail: 'Resumen anual de paquetes, ingresos y gastos.', end: false, permission: 'equipo' },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    tone: '#3a6fd6',
    links: [
      { to: '/admin/asistencia', label: 'Asistencia', detail: 'Marcar entrada y salida, y ver tu meta.', end: false },
      { to: '/admin/trabajadores', label: 'Trabajadores', detail: 'Datos, salario y metas de cada persona.', end: false, permission: 'equipo' },
      { to: '/admin/usuarios', label: 'Usuarios', detail: 'Accesos, permisos y datos del negocio.', end: false, permission: 'equipo' },
    ],
  },
]

export const MODULES_PATH = '/admin/modulos'

const ALL_LINKS = MODULE_GROUPS.flatMap((group) => group.links.map((link) => ({ ...link, group })))

export function moduleAt(pathname: string) {
  return ALL_LINKS.find((link) => (link.end ? pathname === link.to : pathname.startsWith(link.to)))
}

const PATHS: Record<string, ReactNode> = {
  '/admin': (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" />
    </>
  ),
  '/admin/fichas': (
    <>
      <path d="M7 3.5h7l5 5V20.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V9h5.5M8.5 13.5h7M8.5 17h5" />
    </>
  ),
  '/admin/whatsapp': <path d="M6 17.5 4.5 20.5l3.2-1.2A8.2 8.2 0 1 0 6 17.5z" />,
  '/admin/tienda': (
    <>
      <path d="M6 8.5h12l-1 11h-10l-1-11z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
  '/admin/ingresos': <path d="M12 4.5v15M7 14.5 12 19.5l5-5" />,
  '/admin/egresos': <path d="M12 19.5v-15M7 9.5 12 4.5l5 5" />,
  '/admin/constancias': (
    <>
      <path d="M7 3.5h7l5 5V20.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V9h5.5M8.5 13.5h7M8.5 17h4" />
    </>
  ),
  '/admin/control': (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9h17M3.5 13.5h17M9 4.5v15M14.5 4.5v15" />
    </>
  ),
  '/admin/trabajadores': (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="12" cy="10" r="2" />
      <path d="M8.5 16.2c.6-1.6 1.8-2.4 3.5-2.4s2.9.8 3.5 2.4" />
    </>
  ),
  '/admin/clientes': (
    <>
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 19.5c.9-3.2 3.4-4.8 6.5-4.8s5.6 1.6 6.5 4.8" />
    </>
  ),
  '/admin/tareas': (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="m8 12 2.6 2.6L16 9.2" />
    </>
  ),
  '/admin/ventas': (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.6" />
      <path d="M8 20h8M12 16v4M7 9.5h4" />
    </>
  ),
  '/admin/corte': (
    <>
      <rect x="3.5" y="7" width="17" height="11" rx="1.6" />
      <circle cx="12" cy="12.5" r="2.4" />
      <path d="M6.5 4.5h11" />
    </>
  ),
  '/admin/compras': (
    <>
      <path d="M4 5h2l2 10h10l2-7H7" />
      <circle cx="9.5" cy="19" r="1.3" />
      <circle cx="16.5" cy="19" r="1.3" />
    </>
  ),
  '/admin/inventario': (
    <>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" />
      <path d="M4 8l8 4.5L20 8M12 12.5v8" />
    </>
  ),
  '/admin/gastos': (
    <>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </>
  ),
  '/admin/por-pagar': (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9.5h17M7 15h4" />
    </>
  ),
  '/admin/planilla': (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5M16 7.5h4.5M16 11h4.5M17.5 14.5h3" />
    </>
  ),
  '/admin/asistencia': (
    <>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8v4.5l3 2M9.5 2.5h5" />
    </>
  ),
  '/admin/compras-empleados': (
    <>
      <path d="M6 8.5h12l-1 11h-10l-1-11z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5M9.5 14.5h5" />
    </>
  ),
  '/admin/contabilidad': (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 7.5h7M8.5 11.5h2M13.5 11.5h2M8.5 15h2M13.5 15h2" />
    </>
  ),
  '/admin/estadisticas': (
    <>
      <path d="M4.5 19.5h15" />
      <path d="M7.5 16.5v-4M12 16.5v-8M16.5 16.5V8" />
    </>
  ),
}

const PEOPLE = (
  <>
    <circle cx="9" cy="8" r="2.4" />
    <path d="M4.8 18.2c.7-2.4 2.4-3.6 4.2-3.6s3.5 1.2 4.2 3.6" />
    <circle cx="16.2" cy="9" r="1.8" />
    <path d="M15.2 14.6c1.4.2 2.6 1 3.3 2.4" />
  </>
)

export function ModuleIcon({ to, size = 16 }: { to: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[to] ?? PEOPLE}
    </svg>
  )
}
