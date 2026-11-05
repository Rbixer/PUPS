import { useState } from 'react'
import { METHODS as PAY_METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { count, isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import { EXPENSE_CATEGORIES, round2 } from '../ops'
import { useStore } from '../store'
import type { FixedCost, Movement } from '../types'


const blankFixed = (): FixedCost => ({ id: '', name: '', category: 'Alquiler', amount: 0, day: 1, active: true })

function categoryOf(item: Movement) {
  return item.category ?? (item.purchaseId ? 'Compras' : 'Sin categoría')
}

export function Gastos() {
  const { state } = useStore()
  const [tab, setTab] = useState<'mes' | 'fijos'>('mes')
  const [cursor, setCursor] = useState(() => isoDate().slice(0, 7))
  const egresos = state.movements.filter((item) => item.type === 'egreso' && item.date.startsWith(cursor))
  const fixed = (state.fixedCosts ?? []).filter((item) => item.active)
  const paidFixed = egresos.filter((item) => item.fixedId)
  const pendingFixed = fixed.filter((item) => !state.movements.some((move) => move.fixedId === item.id && move.period === cursor))
  const total = round2(egresos.reduce((sum, item) => sum + item.amount, 0))
  const fixedTotal = round2(paidFixed.reduce((sum, item) => sum + item.amount, 0))

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compras y gastos</p>
          <h1>Gastos</h1>
          <p className="lede">Gastos fijos que se repiten cada mes y gastos generados por la operación, todos con categoría para el estado de resultados.</p>
        </div>
        <div className="month-switch">
          <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => setCursor((value) => shiftMonth(`${value}-01`, -1).slice(0, 7))}>
            ‹
          </button>
          <strong>{monthTitle(`${cursor}-01`)}</strong>
          <button type="button" className="cal-arrow" aria-label="Mes siguiente" onClick={() => setCursor((value) => shiftMonth(`${value}-01`, 1).slice(0, 7))}>
            ›
          </button>
        </div>
      </header>
      <Metrics
        items={[
          { label: 'Gastos del mes', value: money(total), tone: 'hot', detail: count(egresos.length, 'egreso', 'egresos') },
          { label: 'Fijos pagados', value: money(fixedTotal), detail: `${paidFixed.length} de ${fixed.length}` },
          { label: 'Generados', value: money(round2(total - fixedTotal)), detail: 'Compras, planilla y operación' },
          {
            label: 'Fijos pendientes',
            value: money(round2(pendingFixed.reduce((sum, item) => sum + item.amount, 0))),
            tone: pendingFixed.length ? 'bad' : undefined,
            detail: pendingFixed.map((item) => item.name).join(', ') || 'Al día',
          },
        ]}
      />
      <Tabs
        label="Secciones de gastos"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mes', label: 'Gastos del mes' },
          { id: 'fijos', label: 'Gastos fijos', count: pendingFixed.length },
        ]}
      />
      {tab === 'mes' ? <MonthExpenses cursor={cursor} egresos={egresos} /> : <FixedCosts cursor={cursor} />}
    </section>
  )
}

