import { useState } from 'react'
import { METHODS } from '../catalog'
import { Field } from '../components/ui'
import { isoDate, longDate, money } from '../format'
import { useStore } from '../store'

export function Ingresos() {
  const { state, addMovement } = useStore()
  const ingresos = state.movements.filter((item) => item.type === 'ingreso')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    date: isoDate(),
    concept: '',
    amount: '',
    method: 'Efectivo',
    notes: '',
    folio: '',
  })

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Caja</p>
          <h1>Registrar ingreso</h1>
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
          const folio = form.folio.trim() ? Number(form.folio) : undefined
          if (form.folio.trim() && !Number.isFinite(folio)) {
            setError('El folio debe ser numérico.')
            return
          }
          const created = addMovement({
            type: 'ingreso',
            date: form.date,
            concept: form.concept,
            amount,
            method: form.method,
            notes: form.notes,
            folio,
          })
          if (!created) {
            setError('No tienes permiso para registrar en caja.')
            return
          }
          setError('')
          setNotice(`Ingreso ${created.document} registrado.`)
          setForm({ date: isoDate(), concept: '', amount: '', method: 'Efectivo', notes: '', folio: '' })
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
        <Field label="Folio de cita">
          <input className="num" value={form.folio} onChange={(event) => setForm({ ...form, folio: event.target.value })} placeholder="Opcional" />
        </Field>
        <Field label="Nota">
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="banner">{notice}</p> : null}
        <button type="submit" className="btn btn-primary">
          Registrar ingreso
        </button>
      </form>
      <div className="records">
        {ingresos.map((item) => (
          <article key={item.id} className="record compact-record">
            <header>
              <div>
                <strong>{item.concept}</strong>
                <span>
                  {item.document} · {longDate(item.date)} · {item.method}
                  {item.folio ? ` · cita #${item.folio}` : ''}
                </span>
              </div>
              <b className="num ok-text">{money(item.amount)}</b>
            </header>
            {item.notes ? <p>{item.notes}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
