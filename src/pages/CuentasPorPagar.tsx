import { useState } from 'react'
import { METHODS as PAY_METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { addDays, count, daysBetween, isoDate, longDate, money } from '../format'
import { EXPENSE_CATEGORIES, payableBalance, round2 } from '../ops'
import { useStore } from '../store'
import type { Payable } from '../types'


function dueTag(payable: Payable, today: string) {
  const balance = payableBalance(payable)
  if (balance <= 0) return <Tag tone="ok">Pagada</Tag>
  const days = daysBetween(today, payable.dueDate)
  if (days < 0) return <Tag tone="bad">Vencida hace {-days} d</Tag>
  if (days <= 7) return <Tag tone="warn">Vence en {days} d</Tag>
  return <Tag tone="mute">Vence {longDate(payable.dueDate)}</Tag>
}

export function CuentasPorPagar() {
  const { state, savePayable, payPayable } = useStore()
  const today = isoDate()
  const payables = state.payables ?? []
  const [view, setView] = useState<'pendientes' | 'pagadas'>('pendientes')
  const [paying, setPaying] = useState<string | null>(null)
  const [payment, setPayment] = useState({ amount: '', method: 'Transferencia' })
  const [form, setForm] = useState({ date: today, dueDate: addDays(today, 30), supplierId: '', supplierName: '', invoice: '', concept: '', category: 'Luz', amount: '', withTax: false })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const open = payables.filter((item) => payableBalance(item) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const closed = payables.filter((item) => payableBalance(item) <= 0)
  const owed = round2(open.reduce((sum, item) => sum + payableBalance(item), 0))
  const late = open.filter((item) => item.dueDate < today)
  const soon = open.filter((item) => item.dueDate >= today && daysBetween(today, item.dueDate) <= 7)
  const sum = (items: Payable[]) => money(round2(items.reduce((total, item) => total + payableBalance(item), 0)))
  const rows = view === 'pendientes' ? open : closed

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compras y gastos</p>
          <h1>Facturas por pagar</h1>
          <p className="lede">Compras al crédito, servicios del local y cuotas del IGSS. Cada pago o abono sale de caja con su documento de egreso.</p>
        </div>
      </header>
      <Metrics
        items={[
          { label: 'Saldo pendiente', value: money(owed), tone: owed > 0 ? 'hot' : undefined, detail: count(open.length, 'factura', 'facturas') },
          { label: 'Vencidas', value: sum(late), tone: late.length ? 'bad' : undefined, detail: count(late.length, 'factura', 'facturas') },
          { label: 'Vencen en 7 días', value: sum(soon), detail: count(soon.length, 'factura', 'facturas') },
          { label: 'Pagadas', value: closed.length },
        ]}
      />
      <div className="biz-split">
        <form
          className="ledger biz-form"
          onSubmit={(event) => {
            event.preventDefault()
            const result = savePayable({ ...form, amount: amountOf(form.amount) })
            if (!result.ok) {
              setError(result.error)
              setNotice('')
              return
            }
            setError('')
            setNotice(`${result.value.number} registrada. Vence el ${longDate(result.value.dueDate)}.`)
            setForm({ ...form, invoice: '', concept: '', amount: '', supplierName: '' })
          }}
        >
          <h2>Registrar factura por pagar</h2>
          <Field label="Proveedor">
            <select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
              <option value="">Otro (escribir nombre)</option>
              {(state.suppliers ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {!form.supplierId ? (
            <Field label="A nombre de">
              <input value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} placeholder="Empresa eléctrica, arrendante…" />
            </Field>
          ) : null}
          <div className="form-pair">
            <Field label="Concepto">
              <input value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} required />
            </Field>
            <Field label="Categoría">
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="No. de factura">
              <input value={form.invoice} onChange={(event) => setForm({ ...form, invoice: event.target.value })} />
            </Field>
            <Field label="Monto (Q)">
              <input className="num" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </Field>
            <Field label="Fecha de factura">
              <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </Field>
            <Field label="Vence">
              <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            </Field>
          </div>
          <button type="submit" className="btn btn-primary">
            Registrar factura
          </button>
        </form>

        <div className="biz-stack">
          <Tabs
            label="Estado de facturas"
            value={view}
            onChange={setView}
            tabs={[
              { id: 'pendientes', label: 'Pendientes', count: open.length },
              { id: 'pagadas', label: 'Pagadas' },
            ]}
          />
          {state.settings.taxRegime === 'general' ? (
            <label className="check-line">
              <input type="checkbox" checked={form.withTax} onChange={(event) => setForm({ ...form, withTax: event.target.checked })} />
              Factura con IVA (separa el 12 % como crédito fiscal)
            </label>
          ) : null}
          <Flash error={error} notice={notice} />
          <div className="ledger">
            {rows.length === 0 ? (
              <p className="empty" style={{ margin: 14 }}>{view === 'pendientes' ? 'Sin facturas pendientes. Todo al día.' : 'Todavía no hay facturas pagadas.'}</p>
            ) : (
              <div className="table-wrap">
                <table className="biz-table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th className="num">Total</th>
                      <th className="num">Saldo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const balance = payableBalance(item)
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>
                              {item.supplierName} · {item.concept}
                            </strong>
                            <small>
                              {item.number}
                              {item.invoice ? ` · Fact. ${item.invoice}` : ''} · {item.category}
                              {item.payments.length ? ` · pagos: ${item.payments.map((pay) => `${pay.document} ${money(pay.amount)}`).join(', ')}` : ''}
                            </small>
                            {paying === item.id ? (
                              <div className="biz-row" style={{ marginTop: 8 }}>
                                <Field label="Monto">
                                  <input className="num" inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} />
                                </Field>
                                <Field label="Con">
                                  <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>
                                    {PAY_METHODS.map((option) => (
                                      <option key={option}>{option}</option>
                                    ))}
                                  </select>
                                </Field>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => {
                                    const result = payPayable({ payableId: item.id, amount: amountOf(payment.amount), method: payment.method, date: today })
                                    if (!result.ok) {
                                      setError(result.error)
                                      setNotice('')
                                      return
                                    }
                                    setError('')
                                    setNotice(`Pago ${result.value.document} por ${money(result.value.amount)} registrado.`)
                                    setPaying(null)
                                  }}
                                >
                                  Confirmar pago
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaying(null)}>
                                  Cancelar
                                </button>
                              </div>
                            ) : null}
                          </td>
                          <td className="num">{money(item.amount)}</td>
                          <td className={`num ${balance > 0 ? 'hot-text' : ''}`}>{money(balance)}</td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                              {dueTag(item, today)}
                              {balance > 0 && paying !== item.id ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setPaying(item.id)
                                    setPayment({ amount: String(balance), method: 'Transferencia' })
                                  }}
                                >
                                  Pagar
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
