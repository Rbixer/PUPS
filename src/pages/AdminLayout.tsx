import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { Brand } from '../components/ui'
import { todayLabel } from '../format'
import { useStore } from '../store'
import type { Permission } from '../types'

const GROUPS: { label: string; links: { to: string; label: string; end: boolean; permission?: Permission }[] }[] = [
  {
    label: 'Sitio',
    links: [
      { to: '/admin/inicio', label: 'Inicio', end: false },
      { to: '/admin/servicios', label: 'Servicios', end: false },
      { to: '/admin/reservar', label: 'Reservar', end: false },
      { to: '/admin/contacto', label: 'Contacto', end: false },
    ],
  },
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
      { to: '/admin/constancias', label: 'Constancias', end: false, permission: 'caja' },
      { to: '/admin/estadisticas', label: 'Estadísticas', end: false, permission: 'estadisticas' },
    ],
  },
  {
    label: 'Equipo',
    links: [
      { to: '/admin/trabajadores', label: 'Trabajadores', end: false, permission: 'equipo' },
      { to: '/admin/control', label: 'Control general', end: false, permission: 'equipo' },
      { to: '/admin/usuarios', label: 'Usuarios', end: false, permission: 'equipo' },
    ],
  },
]

const LINKS = GROUPS.flatMap((group) => group.links)

function NavIcon({ to }: { to: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (to === '/admin') {
    return (
      <svg {...common}>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" />
      </svg>
    )
  }
  if (to === '/admin/fichas') {
    return (
      <svg {...common}>
        <path d="M7 3.5h7l5 5V20.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
        <path d="M14 3.5V9h5.5M8.5 13.5h7M8.5 17h5" />
      </svg>
    )
  }
  if (to === '/admin/inicio') {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 4.5l8 7" />
        <path d="M7 10.5V19.5h10V10.5" />
      </svg>
    )
  }
  if (to === '/admin/servicios') {
    return (
      <svg {...common}>
        <path d="M8 7.5h11M8 12h11M8 16.5h11" />
        <path d="M4.5 7.5h.01M4.5 12h.01M4.5 16.5h.01" />
      </svg>
    )
  }
  if (to === '/admin/reservar') {
    return (
      <svg {...common}>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17M12 13v4M10 15h4" />
      </svg>
    )
  }
  if (to === '/admin/contacto') {
    return (
      <svg {...common}>
        <path d="M4.5 6.5h15v11h-15z" />
        <path d="M4.5 7.5 12 13l7.5-5.5" />
      </svg>
    )
  }
  if (to === '/admin/whatsapp') {
    return (
      <svg {...common}>
        <path d="M6 17.5 4.5 20.5l3.2-1.2A8.2 8.2 0 1 0 6 17.5z" />
      </svg>
    )
  }
  if (to === '/admin/ingresos') {
    return (
      <svg {...common}>
        <path d="M12 4.5v15M7 14.5 12 19.5l5-5" />
      </svg>
    )
  }
  if (to === '/admin/egresos') {
    return (
      <svg {...common}>
        <path d="M12 19.5v-15M7 9.5 12 4.5l5 5" />
      </svg>
    )
  }
  if (to === '/admin/constancias') {
    return (
      <svg {...common}>
        <path d="M7 3.5h7l5 5V20.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
        <path d="M14 3.5V9h5.5M8.5 13.5h7M8.5 17h4" />
      </svg>
    )
  }
  if (to === '/admin/control') {
    return (
      <svg {...common}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
        <path d="M3.5 9h17M3.5 13.5h17M9 4.5v15M14.5 4.5v15" />
      </svg>
    )
  }
  if (to === '/admin/trabajadores') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="12" cy="10" r="2" />
        <path d="M8.5 16.2c.6-1.6 1.8-2.4 3.5-2.4s2.9.8 3.5 2.4" />
      </svg>
    )
  }
  if (to === '/admin/estadisticas') {
    return (
      <svg {...common}>
        <path d="M4.5 19.5h15" />
        <path d="M7.5 16.5v-4M12 16.5v-8M16.5 16.5V8" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="2.4" />
      <path d="M4.8 18.2c.7-2.4 2.4-3.6 4.2-3.6s3.5 1.2 4.2 3.6" />
      <circle cx="16.2" cy="9" r="1.8" />
      <path d="M15.2 14.6c1.4.2 2.6 1 3.3 2.4" />
    </svg>
  )
}

export function AdminLayout() {
  const { state, currentUser, logout, isAdmin, resetDemo } = useStore()
  const unread = state.conversations.reduce((sum, item) => sum + (item.unread > 0 ? 1 : 0), 0)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [armReset, setArmReset] = useState(false)
  const links = GROUPS.flatMap((group) => group.links).filter((link) => !link.permission || (currentUser ? allows(currentUser, link.permission) : false))

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
        <div className="brand-link">
          <Brand compact />
        </div>
        <nav className="side-nav" aria-label="Módulos">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}>
              <span className="side-link-label">
                <NavIcon to={link.to} />
                {link.label}
              </span>
              {link.to === '/admin/whatsapp' && unread > 0 ? <b className="nav-count">{unread}</b> : null}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <strong>{currentUser?.name}</strong>
          <span>{currentUser?.employeeCode ? `${currentUser.role} · ${currentUser.employeeCode}` : currentUser?.role}</span>
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
