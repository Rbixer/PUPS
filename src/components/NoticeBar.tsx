import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { allows } from '../access'
import { buildAlerts, type Alert } from '../alerts'
import { backupDueDays, hasBackedUp, saveBackupFile, snoozeBackupReminder } from '../backup'
import { useStore } from '../store'
import { Field } from './ui'

type Tone = 'bad' | 'warn' | 'info' | 'security'

const KIND_LABEL: Record<Alert['kind'], string> = {
  citas: 'Citas',
  caja: 'Caja',
  whatsapp: 'WhatsApp',
  metas: 'Metas',
  tareas: 'Tareas',
  inventario: 'Inventario',
}

/** Mayor número, más urgente: decide el ícono de la barra cerrada. */
const RANK: Record<Tone, number> = { info: 0, warn: 1, security: 2, bad: 3 }

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function ToneIcon({ tone }: { tone: Tone }) {
  switch (tone) {
    case 'security':
      return (
        <svg {...ICON_PROPS}>
          <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" />
          <path d="M12 8.5v4" />
          <path d="M12 15.5h.01" />
        </svg>
      )
    case 'bad':
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5" />
          <path d="M12 16.5h.01" />
        </svg>
      )
    case 'warn':
      return (
        <svg {...ICON_PROPS}>
          <path d="M10.3 4.2 2.9 17.2A2 2 0 0 0 4.6 20.2h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9.5v4" />
          <path d="M12 17h.01" />
        </svg>
      )
    default:
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.8h.01" />
        </svg>
      )
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg {...ICON_PROPS} width={16} height={16} className={open ? 'notice-chevron is-open' : 'notice-chevron'}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Clave débil: el formulario vive aquí mismo y conserva lo escrito mientras la barra se pliega. */
export function PasswordForm({ required = false }: { required?: boolean }) {
  const { changeOwnPassword } = useStore()
  const [open, setOpen] = useState(required)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <div className="notice-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Cambiar clave
        </button>
      </div>
    )
  }
  return (
    <form
      className="form-grid notice-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (next !== repeat) {
          setError('Las claves nuevas no coinciden.')
          return
        }
        if (next.trim() === current.trim()) {
          setError('Elige una clave distinta a la actual.')
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
  )
}

type Notice = {
  id: string
  tone: Tone
  /** Texto corto para la barra cerrada. */
  brief: string
  role?: 'alert' | 'status'
  label?: string
  body: ReactNode
  actions?: ReactNode
}

/**
 * Una sola barra de avisos del panel: cerrada ocupa ~40 px con el resumen y, al abrirla,
 * lista cada aviso (clave débil, sincronización, respaldo y alertas del día).
 */
export function NoticeBar() {
  const { state, currentUser, weakPassword, syncNotice, dismissSyncNotice, exportBackup } = useStore()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [backupGone, setBackupGone] = useState(false)
  const canBackup = Boolean(currentUser && allows(currentUser, 'respaldo'))
  const backupDays = useMemo(() => (canBackup ? backupDueDays() : null), [canBackup])
  const alerts = buildAlerts(state, currentUser).filter((item) => !dismissed.includes(item.id))

  const notices: Notice[] = []

  if (weakPassword) {
    notices.push({
      id: 'clave',
      tone: 'security',
      brief: 'Tu clave es la de demostración o es muy corta.',
      role: 'status',
      label: 'Seguridad',
      body: (
        <p>
          <strong>Tu clave es la de demostración o es muy corta.</strong> Cámbiala por una propia de al menos 8 caracteres antes de usar el sistema con datos reales.
        </p>
      ),
      actions: <PasswordForm />,
    })
  }

  if (syncNotice) {
    notices.push({
      id: 'sync',
      tone: 'bad',
      brief: syncNotice,
      role: 'alert',
      label: 'Sincronización',
      body: <p>{syncNotice}</p>,
      actions: (
        <div className="notice-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismissSyncNotice}>
            Entendido
          </button>
        </div>
      ),
    })
  }

  if (backupDays !== null && !backupGone) {
    const headline = hasBackedUp() ? `Hace ${backupDays} días que no descargas un respaldo.` : 'Todavía no has descargado un respaldo.'
    notices.push({
      id: 'respaldo',
      tone: 'info',
      brief: headline,
      role: 'status',
      label: 'Respaldo',
      body: (
        <p>
          <strong>{headline}</strong> El servidor guarda una copia diaria; otra fuera del local protege los datos si ese equipo falla.
        </p>
      ),
      actions: (
        <div className="notice-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const data = exportBackup()
              if (!data) return
              saveBackupFile(data)
              setBackupGone(true)
            }}
          >
            Descargar ahora
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              snoozeBackupReminder()
              setBackupGone(true)
            }}
          >
            Más tarde
          </button>
        </div>
      ),
    })
  }

  for (const item of alerts) {
    notices.push({
      id: `alerta-${item.id}`,
      tone: item.tone,
      brief: item.title,
      label: KIND_LABEL[item.kind],
      body: (
        <>
          <strong>{item.title}</strong>
          {item.detail ? <p>{item.detail}</p> : null}
        </>
      ),
      actions: (
        <div className="notice-actions">
          <Link to={item.to} className="btn btn-ghost btn-sm">
            Ir
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ocultar alerta: ${item.title}`} onClick={() => setDismissed((current) => [...current, item.id])}>
            Ocultar
          </button>
        </div>
      ),
    })
  }

  if (notices.length === 0) return null

  const top = notices.reduce<Tone>((best, notice) => (RANK[notice.tone] > RANK[best] ? notice.tone : best), notices[0].tone)
  const first = notices[0]
  const count = notices.length === 1 ? '1 aviso' : `${notices.length} avisos`
  const panelId = 'avisos-panel'

  return (
    <section className={`notice-bar tone-${top}${open ? ' is-open' : ''}`} aria-label="Avisos del panel">
      {syncNotice ? (
        <span className="sr-only" role="alert">
          {syncNotice}
        </span>
      ) : null}
      <button type="button" className="notice-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <span className="notice-icon">
          <ToneIcon tone={top} />
        </span>
        <span className="notice-summary">
          <strong>{count}</strong>
          <span className="notice-sep" aria-hidden="true">
            ·
          </span>
          <span className="notice-first">{first.brief}</span>
        </span>
        <Chevron open={open} />
      </button>
      <ul id={panelId} className="notice-list" hidden={!open}>
        {notices.map((notice) => (
          <li key={notice.id} className={`notice-item tone-${notice.tone}`}>
            <div className="notice-row" role={notice.role}>
              <span className="notice-icon">
                <ToneIcon tone={notice.tone} />
              </span>
              <div className="notice-body">
                {notice.label ? <span className="notice-kind">{notice.label}</span> : null}
                {notice.body}
              </div>
              {notice.actions}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
