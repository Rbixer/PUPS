import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { allows, homeFor } from './access'
import { useStore } from './store'
import type { Permission } from './types'
import type { ReactNode } from 'react'
import { Login } from './pages/Login'

const AdminLayout = lazy(() => import('./pages/AdminLayout').then((module) => ({ default: module.AdminLayout })))
const Citas = lazy(() => import('./pages/Citas').then((module) => ({ default: module.Citas })))
const Egresos = lazy(() => import('./pages/Egresos').then((module) => ({ default: module.Egresos })))
const Constancias = lazy(() => import('./pages/Constancias').then((module) => ({ default: module.Constancias })))
const Estadisticas = lazy(() => import('./pages/Estadisticas').then((module) => ({ default: module.Estadisticas })))
const Fichas = lazy(() => import('./pages/Fichas').then((module) => ({ default: module.Fichas })))
const Ingresos = lazy(() => import('./pages/Ingresos').then((module) => ({ default: module.Ingresos })))
const Contacto = lazy(() => import('./pages/Contacto').then((module) => ({ default: module.Contacto })))
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })))
const Reservar = lazy(() => import('./pages/Reservar').then((module) => ({ default: module.Reservar })))
const Servicios = lazy(() => import('./pages/Servicios').then((module) => ({ default: module.Servicios })))
const ControlGeneral = lazy(() => import('./pages/ControlGeneral').then((module) => ({ default: module.ControlGeneral })))
const Trabajadores = lazy(() => import('./pages/Trabajadores').then((module) => ({ default: module.Trabajadores })))
const Usuarios = lazy(() => import('./pages/Usuarios').then((module) => ({ default: module.Usuarios })))
const WhatsApp = lazy(() => import('./pages/WhatsApp').then((module) => ({ default: module.WhatsApp })))

function Loading() {
  return (
    <div className="boot" role="status" aria-label="Cargando">
      <img src="/logo.png" alt="" />
      <div className="boot-bar" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { currentUser } = useStore()
  const location = useLocation()
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { currentUser } = useStore()
  const location = useLocation()
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
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
    <Suspense fallback={<Loading />}>
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
          <Route
            path="inicio"
            element={
              <div className="site-module">
                <Home />
              </div>
            }
          />
          <Route
            path="servicios"
            element={
              <div className="site-module">
                <Servicios />
              </div>
            }
          />
          <Route
            path="reservar"
            element={
              <div className="site-module">
                <Reservar />
              </div>
            }
          />
          <Route
            path="contacto"
            element={
              <div className="site-module">
                <Contacto />
              </div>
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
          <Route path="sin-acceso" element={<SinAcceso />} />
        </Route>
        <Route path="*" element={<Entrada />} />
      </Routes>
    </Suspense>
  )
}
