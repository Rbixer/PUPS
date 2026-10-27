import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { allows, homeFor } from './access'
import { InstallBanner, OfflineChip } from './components/InstallBanner'
import { useStore } from './store'
import { AdminLayout } from './pages/AdminLayout'
import { Citas } from './pages/Citas'
import { Egresos } from './pages/Egresos'
import { Constancias } from './pages/Constancias'
import { Estadisticas } from './pages/Estadisticas'
import { Fichas } from './pages/Fichas'
import { Ingresos } from './pages/Ingresos'
import { Contacto } from './pages/Contacto'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { PublicLayout } from './pages/PublicLayout'
import { Reservar } from './pages/Reservar'
import { Servicios } from './pages/Servicios'
import { ControlGeneral } from './pages/ControlGeneral'
import { Trabajadores } from './pages/Trabajadores'
import { Usuarios } from './pages/Usuarios'
import { WhatsApp } from './pages/WhatsApp'
import type { Permission } from './types'
import type { ReactNode } from 'react'

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

function NoEncontrado() {
  return (
    <section className="section page">
      <p className="eyebrow">404</p>
      <h2>Esa página no está en la tienda.</h2>
      <p className="lede">El panel, los servicios y la reserva siguen en su lugar.</p>
      <Link to="/" className="btn btn-primary">
        Volver al inicio
      </Link>
    </section>
  )
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
        <Route path="*" element={<NoEncontrado />} />
      </Route>
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
    </Routes>
    </>
  )
}
