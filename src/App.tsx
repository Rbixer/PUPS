import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { allows, homeFor } from './access'
import { MODULES_PATH } from './modules'
import { useStore } from './store'
import { InstallBanner, OfflineChip } from './components/InstallBanner'
import { NoEncontrada, PublicLayout } from './pages/PublicLayout'
import type { Permission } from './types'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

const page = <T extends Record<string, unknown>, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(() => load().then((module) => ({ default: module[name] as ComponentType })))

const AdminLayout = page(() => import('./pages/AdminLayout'), 'AdminLayout')
const Login = page(() => import('./pages/Login'), 'Login')

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
const Asistencia = page(() => import('./pages/Asistencia'), 'Asistencia')
const ComprasEmpleados = page(() => import('./pages/ComprasEmpleados'), 'ComprasEmpleados')
const Modulos = page(() => import('./pages/Modulos'), 'Modulos')

const GUARDED: { path: string; permission: Permission; element: ReactNode }[] = [
  { path: 'ventas', permission: 'caja', element: <Ventas /> },
  { path: 'corte', permission: 'caja', element: <CorteCaja /> },
  { path: 'compras-empleados', permission: 'caja', element: <ComprasEmpleados /> },
  { path: 'clientes', permission: 'caja', element: <Clientes /> },
  { path: 'compras', permission: 'compras', element: <Compras /> },
  { path: 'inventario', permission: 'compras', element: <Inventario /> },
  { path: 'gastos', permission: 'compras', element: <Gastos /> },
  { path: 'por-pagar', permission: 'compras', element: <CuentasPorPagar /> },
  { path: 'planilla', permission: 'planilla', element: <Planilla /> },
  { path: 'contabilidad', permission: 'contabilidad', element: <Contabilidad /> },
  { path: 'tareas', permission: 'tareas', element: <Tareas /> },
]


function Loading() {
  return (
    <div className="route-loading" aria-busy="true" aria-label="Cargando">
      <span />
      <span />
      <span />
    </div>
  )
}

function ToLogin() {
  const location = useLocation()
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { currentUser, booting } = useStore()
  if (!currentUser) return booting ? <Loading /> : <ToLogin />
  return children
}

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { currentUser, booting } = useStore()
  if (!currentUser) return booting ? <Loading /> : <ToLogin />
  if (!allows(currentUser, permission)) return <Navigate to={homeFor(currentUser)} replace />
  return children
}

/** El aviso de instalar y el de sin conexión son para el personal, no para los clientes del sitio. */
function StaffChrome() {
  const location = useLocation()
  if (!location.pathname.startsWith('/admin') && location.pathname !== '/login') return null
  return (
    <>
      <OfflineChip />
      <InstallBanner />
    </>
  )
}

function AdminHome() {
  const { currentUser } = useStore()
  return <Navigate to={currentUser ? MODULES_PATH : '/login'} replace />
}

function PublicTo({ path }: { path: string }) {
  const location = useLocation()
  return <Navigate to={{ pathname: path, search: location.search }} replace />
}

export function App() {
  return (
    <>
    <StaffChrome />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="servicios" element={<Servicios />} />
        <Route path="reservar" element={<Reservar />} />
        <Route path="contacto" element={<Contacto />} />
        <Route path="*" element={<NoEncontrada />} />
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
        <Route path="asistencia" element={<Asistencia />} />
        <Route path="modulos" element={<Modulos />} />
        <Route path="*" element={<AdminHome />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  )
}
