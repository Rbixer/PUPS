import { useEffect, useRef, type ReactNode } from 'react'
import { parseAmount } from '../format'
import type { AppointmentStatus } from '../types'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand compact' : 'brand'}>
      <span className="logo-badge">
        <img src="/logo.png" alt="" width={342} height={345} />
      </span>
      <span className="brand-name">
        <strong>PUP'S</strong>
        {compact ? null : <small>Pet Shop y Grooming</small>}
      </span>
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendiente: 'Pendiente',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

export function StatusPill({ status }: { status: AppointmentStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.count ? <b>{tab.count}</b> : null}
        </button>
      ))}
    </div>
  )
}

export function Metrics({ items }: { items: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'ok' | 'hot' | 'bad' }[] }) {
  return (
    <div className="metric-rail biz-metrics">
      {items.map((item) => (
        <article key={item.label}>
          <span>{item.label}</span>
          <strong className={`num ${item.tone ?? ''}`}>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </article>
      ))}
    </div>
  )
}

export function Tag({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="form-error" role="alert">{error}</p>
  if (notice) return <p className="banner" role="status">{notice}</p>
  return null
}

export const amountOf = parseAmount

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Ventana modal: lleva el foco adentro, lo mantiene ahí con Tab, cierra con Escape
 * y al cerrar devuelve el foco al botón que la abrió.
 */
export function Dialog({
  labelledBy,
  onClose,
  children,
  className = 'overlay',
  escape = true,
  backdrop = false,
}: {
  labelledBy: string
  onClose: () => void
  children: ReactNode
  className?: string
  escape?: boolean
  /** Cerrar al tocar fuera del contenido. */
  backdrop?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current
    const first = root?.querySelector<HTMLElement>('[autofocus], ' + FOCUSABLE)
    first?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && escape) {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null)
      if (items.length === 0) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    root?.addEventListener('keydown', onKey)
    return () => {
      root?.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [escape])

  return (
    <div
      ref={ref}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={backdrop ? (event) => event.target === event.currentTarget && onClose() : undefined}
    >
      {children}
    </div>
  )
}
