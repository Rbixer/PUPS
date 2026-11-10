import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { allows } from '../access'
import { alertBadges } from '../alerts'
import { saveBackupFile } from '../backup'
import { AlertsBanner } from '../components/AlertsBanner'
import { BackupReminder } from '../components/BackupReminder'
import { CommandPalette, type Command } from '../components/CommandPalette'
import { Brand, Field } from '../components/ui'
import { initials, todayLabel } from '../format'
import { DEMO_MODE } from '../env'
import { applyTheme, readTheme, resolveTheme, saveTheme, usePanelTheme } from '../theme'
import { useStore } from '../store'
import type { Permission } from '../types'

const GROUPS: { label: string; links: { to: string; label: string; end: boolean; permission?: Permission }[] }[] = [
  {
    label: 'Operación',
    links: [
      { to: '/admin', label: 'Citas', end: true, permission: 'citas' },
      { to: '/admin/fichas', label: 'Fichas', end: false, permission: 'fichas' },
      { to: '/admin/clientes', label: 'Clientes', end: false, permission: 'caja' },
      { to: '/admin/tareas', label: 'Tareas', end: false, permission: 'tareas' },
      { to: '/admin/whatsapp', label: 'WhatsApp', end: false, permission: 'whatsapp' },
    ],
  },
  {
    label: 'Ventas y caja',
    links: [
      { to: '/admin/ventas', label: 'Punto de venta', end: false, permission: 'caja' },
      { to: '/admin/tienda', label: 'Tienda en línea', end: false, permission: 'caja' },
      { to: '/admin/ingresos', label: 'Registrar ingreso', end: false, permission: 'caja' },
      { to: '/admin/egresos', label: 'Documento de egreso', end: false, permission: 'caja' },
      { to: '/admin/corte', label: 'Corte de caja', end: false, permission: 'caja' },
      { to: '/admin/compras-empleados', label: 'Compras de empleados', end: false, permission: 'caja' },
      { to: '/admin/constancias', label: 'Constancias', end: false, permission: 'caja' },
    ],
  },
  {
    label: 'Compras y gastos',
    links: [
      { to: '/admin/compras', label: 'Compras', end: false, permission: 'compras' },
      { to: '/admin/inventario', label: 'Inventario', end: false, permission: 'compras' },
      { to: '/admin/gastos', label: 'Gastos', end: false, permission: 'compras' },
      { to: '/admin/por-pagar', label: 'Facturas por pagar', end: false, permission: 'compras' },
    ],
  },
  {
    label: 'Finanzas',
    links: [
      { to: '/admin/planilla', label: 'Planilla', end: false, permission: 'planilla' },
      { to: '/admin/contabilidad', label: 'Contabilidad', end: false, permission: 'contabilidad' },
      { to: '/admin/estadisticas', label: 'Estadísticas', end: false, permission: 'estadisticas' },
      { to: '/admin/control', label: 'Control general', end: false, permission: 'equipo' },
    ],
  },
  {
    label: 'Equipo',
    links: [
      { to: '/admin/asistencia', label: 'Asistencia', end: false },
      { to: '/admin/trabajadores', label: 'Trabajadores', end: false, permission: 'equipo' },
      { to: '/admin/usuarios', label: 'Usuarios', end: false, permission: 'equipo' },
    ],
  },
]

const LINKS = GROUPS.flatMap((group) => group.links)

