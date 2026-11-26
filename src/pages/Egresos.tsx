import { useState } from 'react'
import { EXPENSE_METHODS } from '../catalog'
import { Constancia } from '../components/Constancia'
import { Dialog, Field } from '../components/ui'
import { formatName, isoDate, longDate, money, parseAmount } from '../format'
import { useStore } from '../store'
import type { Movement } from '../types'

export function Egresos() {
  const { state, addMovement, updateAppointment } = useStore()
  const egresos = state.movements.filter((item) => item.type === 'egreso')
  const visits = [...state.appointments].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
  const [visitId, setVisitId] = useState<string | null>(visits[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const needle = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const visible = needle
    ? visits.filter((item) =>
        [item.petName, item.clientName, item.phone, item.breed, String(item.folio), item.date, item.time]
          .join(' ')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(needle),
      )
    : visits
  const visit = visible.find((item) => item.id === visitId) ?? visible[0] ?? null
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [doc, setDoc] = useState<Movement | null>(null)
  const [form, setForm] = useState({
    date: isoDate(),
    concept: '',
    amount: '',
    method: 'Caja chica',
    notes: '',
  })

  return (
    <section className={doc ? 'stack printing-doc' : 'stack'}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Documento de egreso</h1>
          <p className="hint">Constancia de la visita. El registro de caja queda abajo.</p>
        </div>
      </header>

      {visits.length === 0 ? (
        <p className="empty">Todavía no hay visitas para armar una constancia.</p>
      ) : (
        <>
          <form className="filters filters-search no-print" onSubmit={(event) => event.preventDefault()}>
            <Field label="Buscar visita">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Mascota, tutor, teléfono o número de visita"
              />
            </Field>
          </form>
          {visible.length === 0 ? (
            <p className="empty no-print">Ninguna visita coincide con la búsqueda.</p>
          ) : (
          <div className="visit-pick" role="group" aria-label="Visitas">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={visit?.id === item.id}
                onClick={() => setVisitId(item.id)}
              >
                <strong>{formatName(item.petName)}</strong>
                <span>
                  {formatName(item.clientName)} · #{item.folio} · {longDate(item.date)} · {item.time}
                </span>
              </button>
            ))}
          </div>
          )}
          {visit ? (
            <Constancia
              key={visit.id}
              embedded
              appointment={visit}
              history={state.appointments}
              onClose={() => setVisitId(visits[0]?.id ?? null)}
              onSave={(patch) => {
                const result = updateAppointment(visit.id, patch)
                return result.ok ? null : result.error
              }}
            />
          ) : null}
        </>
      )}

      <header className="module-bar">
        <h2>Registro de caja</h2>
        <span>{egresos.length}</span>
      </header>
      <div className="cash-desk">
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          const amount = parseAmount(form.amount)
          if (!form.concept.trim() || !Number.isFinite(amount) || amount <= 0) {
            setError('Concepto y un monto mayor a cero son obligatorios.')
            setNotice('')
            return
          }
          const created = addMovement({
            type: 'egreso',
            date: form.date,
            concept: form.concept,
            amount,
            method: form.method,
            notes: form.notes,
          })
          if (!created.ok) {
            setError(created.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(`Documento ${created.value.document} listo.`)
          setDoc(created.value)
          setForm({ date: isoDate(), concept: '', amount: '', method: 'Caja chica', notes: '' })
        }}
      >
        <Field label="Fecha">
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </Field>
        <Field label="Concepto">
          <input value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} required />
        </Field>
        <Field label="Monto (Q)">
          <input className="num" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
        </Field>
        <Field label="Método">
          <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
            {EXPENSE_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </Field>
        <Field label="Detalle">
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="banner">{notice}</p> : null}
        <button type="submit" className="btn btn-primary">
          Emitir documento
        </button>
      </form>

      <div className="ledger">
      <header className="module-bar">
        <h2>Documentos emitidos</h2>
        <span>{egresos.length}</span>
      </header>
      <div className="records">
        {egresos.map((item) => (
          <article key={item.id} className="record compact-record">
            <header>
              <div>
                <strong>{item.concept}</strong>
                <span>
                  {item.document} · {longDate(item.date)} · {item.method}
                </span>
              </div>
              <b className="num hot-text">{money(item.amount)}</b>
            </header>
            {item.notes ? <p>{item.notes}</p> : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDoc(item)}>
              Ver documento
            </button>
          </article>
        ))}
      </div>
      </div>
      </div>

      {doc ? (
        <Dialog labelledBy="egreso-title" onClose={() => setDoc(null)}>
          <div className="overlay-card">
            <article className="sheet">
              <header className="sheet-head">
                <img src="/logo.png" alt="" />
                <div>
                  <p>PUP'S · Pet Shop y Grooming</p>
                  <h2 id="egreso-title">Documento de egreso</h2>
                </div>
              </header>
              <p className="sheet-folio num">{doc.document}</p>
              <dl className="sheet-facts">
                <div>
                  <dt>Fecha</dt>
                  <dd>{longDate(doc.date)}</dd>
                </div>
                <div>
                  <dt>Método</dt>
                  <dd>{doc.method}</dd>
                </div>
                <div>
                  <dt>Concepto</dt>
                  <dd>{doc.concept}</dd>
                </div>
                <div>
                  <dt>Detalle</dt>
                  <dd>{doc.notes || '—'}</dd>
                </div>
                <div>
                  <dt>Monto</dt>
                  <dd className="num">{money(doc.amount)}</dd>
                </div>
              </dl>
              <div className="sheet-sign">
                <span>Entregó</span>
                <span>Recibió</span>
              </div>
            </article>
            <div className="overlay-actions no-print">
              <button type="button" className="btn btn-ghost" onClick={() => setDoc(null)}>
                Cerrar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                Imprimir
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </section>
  )
}
