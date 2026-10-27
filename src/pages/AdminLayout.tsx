import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { CommandPalette, type PaletteLink } from '../components/CommandPalette'
import { Icon, routeIcon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { Brand } from '../components/ui'
import { todayLabel } from '../format'
import { usePwa } from '../pwa'
import { useStore } from '../store'
import { useTheme } from '../theme'
import type { Permission } from '../types'

type NavItem = { to: string; label: string; end: boolean; permission?: Permission }

const GROUPS: { label: string; collapsible?: boolean; links: NavItem[] }[] = [
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
  {
    label: 'Sitio',
    collapsible: true,
    links: [
      { to: '/admin/inicio', label: 'Inicio', end: false },
      { to: '/admin/servicios', label: 'Servicios', end: false },
      { to: '/admin/reservar', label: 'Reservar', end: false },
      { to: '/admin/contacto', label: 'Contacto', end: false },
    ],
  },
]

const ALL_LINKS = GROUPS.flatMap((group) => group.links)
const TAB_ORDER = ['/admin', '/admin/fichas', '/admin/whatsapp', '/admin/ingresos', '/admin/estadisticas']
const TAB_LABEL: Record<string, string> = { '/admin/ingresos': 'Caja' }

function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Cargando módulo">
      <div className="skeleton" style={{ height: 56, width: '38%', marginTop: 20 }} />
      <div className="kpis">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton" style={{ height: 96, borderRadius: 20 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />
    </div>
  )
}

function groupActive(links: NavItem[], pathname: string) {
  return links.some((link) => (link.end ? pathname === link.to : pathname.startsWith(link.to)))
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'P'
}

