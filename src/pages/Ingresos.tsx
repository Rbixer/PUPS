import { useState } from 'react'
import { METHODS } from '../catalog'
import { Field, InvoiceChoice } from '../components/ui'
import { isoDate, longDate, money, parseAmount } from '../format'
import { INCOME_CATEGORIES } from '../ops'
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
    category: 'Servicio',
    invoiced: false,
  })

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Registrar ingreso</h1>
        </div>
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
          const folio = form.folio.trim() ? Number(form.folio) : undefined
          if (form.folio.trim() && (!Number.isInteger(folio) || !state.appointments.some((item) => item.folio === folio))) {
            setError('No hay una cita con ese folio.')
            setNotice('')
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
            category: form.category === 'Servicio' ? undefined : form.category,
            ...(form.category === 'Servicio' ? { invoiced: form.invoiced } : {}),
          })
          if (!created.ok) {
            setError(created.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(`Ingreso ${created.value.document} registrado.`)
          setForm({ date: isoDate(), concept: '', amount: '', method: 'Efectivo', notes: '', folio: '', category: 'Servicio', invoiced: false })
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
        <Field label="Tipo">
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {INCOME_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        {form.category === 'Servicio' ? <InvoiceChoice value={form.invoiced} onChange={(invoiced) => setForm({ ...form, invoiced })} /> : null}
        <Field label="Folio de cita">
          <input className="num" value={form.folio} onChange={(event) => setForm({ ...form, folio: event.target.value })} placeholder="Opcional" />
        </Field>
        <Field label="Nota">
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <p className="hint">
          Servicio paga impuesto. Aporte de capital y préstamo recibido no son venta: entran a caja sin impuesto y van a patrimonio o a deuda.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="banner">{notice}</p> : null}
        <button type="submit" className="btn btn-primary">
          Registrar ingreso
        </button>
      </form>
      <div className="ledger">
      <header className="module-bar">
        <h2>Ingresos registrados</h2>
        <span>{ingresos.length}</span>
      </header>
      <div className="records">
        {ingresos.map((item) => (
          <article key={item.id} className="record compact-record">
            <header>
              <div>
                <strong>{item.concept}</strong>
                <span>
                  {item.document} · {longDate(item.date)} · {item.method}
                  {item.folio ? ` · cita #${item.folio}` : ''}
                  {item.category ? ` · ${item.category}` : ''}
                  {item.invoiced ? ' · con factura' : ''}
                </span>
              </div>
              <b className="num ok-text">{money(item.amount)}</b>
            </header>
            {item.notes ? <p>{item.notes}</p> : null}
          </article>
        ))}
      </div>
      </div>
      </div>
    </section>
  )
}
