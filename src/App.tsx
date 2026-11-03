import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { allows, homeFor } from './access'
import { useStore } from './store'
import { InstallBanner, OfflineChip } from './components/InstallBanner'
import { AdminLayout } from './pages/AdminLayout'
import { Login } from './pages/Login'
import { PublicLayout } from './pages/PublicLayout'
import type { Permission } from './types'
import { lazy, type ComponentType, type ReactNode } from 'react'

const page = <T extends Record<string, unknown>, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(() => load().then((module) => ({ default: module[name] as ComponentType })))

const Citas = page(() => import('./pages/Citas'), 'Citas')
const Egresos = page(() => import('./pages/Egresos'), 'Egresos')
const Constancias = page(() => import('./pages/Constancias'), 'Constancias')
const Estadisticas = page(() => import('./pages/Estadisticas'), 'Estadisticas')
const Fichas = page(() => import('./pages/Fichas'), 'Fichas')
const Ingresos = page(() => import('./pages/Ingresos'), 'Ingresos')
const Contacto = page(() => import('./pages/Contacto'), 'Contacto')
const Home = page(() => import('./pages/Home'), 'Home')
const Reservar = page(() => import('./pages/Reservar'), 'Reservar')
const Servicios = page(() => import('./pages/Servicios'), 'Servicios')
const ControlGeneral = page(() => import('./pages/ControlGeneral'), 'ControlGeneral')
const Trabajadores = page(() => import('./pages/Trabajadores'), 'Trabajadores')
const Usuarios = page(() => import('./pages/Usuarios'), 'Usuarios')
const WhatsApp = page(() => import('./pages/WhatsApp'), 'WhatsApp')
const Tienda = page(() => import('./pages/Tienda'), 'Tienda')
const Ventas = page(() => import('./pages/Ventas'), 'Ventas')
const CorteCaja = page(() => import('./pages/CorteCaja'), 'CorteCaja')
const Clientes = page(() => import('./pages/Clientes'), 'Clientes')
const Compras = page(() => import('./pages/Compras'), 'Compras')
const Inventario = page(() => import('./pages/Inventario'), 'Inventario')
const Gastos = page(() => import('./pages/Gastos'), 'Gastos')
const CuentasPorPagar = page(() => import('./pages/CuentasPorPagar'), 'CuentasPorPagar')
const Planilla = page(() => import('./pages/Planilla'), 'Planilla')
const Contabilidad = page(() => import('./pages/Contabilidad'), 'Contabilidad')
const Tareas = page(() => import('./pages/Tareas'), 'Tareas')

const GUARDED: { path: string; permission: Permission; element: ReactNode }[] = [
  { path: 'ventas', permission: 'caja', element: <Ventas /> },
  { path: 'corte', permission: 'caja', element: <CorteCaja /> },
  { path: 'clientes', permission: 'caja', element: <Clientes /> },
  { path: 'compras', permission: 'compras', element: <Compras /> },
  { path: 'inventario', permission: 'compras', element: <Inventario /> },
  { path: 'gastos', permission: 'compras', element: <Gastos /> },
  { path: 'por-pagar', permission: 'compras', element: <CuentasPorPagar /> },
  { path: 'planilla', permission: 'planilla', element: <Planilla /> },
  { path: 'contabilidad', permission: 'contabilidad', element: <Contabilidad /> },
  { path: 'tareas', permission: 'tareas', element: <Tareas /> },
]


function RequireAuth({ children }: { children: ReactNode }) {
  const { currentUser } = useStore()
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { currentUser } = useStore()
  if (!currentUser) return <Navigate to="/login" replace />
  if (!allows(currentUser, permission)) return <Navigate to={homeFor(currentUser)} replace />
  return children
}

function SinAcceso() {
  const { currentUser } = useStore()
  if (currentUser && homeFor(currentUser) !== '/admin/sin-acceso') return <Navigate to={homeFor(currentUser)} replace />
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Acceso</p>
          <h1>Sin módulos</h1>
        </div>
      </header>
      <p className="empty">Tu usuario no tiene módulos asignados. Un administrador puede marcarlos en Equipo.</p>
    </section>
  )
}

function PublicTo({ path }: { path: string }) {
  const location = useLocation()
  return <Navigate to={{ pathname: path, search: location.search }} replace />
}

export function App() {
  return (
    <>
    <OfflineChip />
    <InstallBanner />
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="servicios" element={<Servicios />} />
        <Route path="reservar" element={<Reservar />} />
        <Route path="contacto" element={<Contacto />} />
      </Route>
      <Route path="admin/inicio" element={<PublicTo path="/" />} />
      <Route path="admin/servicios" element={<PublicTo path="/servicios" />} />
      <Route path="admin/reservar" element={<PublicTo path="/reservar" />} />
      <Route path="admin/contacto" element={<PublicTo path="/contacto" />} />
      <Route path="login" element={<Login />} />
      <Route
        path="admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <Guard permission="citas">
              <Citas />
            </Guard>
          }
        />
        <Route
          path="fichas"
          element={
            <Guard permission="fichas">
              <Fichas />
            </Guard>
          }
        />
        <Route
          path="fichas/:petKey"
          element={
            <Guard permission="fichas">
              <Fichas />
            </Guard>
          }
        />
        <Route
          path="whatsapp"
          element={
            <Guard permission="whatsapp">
              <WhatsApp />
            </Guard>
          }
        />
        <Route
          path="trabajadores"
          element={
            <Guard permission="equipo">
              <Trabajadores />
            </Guard>
          }
        />
        <Route
          path="control"
          element={
            <Guard permission="equipo">
              <ControlGeneral />
            </Guard>
          }
        />
        <Route
          path="usuarios"
          element={
            <Guard permission="equipo">
              <Usuarios />
            </Guard>
          }
        />
        <Route
          path="estadisticas"
          element={
            <Guard permission="estadisticas">
              <Estadisticas />
            </Guard>
          }
        />
        <Route
          path="tienda"
          element={
            <Guard permission="caja">
              <Tienda />
            </Guard>
          }
        />
        <Route
          path="ingresos"
          element={
            <Guard permission="caja">
              <Ingresos />
            </Guard>
          }
        />
        <Route
          path="egresos"
          element={
            <Guard permission="caja">
              <Egresos />
            </Guard>
          }
        />
        <Route
          path="constancias"
          element={
            <Guard permission="caja">
              <Constancias />
            </Guard>
          }
        />
        {GUARDED.map((item) => (
          <Route key={item.path} path={item.path} element={<Guard permission={item.permission}>{item.element}</Guard>} />
        ))}
        <Route path="sin-acceso" element={<SinAcceso />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
