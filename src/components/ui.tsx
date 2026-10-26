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