function Icon({ name }: { name: 'search' | 'sun' | 'moon' | 'logout' | 'x' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
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
    case 'x':
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )
  }
}

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
  if (to === '/admin/whatsapp') {
    return (
      <svg {...common}>
        <path d="M6 17.5 4.5 20.5l3.2-1.2A8.2 8.2 0 1 0 6 17.5z" />
      </svg>
    )
  }
  if (to === '/admin/tienda') {
    return (
      <svg {...common}>
        <path d="M6 8.5h12l-1 11h-10l-1-11z" />
        <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
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
  const extra: Record<string, ReactNode> = {
    '/admin/clientes': (
      <>
        <circle cx="12" cy="8.5" r="3.2" />
        <path d="M5.5 19.5c.9-3.2 3.4-4.8 6.5-4.8s5.6 1.6 6.5 4.8" />
      </>
    ),
    '/admin/tareas': (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="m8 12 2.6 2.6L16 9.2" />
      </>
    ),
    '/admin/ventas': (
      <>
        <rect x="3.5" y="5" width="17" height="11" rx="1.6" />
        <path d="M8 20h8M12 16v4M7 9.5h4" />
      </>
    ),
    '/admin/corte': (
      <>
        <rect x="3.5" y="7" width="17" height="11" rx="1.6" />
        <circle cx="12" cy="12.5" r="2.4" />
        <path d="M6.5 4.5h11" />
      </>
    ),
    '/admin/compras': (
      <>
        <path d="M4 5h2l2 10h10l2-7H7" />
        <circle cx="9.5" cy="19" r="1.3" />
        <circle cx="16.5" cy="19" r="1.3" />
      </>
    ),
    '/admin/inventario': (
      <>
        <path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" />
        <path d="M4 8l8 4.5L20 8M12 12.5v8" />
      </>
    ),
    '/admin/gastos': (
      <>
        <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8.5h6M9 12h6M9 15.5h3" />
      </>
    ),
    '/admin/por-pagar': (
      <>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M3.5 9.5h17M7 15h4" />
      </>
    ),
    '/admin/planilla': (
      <>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5M16 7.5h4.5M16 11h4.5M17.5 14.5h3" />
      </>
    ),
    '/admin/asistencia': (
      <>
        <circle cx="12" cy="12.5" r="8" />
        <path d="M12 8v4.5l3 2M9.5 2.5h5" />
      </>
    ),
    '/admin/compras-empleados': (
      <>
        <path d="M6 8.5h12l-1 11h-10l-1-11z" />
        <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5M9.5 14.5h5" />
      </>
    ),
    '/admin/contabilidad': (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 7.5h7M8.5 11.5h2M13.5 11.5h2M8.5 15h2M13.5 15h2" />
      </>
    ),
  }
  if (extra[to]) return <svg {...common}>{extra[to]}</svg>
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
  const { state, currentUser, logout, isAdmin, resetDemo, exportBackup, weakPassword, syncNotice, dismissSyncNotice, unsynced } = useStore()
  const badges = alertBadges(state, currentUser)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [armReset, setArmReset] = useState(false)
  const [dark, setDark] = useState(() => resolveTheme(readTheme()) === 'dark')
  usePanelTheme(true)
  const [palette, setPalette] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 980px)').matches)
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => !link.permission || (currentUser ? allows(currentUser, link.permission) : false)),
  })).filter((group) => group.links.length > 0)
  const links = groups.flatMap((group) => group.links)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)')
    const apply = () => setNarrow(media.matches)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
    const current = LINKS.find((link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)))
    document.title = `${current?.label ?? 'Panel'} · PUP'S`
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="admin">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="mobile-bar">
        <button type="button" className="nav-toggle" aria-label="Abrir menú" aria-expanded={open} aria-controls="menu-panel" onClick={() => setOpen(true)}>
          <span />
          <span />
        </button>
        <Brand compact />
      </div>
      {open ? <button type="button" className="scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} /> : null}
      <aside
        id="menu-panel"
        inert={narrow && !open ? true : undefined}
        className={`side ${open ? 'open' : ''} flex h-dvh flex-col border-r border-stone-200/80 bg-white/95 p-0 text-stone-900 shadow-[12px_0_40px_-30px_rgba(28,25,23,0.35)] backdrop-blur-xl side:shadow-none dark:border-stone-800 dark:bg-stone-950/95 dark:text-stone-100`}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
            <img src="/logo.png" alt="" className="size-8 object-contain" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="font-display text-[17px] font-semibold tracking-tight">PUP'S</p>
            <p className="truncate text-xs text-stone-500 dark:text-stone-400">Pet Shop &amp; Grooming</p>
          </div>
          <button
            type="button"
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-stone-500 hover:bg-stone-100 hover:text-stone-900 side:hidden dark:hover:bg-stone-800 dark:hover:text-white"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPalette(true)}
          className="mx-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-[13px] text-stone-500 transition hover:border-stone-300 hover:bg-white hover:text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:text-stone-200"
        >
          <Icon name="search" />
          <span className="flex-1">Buscar o ir a…</span>
          <kbd className="rounded-md border border-stone-200 bg-white px-1.5 font-mono text-[10px] leading-5 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
            Ctrl K
          </kbd>
        </button>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="Módulos">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.12em] text-stone-500 uppercase dark:text-stone-400">{group.label}</p>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm font-medium no-underline transition duration-150 ease-out-soft ${
                          isActive
                            ? 'bg-caramel-bold text-on-accent shadow-sm'
                            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                            <NavIcon to={link.to} />
                          </span>
                          <span className="truncate">{link.label}</span>
                          {badges[link.to] ? (
                            <b className={`ml-auto rounded-full px-1.5 text-[11px] leading-5 font-semibold ${isActive ? 'bg-white/25 text-on-accent' : 'bg-caramel-bold text-on-accent'}`}>
                              {badges[link.to]}
                            </b>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-200/80 p-3 dark:border-stone-800">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-caramel to-caramel-bold text-sm font-semibold text-on-accent shadow-sm">
              {initials(currentUser?.name, 'P')}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{currentUser?.name}</p>
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                {currentUser?.employeeCode ? `${currentUser.role} · ${currentUser.employeeCode}` : currentUser?.role}
              </p>
              {unsynced ? <p className="truncate text-[11px] font-semibold text-caramel-deep dark:text-caramel">Cambios por enviar…</p> : null}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1 px-1">
            <button
              type="button"
              className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
              aria-pressed={dark}
              aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={dark ? 'Modo claro' : 'Modo oscuro'}
              onClick={toggleTheme}
            >
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <button
              type="button"
              className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-stone-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-stone-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={leave}
            >
              <Icon name="logout" />
            </button>
            <span className="ml-auto truncate text-[11px] text-stone-500 dark:text-stone-400">{todayLabel()}</span>
          </div>
          {isAdmin && DEMO_MODE ? (
            <button
              type="button"
              className={`mt-1 w-full cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-left text-[11px] underline-offset-2 hover:underline ${
                armReset ? 'font-semibold text-caramel-deep dark:text-caramel' : 'text-stone-500 dark:text-stone-400'
              }`}
              onClick={() => {
                if (!armReset) {
                  setArmReset(true)
                  return
                }
                resetDemo()
                setArmReset(false)
              }}
            >
              {armReset ? 'Confirmar: restaurar los datos de demostración' : 'Restaurar demostración'}
            </button>
          ) : null}
        </div>
      </aside>
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
