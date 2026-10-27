import { Navigate, Route, Routes } from 'react-router-dom'
import { allows, homeFor } from './access'
import { useStore } from './store'
import { InstallBanner, OfflineChip } from './components/InstallBanner'
import { AdminLayout } from './pages/AdminLayout'
import { Login } from './pages/Login'
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

function Entrada() {
  const { currentUser } = useStore()
  return <Navigate to={currentUser ? '/admin' : '/login'} replace />
}

export function App() {
  return (
    <>
    <OfflineChip />
    <InstallBanner />
    <Routes>
      <Route index element={<Entrada />} />
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
        <Route path="inicio" element={<div className="site-module"><Home /></div>} />
        <Route path="servicios" element={<div className="site-module"><Servicios /></div>} />
        <Route path="reservar" element={<div className="site-module"><Reservar /></div>} />
        <Route path="contacto" element={<div className="site-module"><Contacto /></div>} />
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
        <Route path="sin-acceso" element={<SinAcceso />} />
      </Route>
      <Route path="*" element={<Entrada />} />
    </Routes>
    </>
  )
}
