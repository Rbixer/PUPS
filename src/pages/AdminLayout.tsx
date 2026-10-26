import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { Brand } from '../components/ui'
import { todayLabel } from '../format'
import { useStore } from '../store'
import type { Permission } from '../types'

const GROUPS: { label: string; links: { to: string; label: string; end: boolean; permission: Permission }[] }[] = [
  {
    label: 'Operación',
    links: [
      { to: '/admin', label: 'Citas', end: true, permission: 'citas' },
      { to: '/admin/fichas', label: 'Fichas', end: false, permission: 'fichas' },
      { to: '/admin/whatsapp', label: 'WhatsApp', end: false, permission: 'whatsapp' },
    ],
  },
  {
    label: 'Caja',
    links: [
      { to: '/admin/ingresos', label: 'Registrar ingreso', end: false, permission: 'caja' },
      { to: '/admin/egresos', label: 'Documento de egreso', end: false, permission: 'caja' },
      { to: '/admin/estadisticas', label: 'Estadísticas', end: false, permission: 'estadisticas' },
    ],
  },
  {
    label: 'Equipo',
    links: [{ to: '/admin/usuarios', label: 'Usuarios', end: false, permission: 'equipo' }],
  },
]

const LINKS = GROUPS.flatMap((group) => group.links)

export function AdminLayout() {
  const { state, currentUser, logout, isAdmin, resetDemo } = useStore()
  const unread = state.conversations.reduce((sum, item) => sum + (item.unread > 0 ? 1 : 0), 0)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [armReset, setArmReset] = useState(false)
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => (currentUser ? allows(currentUser, link.permission) : false)),
  })).filter((group) => group.links.length > 0)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const current = LINKS.find((link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)))
    document.title = `${current?.label ?? 'Panel'} · PUP'S`
  }, [location.pathname])

  return (
    <div className="admin">
      <div className="mobile-bar">
        <button type="button" className="nav-toggle" aria-label="Abrir menú" onClick={() => setOpen(true)}>
          <span />
          <span />
        </button>
        <Brand compact />
      </div>
      {open ? <button type="button" className="scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} /> : null}
      <aside className={open ? 'side open' : 'side'}>
        <NavLink to="/" className="brand-link" aria-label="Volver al sitio">
          <Brand />
        </NavLink>
        <p className="side-kicker">Panel de administración</p>
        <nav className="side-nav" aria-label="Módulos">
          {groups.map((group) => (
            <div key={group.label} className="side-group">
              <p>{group.label}</p>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}>
                  {link.label}
                  {link.to === '/admin/whatsapp' && unread > 0 ? <b className="nav-count">{unread}</b> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="who">
          <strong>{currentUser?.name}</strong>
          <span>{currentUser?.role}</span>
          <span className="who-date">{todayLabel()}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Cerrar sesión
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                if (!armReset) {
                  setArmReset(true)
                  return
                }
                resetDemo()
                setArmReset(false)
              }}
            >
              {armReset ? 'Confirmar restauración' : 'Restaurar demostración'}
            </button>
          ) : null}
        </div>
      </aside>
      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  )
}
