import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { alertBadges } from '../alerts'
import { saveBackupFile } from '../backup'
import { AlertsBanner } from '../components/AlertsBanner'
import { BackupReminder } from '../components/BackupReminder'
import { CommandPalette, type Command } from '../components/CommandPalette'
import { Field } from '../components/ui'
import { initials } from '../format'
import { MODULE_GROUPS, MODULES_PATH, ModuleIcon, moduleAt } from '../modules'
import { applyTheme, readTheme, resolveTheme, saveTheme, usePanelTheme } from '../theme'
import { useStore } from '../store'

function Icon({ name }: { name: 'grid' | 'search' | 'sun' | 'moon' | 'logout' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
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
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...common}>
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
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

function PasswordNotice() {
  const { changeOwnPassword } = useStore()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="backup-reminder" role="status">
      <p>
        <strong>Tu clave es la de demostración o es muy corta.</strong> Cámbiala por una propia de al menos 8 caracteres antes de usar el sistema con datos reales.
      </p>
      {open ? (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault()
            if (next !== repeat) {
              setError('Las claves nuevas no coinciden.')
              return
            }
            setBusy(true)
            const problem = await changeOwnPassword(current, next)
            setBusy(false)
            setError(problem ?? '')
          }}
        >
          <Field label="Clave actual">
            <input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
          </Field>
          <Field label="Clave nueva">
            <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(event) => setNext(event.target.value)} required />
          </Field>
          <Field label="Repite la clave nueva">
            <input type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={(event) => setRepeat(event.target.value)} required />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar clave'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            Cambiar clave
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminLayout() {
  const { state, currentUser, logout, exportBackup, weakPassword, syncNotice, dismissSyncNotice, unsynced } = useStore()
  const badges = alertBadges(state, currentUser)
  const navigate = useNavigate()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [dark, setDark] = useState(() => resolveTheme(readTheme()) === 'dark')
  usePanelTheme(true)
  const [palette, setPalette] = useState(false)
  const links = MODULE_GROUPS.flatMap((group) => group.links).filter((link) => !link.permission || (currentUser ? allows(currentUser, link.permission) : false))
  const current = moduleAt(location.pathname)
  const onLauncher = location.pathname === MODULES_PATH
  const pending = Object.values(badges).reduce((sum, value) => sum + value, 0)

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

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    saveTheme(next)
    applyTheme(next)
    setDark(!dark)
  }
  const commands: Command[] = [
    { id: 'go-modulos', label: 'Módulos', group: 'Ir a', keywords: 'inicio menú aplicaciones', run: () => navigate(MODULES_PATH) },
    ...links.map((link) => ({ id: `go-${link.to}`, label: link.label, group: 'Ir a', run: () => navigate(link.to) })),
    { id: 'theme', label: dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', group: 'Acción', keywords: 'tema apariencia', run: toggleTheme },
    ...(currentUser && allows(currentUser, 'equipo')
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
    <div className="admin">
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
            <kbd>Ctrl K</kbd>
          </button>
          {unsynced ? <span className="topbar-sync">Cambios por enviar…</span> : null}
          <button
            type="button"
            className="topbar-btn"
            aria-pressed={dark}
            aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={dark ? 'Modo claro' : 'Modo oscuro'}
            onClick={toggleTheme}
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <span className="topbar-user" title={currentUser?.employeeCode ? `${currentUser.role} · ${currentUser.employeeCode}` : currentUser?.role}>
            <span className="topbar-avatar">{initials(currentUser?.name, 'P')}</span>
            <span className="topbar-user-name">{currentUser?.name}</span>
          </span>
          <button type="button" className="topbar-btn topbar-logout" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={leave}>
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <main id="contenido" className="admin-main" ref={mainRef} tabIndex={-1}>
        {weakPassword ? <PasswordNotice /> : null}
        {syncNotice ? (
          <div className="backup-reminder" role="alert">
            <p>{syncNotice}</p>
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={dismissSyncNotice}>
                Entendido
              </button>
            </div>
          </div>
        ) : null}
        {currentUser && allows(currentUser, 'equipo') ? <BackupReminder /> : null}
        <AlertsBanner />
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