export function AdminLayout() {
  const { state, currentUser, logout, isAdmin, resetDemo } = useStore()
  const { resolved, toggle } = useTheme()
  const pwa = usePwa()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [armReset, setArmReset] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [siteOpen, setSiteOpen] = useState(false)

  const unread = state.conversations.reduce((sum, item) => sum + (item.unread > 0 ? 1 : 0), 0)
  const visibleGroups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        links: group.links.filter((link) => !link.permission || (currentUser ? allows(currentUser, link.permission) : false)),
      })).filter((group) => group.links.length > 0),
    [currentUser],
  )
  const links = useMemo(() => visibleGroups.flatMap((group) => group.links), [visibleGroups])
  const tabs = useMemo(() => TAB_ORDER.map((to) => links.find((link) => link.to === to)).filter((link): link is NavItem => Boolean(link)).slice(0, 4), [links])

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    const current = ALL_LINKS.find((link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)))
    document.title = `${current?.label ?? 'Panel'} · PUP'S`
  }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette((value) => !value)
      } else if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!armReset) return
    const timer = window.setTimeout(() => setArmReset(false), 4000)
    return () => window.clearTimeout(timer)
  }, [armReset])

  const installApp = useCallback(() => {
    if (pwa.canInstall) void pwa.install()
    else if (pwa.ios) {
      toast.push({
        title: 'Instalar en iPhone o iPad',
        text: 'Toca Compartir y luego “Añadir a pantalla de inicio”.',
        duration: 9000,
      })
    }
  }, [pwa, toast])

  const showInstall = !pwa.standalone && (pwa.canInstall || pwa.ios)

  const paletteLinks = useMemo<PaletteLink[]>(
    () =>
      visibleGroups.flatMap((group) => group.links.map((link) => ({ to: link.to, label: link.label, icon: routeIcon(link.to), group: group.label }))),
    [visibleGroups],
  )
  const paletteExtra = useMemo(() => {
    const extra: { id: string; title: string; hint?: string; icon: 'sun' | 'moon' | 'download' | 'logout'; run: () => void }[] = [
      { id: 'theme', title: resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro', hint: 'Apariencia', icon: resolved === 'dark' ? 'sun' : 'moon', run: toggle },
    ]
    if (showInstall) extra.push({ id: 'install', title: 'Instalar la app', hint: 'Añadir a la pantalla de inicio', icon: 'download', run: installApp })
    extra.push({
      id: 'logout',
      title: 'Cerrar sesión',
      icon: 'logout',
      run: () => {
        logout()
        navigate('/login')
      },
    })
    return extra
  }, [resolved, toggle, showInstall, installApp, logout, navigate])

  const sideClass = open ? 'side open' : 'side'

  return (
    <div className="admin">
      <aside className={sideClass} aria-label="Navegación principal">
        <div className="side-top">
          <div className="brand-link">
            <Brand compact />
          </div>
          <button type="button" className="side-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <button type="button" className="side-search" onClick={() => setPalette(true)}>
          <Icon name="search" size={16} />
          <span>Buscar…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav className="side-nav" aria-label="Módulos">
          {visibleGroups.map((group) => (
            <div key={group.label} className="side-group">
              {group.collapsible ? (
                <button type="button" className="side-group-label toggle" aria-expanded={siteOpen || groupActive(group.links, location.pathname)} onClick={() => setSiteOpen((value) => !value)}>
                  {group.label}
                  <Icon name="arrowRight" size={12} strokeWidth={2.2} />
                </button>
              ) : (
                <p className="side-group-label">{group.label}</p>
              )}
              {(group.collapsible && !siteOpen && !groupActive(group.links, location.pathname) ? [] : group.links).map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}>
                  <span className="side-link-label">
                    <Icon name={routeIcon(link.to)} size={18} />
                    {link.label}
                  </span>
                  {link.to === '/admin/whatsapp' && unread > 0 ? <b className="nav-count">{unread}</b> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-tools">
            <button type="button" className="side-tool" onClick={toggle} aria-label={resolved === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}>
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={16} />
              {resolved === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
            {showInstall ? (
              <button type="button" className="side-tool install" onClick={installApp}>
                <Icon name="download" size={16} />
                Instalar app
              </button>
            ) : null}
          </div>
          <div className="who">
            <span className="who-avatar" aria-hidden="true">
              {initials(currentUser?.name ?? '')}
            </span>
            <strong>{currentUser?.name}</strong>
            <span>{currentUser?.employeeCode ? `${currentUser.role} · ${currentUser.employeeCode}` : currentUser?.role}</span>
            <span className="who-date">{todayLabel()}</span>
            <div className="who-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
              >
                <Icon name="logout" size={15} />
                Salir
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
                    toast.push({ title: 'Demostración restaurada', text: 'Se cargaron de nuevo los datos de ejemplo.', tone: 'success' })
                  }}
                >
                  {armReset ? 'Confirmar restauración' : 'Restaurar demostración'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
      {open ? <button type="button" className="scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} /> : null}

      <div className={scrolled ? 'admin-main scrolled' : 'admin-main'}>
        <div className="mobile-bar">
          <button type="button" className="mobile-icon" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" size={20} />
          </button>
          <Brand compact />
          <button type="button" className="mobile-icon" aria-label="Buscar" onClick={() => setPalette(true)}>
            <Icon name="search" size={19} />
          </button>
          <button type="button" className="mobile-icon" aria-label={resolved === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} onClick={toggle}>
            <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
        {!pwa.online ? (
          <div className="pwa-strip" role="status">
            <i />
            Sin conexión. Seguimos guardando todo en este dispositivo.
          </div>
        ) : null}
        <div className="page-wrap" key={location.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </div>

      <nav className="tabbar" aria-label="Accesos rápidos">
        {tabs.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            <Icon name={routeIcon(link.to)} size={22} />
            {TAB_LABEL[link.to] ?? link.label}
            {link.to === '/admin/whatsapp' && unread > 0 ? <b className="nav-count">{unread}</b> : null}
          </NavLink>
        ))}
        <button type="button" className="tab" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
          Más
        </button>
      </nav>

      {palette ? <CommandPalette links={paletteLinks} extra={paletteExtra} onClose={() => setPalette(false)} /> : null}
    </div>
  )
}
