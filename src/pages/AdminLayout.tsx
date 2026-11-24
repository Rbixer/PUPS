import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { alertBadges } from '../alerts'
import { saveBackupFile } from '../backup'
import { CommandPalette, type Command } from '../components/CommandPalette'
import { NoticeBar } from '../components/NoticeBar'
import { PermissionsBar } from '../components/PermissionsBar'
import { initials } from '../format'
import { ACCOUNTING_LINKS, linkAllowed, MODULE_GROUPS, MODULES_PATH, ModuleIcon, moduleAt, normalizePath } from '../modules'
import { usePanelTheme } from '../theme'
import { useStore } from '../store'

function Icon({ name }: { name: 'grid' | 'search' | 'logout' | 'back' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'back':
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...common} width={18} height={18}>
          <rect x="4" y="4" width="4" height="4" rx="1" />
          <rect x="10" y="4" width="4" height="4" rx="1" />
          <rect x="16" y="4" width="4" height="4" rx="1" />
          <rect x="4" y="10" width="4" height="4" rx="1" />
          <rect x="10" y="10" width="4" height="4" rx="1" />
          <rect x="16" y="10" width="4" height="4" rx="1" />
          <rect x="4" y="16" width="4" height="4" rx="1" />
          <rect x="10" y="16" width="4" height="4" rx="1" />
          <rect x="16" y="16" width="4" height="4" rx="1" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
        </svg>
      )
  }
}

/** Atajo de la paleta de comandos: ⌘K en Mac y iOS, Ctrl K en el resto. */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

export function AdminLayout() {
  const { state, currentUser, logout, exportBackup, unsynced } = useStore()
  const badges = alertBadges(state, currentUser)
  const navigate = useNavigate()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  usePanelTheme()
  const [palette, setPalette] = useState(false)
  const links = [
    ...MODULE_GROUPS.flatMap((group) => group.links),
    ...ACCOUNTING_LINKS,
  ].filter((link) => {
    if (!link.permission && !link.anyOf) return true
    if (!currentUser) return false
    return linkAllowed(link, (permission) => allows(currentUser, permission))
  })
  const current = moduleAt(location.pathname)
  const path = normalizePath(location.pathname)
  const onLauncher = path === MODULES_PATH
  const pending = Object.values(badges).reduce((sum, value) => sum + value, 0)
  const inAccounting = current?.group.id === 'contabilidad-hub'
  /** Una ruta más profunda que el módulo (por ejemplo la ficha de una mascota) es un detalle del módulo. */
  const detail = current && !current.end && path.length > current.to.length ? 'Detalle' : null
  /** Si el grupo se llama igual que su único módulo (Inventario), la miga del medio sobra. */
  const showGroup = current ? !(current.group.links.length === 1 && current.group.label === current.label) : false
  const showCrumbs = Boolean(current) && !onLauncher
  const parent = detail && current ? current.to : inAccounting ? '/admin/contabilidad' : MODULES_PATH

  /** Atrás vuelve a la pantalla anterior; si se entró directo a esta página, sube un nivel. */
  function goBack() {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) navigate(-1)
    else navigate(parent)
  }

  function leave() {
    if (unsynced && !window.confirm('Hay cambios que todavía no llegan al servidor. Si sales ahora se guardan en este equipo y se envían al volver a entrar. ¿Salir?')) return
    logout()
    navigate('/login')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands: Command[] = [
    { id: 'go-modulos', label: 'Módulos', group: 'Ir a', keywords: 'inicio menú aplicaciones', run: () => navigate(MODULES_PATH) },
    ...links.map((link) => ({ id: `go-${link.to}`, label: link.label, group: 'Ir a', run: () => navigate(link.to) })),
    ...(currentUser && allows(currentUser, 'respaldo')
      ? [
          {
            id: 'backup',
            label: 'Descargar respaldo de datos',
            group: 'Acción',
            keywords: 'copia seguridad exportar',
            run: () => {
              const data = exportBackup()
              if (data) saveBackupFile(data)
            },
          },
        ]
      : []),
    {
      id: 'logout',
      label: 'Cerrar sesión',
      group: 'Acción',
      keywords: 'salir',
      run: leave,
    },
  ]

  useEffect(() => {
    if (!onLauncher) document.title = `${current?.label ?? 'Panel'} · PUP'S`
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname, current?.label, onLauncher])

  return (
    <div className={showCrumbs ? 'admin has-crumbs' : 'admin'}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <Link to={MODULES_PATH} className="topbar-apps" aria-label="Módulos" title="Módulos" aria-current={onLauncher ? 'page' : undefined}>
          <Icon name="grid" />
          {!onLauncher && pending ? <b aria-label={`${pending} pendientes`}>{pending}</b> : null}
        </Link>
        <Link to={MODULES_PATH} className="topbar-brand" aria-label="PUP'S, ir a módulos">
          <img src="/logo.png" alt="" width={28} height={28} />
          <span>PUP'S</span>
        </Link>
        {current ? (
          <span className="topbar-current" style={{ '--tone': current.group.tone } as CSSProperties}>
            <span className="topbar-current-icon">
              <ModuleIcon to={current.to} size={14} />
            </span>
            <span className="topbar-current-label">{current.label}</span>
          </span>
        ) : null}
        <div className="topbar-tools">
          <button type="button" className="topbar-search" onClick={() => setPalette(true)} aria-label="Buscar o ir a">
            <Icon name="search" />
            <span>Buscar o ir a…</span>
            <kbd>{SHORTCUT}</kbd>
          </button>
          {unsynced ? <span className="topbar-sync">Cambios por enviar…</span> : null}
          <span className="topbar-user" title={currentUser?.employeeCode ? `${currentUser.role} · ${currentUser.employeeCode}` : currentUser?.role}>
            <span className="topbar-avatar">{initials(currentUser?.name, 'P')}</span>
            <span className="topbar-user-name">{currentUser?.name}</span>
          </span>
          <button type="button" className="topbar-btn topbar-logout" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={leave}>
            <Icon name="logout" />
          </button>
        </div>
      </header>
      {current && showCrumbs ? (
        <nav className="crumbs" aria-label="Ruta de navegación">
          <button type="button" className="crumbs-back" onClick={goBack}>
            <Icon name="back" />
            <span>Atrás</span>
          </button>
          <ol>
            <li>
              <Link to={MODULES_PATH}>Módulos</Link>
            </li>
            {showGroup ? (
              <li>{inAccounting ? <Link to="/admin/contabilidad">Contabilidad</Link> : <span>{current.group.label}</span>}</li>
            ) : null}
            <li>
              {detail ? (
                <Link to={current.to}>{current.label}</Link>
              ) : (
                <span aria-current="page">{current.label}</span>
              )}
            </li>
            {detail ? (
              <li>
                <span aria-current="page">{detail}</span>
              </li>
            ) : null}
          </ol>
        </nav>
      ) : null}
      <main id="contenido" className="admin-main" ref={mainRef} tabIndex={-1}>
        <NoticeBar />
        <PermissionsBar />
        <Suspense
          fallback={
            <div className="route-loading" aria-busy="true" aria-label="Cargando">
              <span />
              <span />
              <span />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <CommandPalette commands={commands} open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
