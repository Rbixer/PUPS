import { useState } from 'react'
import { METHODS } from '../catalog'
import { Field } from '../components/ui'
import { isoDate, longDate, money } from '../format'
import { useStore } from '../store'
import type { Movement } from '../types'

export function Egresos() {
  const { state, addMovement } = useStore()
  const egresos = state.movements.filter((item) => item.type === 'egreso')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [doc, setDoc] = useState<Movement | null>(null)
  const [form, setForm] = useState({
    date: isoDate(),
    concept: '',
    amount: '',
    method: 'Efectivo',
    notes: '',
  })

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Caja</p>
          <h1>Documento de egreso</h1>
        </div>
      </header>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          const amount = Number(form.amount)
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
          if (!created) {
            setError('No tienes permiso para registrar en caja.')
            return
          }
          setError('')
          setNotice(`Documento ${created.document} listo.`)
          setDoc(created)
          setForm({ date: isoDate(), concept: '', amount: '', method: 'Efectivo', notes: '' })
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
            {METHODS.map((method) => (
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

      {doc ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="egreso-title">
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
        </div>
      ) : null}
    </section>
  )
}
