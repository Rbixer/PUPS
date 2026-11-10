import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildAlerts, type Alert } from '../alerts'
import { useStore } from '../store'

const KIND_LABEL: Record<Alert['kind'], string> = {
  citas: 'Citas',
  caja: 'Caja',
  whatsapp: 'WhatsApp',
  metas: 'Metas',
  tareas: 'Tareas',
}

export function AlertsBanner() {
  const { state, currentUser } = useStore()
  const [dismissed, setDismissed] = useState<string[]>([])
  const alerts = buildAlerts(state, currentUser).filter((item) => !dismissed.includes(item.id))
  if (alerts.length === 0) return null

  return (
    <aside className="alerts-banner" aria-label="Alertas del día">
      <header className="alerts-head">
        <strong>Alertas</strong>
        <span className="hint">{alerts.length === 1 ? '1 pendiente' : `${alerts.length} pendientes`}</span>
      </header>
      <ul className="alerts-list">
        {alerts.map((item) => (
          <li key={item.id} className={`alert-item tone-${item.tone}`}>
            <div>
              <span className="alert-kind">{KIND_LABEL[item.kind]}</span>
              <strong>{item.title}</strong>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
            <div className="alert-actions">
              <Link to={item.to} className="btn btn-ghost btn-sm">
                Ir
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Ocultar alerta: ${item.title}`} onClick={() => setDismissed((current) => [...current, item.id])}>
                Ocultar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
