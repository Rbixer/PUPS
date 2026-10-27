import { useState } from 'react'
import { Constancia } from '../components/Constancia'
import { packageLabel } from '../grooming'
import { formatName, longDate } from '../format'
import { useStore } from '../store'

export function Constancias() {
  const { state, updateAppointment } = useStore()
  const docs = state.appointments
    .filter((item) => item.report?.savedAt)
    .sort((a, b) => (b.report?.savedAt ?? '').localeCompare(a.report?.savedAt ?? ''))
  const [openId, setOpenId] = useState<string | null>(null)
  const open = docs.find((item) => item.id === openId) ?? null

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Caja</p>
          <h1>Constancias</h1>
          <p className="hint">Lo que se guarda en Documento de egreso, también desde el celular, queda aquí.</p>
        </div>
      </header>

      {docs.length === 0 ? (
        <p className="empty">Todavía no hay constancias. En Documento de egreso elige la visita y pulsa Guardar.</p>
      ) : (
        <div className="doc-archive">
          <div className="doc-list" role="group" aria-label="Constancias guardadas">
            {docs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={open?.id === item.id}
                onClick={() => setOpenId(item.id)}
              >
                <strong>{formatName(item.petName)}</strong>
                <span>
                  {formatName(item.clientName)} · #{item.folio}
                </span>
                <span>
                  {packageLabel(item.report)} · {longDate(item.date)} · {item.time}
                </span>
              </button>
            ))}
          </div>
          {open ? (
            <Constancia
              key={open.id}
              embedded
              appointment={open}
              history={state.appointments}
              onClose={() => setOpenId(null)}
              onSave={(patch) => {
                updateAppointment(open.id, patch)
              }}
            />
          ) : (
            <p className="empty">Elige una constancia para verla.</p>
          )}
        </div>
      )}
    </section>
  )
}