function MonthExpenses({ cursor, egresos }: { cursor: string; egresos: Movement[] }) {
  const { state, addMovement } = useStore()
  const general = state.settings.taxRegime === 'general'
  const [form, setForm] = useState({ date: isoDate(), category: 'Insumos de grooming', concept: '', amount: '', method: 'Efectivo', notes: '', withTax: false })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const groups = new Map<string, number>()
  for (const item of egresos) groups.set(categoryOf(item), round2((groups.get(categoryOf(item)) ?? 0) + item.amount))
  const rows = [...groups.entries()].sort((a, b) => b[1] - a[1])
  const peak = Math.max(...rows.map((row) => row[1]), 1)

  return (
    <div className="biz-split">
      <div className="biz-stack">
        <form
          className="ledger biz-form"
          onSubmit={(event) => {
            event.preventDefault()
            const result = addMovement({
              type: 'egreso',
              date: form.date,
              concept: form.concept,
              amount: amountOf(form.amount),
              method: form.method,
              notes: form.notes,
              category: form.category,
              ...(form.withTax ? { withTax: true } : {}),
            })
            if (!result.ok) {
              setError(result.error)
              setNotice('')
              return
            }
            setError('')
            setNotice(`Gasto ${result.value.document} registrado en ${form.category}.`)
            setForm({ ...form, concept: '', amount: '', notes: '' })
          }}
        >
          <h2>Registrar gasto</h2>
          <div className="form-pair">
            <Field label="Fecha">
              <input type="date" value={form.date} max={isoDate()} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
            </Field>
            <Field label="Categoría">
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Concepto">
            <input value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} required />
          </Field>
          <div className="form-pair">
            <Field label="Monto (Q)">
              <input className="num" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </Field>
            <Field label="Pagado con">
              <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                {PAY_METHODS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Detalle">
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="No. de factura, proveedor…" />
          </Field>
          {general ? (
            <label className="check-line">
              <input type="checkbox" checked={form.withTax} onChange={(event) => setForm({ ...form, withTax: event.target.checked })} />
              Factura con IVA (separa el 12 % como crédito fiscal)
            </label>
          ) : null}
          <Flash error={error} notice={notice} />
          <button type="submit" className="btn btn-primary">
            Registrar gasto
          </button>
        </form>
        <article className="panel">
          <h2>Por categoría</h2>
          {rows.length === 0 ? (
            <p className="empty">Sin gastos en {monthTitle(`${cursor}-01`).toLowerCase()}.</p>
          ) : (
            <div className="meter">
              {rows.map(([label, amount]) => (
                <div key={label} className="meter-row">
                  <div>
                    <strong>{label}</strong>
                    <div className="meter-track" aria-hidden="true">
                      <div className="meter-fill" style={{ width: `${Math.max(4, (amount / peak) * 100)}%` }} />
                    </div>
                  </div>
                  <b className="num">{money(amount)}</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
      <div className="ledger">
        <header className="module-bar">
          <h2>Egresos del mes</h2>
          <span>{egresos.length}</span>
        </header>
        {egresos.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Sin egresos este mes.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Tipo</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {egresos.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.concept}</strong>
                      <small>
                        {item.document} · {longDate(item.date)} · {item.method}
                      </small>
                    </td>
                    <td>
                      {item.fixedId ? <Tag tone="info">Fijo</Tag> : <Tag tone="mute">Generado</Tag>} <small>{categoryOf(item)}</small>
                    </td>
                    <td className="num hot-text">{money(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FixedCosts({ cursor }: { cursor: string }) {
  const { state, saveFixedCost, payFixedCost } = useStore()
  const list = state.fixedCosts ?? []
  const [form, setForm] = useState<FixedCost>(blankFixed)
  const [amountText, setAmountText] = useState('')
  const [methods, setMethods] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const editing = list.some((item) => item.id === form.id)
  const today = isoDate()

  return (
    <div className="biz-split">
      <form
        className="ledger biz-form"
        onSubmit={(event) => {
          event.preventDefault()
          const result = saveFixedCost({ ...form, amount: amountOf(amountText) })
          if (!result.ok) {
            setError(result.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(editing ? 'Gasto fijo actualizado.' : `${result.value.name} agregado.`)
          setForm(blankFixed())
          setAmountText('')
        }}
      >
        <h2>{editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h2>
        <Field label="Nombre">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alquiler del local, internet…" required />
        </Field>
        <div className="form-trio">
          <Field label="Categoría">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Monto (Q)">
            <input className="num" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} required />
          </Field>
          <Field label="Vence el día">
            <input className="num" type="number" min={1} max={28} value={form.day} onChange={(event) => setForm({ ...form, day: Number(event.target.value) })} />
          </Field>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Activo cada mes
        </label>
        {state.settings.taxRegime === 'general' ? (
          <label className="check-line">
            <input type="checkbox" checked={form.withTax === true} onChange={(event) => setForm({ ...form, withTax: event.target.checked || undefined })} />
            Llega con factura con IVA
          </label>
        ) : null}
        <Flash error={error} notice={notice} />
        <div className="overlay-actions">
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setForm(blankFixed())
                setAmountText('')
              }}
            >
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary">
            {editing ? 'Guardar cambios' : 'Agregar gasto fijo'}
          </button>
        </div>
      </form>
      <div className="ledger">
        <header className="module-bar">
          <h2>{monthTitle(`${cursor}-01`)}</h2>
          <span>{list.length} fijos</span>
        </header>
        {list.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Agrega el alquiler, la luz, el internet y lo que se paga cada mes.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Gasto</th>
                  <th className="num">Monto</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((item) => {
                  const paid = state.movements.find((move) => move.fixedId === item.id && move.period === cursor)
                  const due = `${cursor}-${String(item.day).padStart(2, '0')}`
                  const method = methods[item.id] ?? 'Transferencia'
                  return (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => {
                            setForm(item)
                            setAmountText(String(item.amount))
                          }}
                        >
                          {item.name}
                        </button>
                        <small>
                          {item.category} · día {item.day}
                          {item.active ? '' : ' · inactivo'}
                        </small>
                      </td>
                      <td className="num">{money(item.amount)}</td>
                      <td>
                        {paid ? (
                          <Tag tone="ok">Pagado {paid.document}</Tag>
                        ) : !item.active ? (
                          <Tag tone="mute">Inactivo</Tag>
                        ) : due < today ? (
                          <Tag tone="bad">Vencido</Tag>
                        ) : (
                          <Tag tone="warn">Vence {longDate(due)}</Tag>
                        )}
                      </td>
                      <td>
                        {!paid && item.active ? (
                          <div className="row-actions">
                            <select value={method} onChange={(event) => setMethods({ ...methods, [item.id]: event.target.value })} aria-label="Método de pago">
                              {PAY_METHODS.map((option) => (
                                <option key={option}>{option}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                const result = payFixedCost({ fixedId: item.id, period: cursor, amount: item.amount, method, date: today })
                                if (!result.ok) {
                                  setError(result.error)
                                  setNotice('')
                                  return
                                }
                                setError('')
                                setNotice(`${item.name} pagado con ${result.value.document}.`)
                              }}
                            >
                              Pagar
                            </button>
                          </div>
                        ) : null}
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
  )
}
