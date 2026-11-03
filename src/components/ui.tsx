import type { ReactNode } from 'react'
import type { AppointmentStatus } from '../types'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand compact' : 'brand'}>
      <span className="logo-badge">
        <img src="/logo.png" alt="" />
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

export function amountOf(value: string) {
  return Number(value.replace(/[Q\s,]/g, ''))
}
