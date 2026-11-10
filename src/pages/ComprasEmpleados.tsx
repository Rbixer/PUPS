import { useState } from 'react'
import { METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tag } from '../components/ui'
import { count, isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import { employeeOwed, PAYROLL_DEDUCTION, round2 } from '../ops'
import { workersOf } from '../payroll'
import { shelfOf } from '../shop'
import { useStore } from '../store'

type Line = { productId: string; qty: string; price: string }

const blankLine = (): Line => ({ productId: '', qty: '1', price: '' })

export function ComprasEmpleados() {
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Compras de empleados</h1>
          <p className="lede">
            Productos que se lleva el equipo. Se pagan al contado o se descuentan en la siguiente planilla; en los dos casos la existencia baja en ese momento.
          </p>
        </div>
      </header>
      <div className="biz-split wide-left">
        <PurchaseForm />
        <Owed />
      </div>
      <History />
    </section>
  )
}

function PurchaseForm() {
  const { state, recordEmployeePurchase } = useStore()
  const workers = workersOf(state.users)
  const products = shelfOf(state.products).filter((item) => item.kind !== 'insumo' && item.stock > 0)
  const [employeeId, setEmployeeId] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [discount, setDiscount] = useState('')
  const [payroll, setPayroll] = useState(false)
  const [method, setMethod] = useState<string>('Efectivo')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const subtotal = round2(lines.reduce((sum, line) => sum + (amountOf(line.qty) || 0) * (amountOf(line.price) || 0), 0))
  const total = round2(Math.max(0, subtotal - (amountOf(discount) || 0)))

  if (workers.length === 0) return <p className="empty">No hay trabajadores activos con código. Se agregan en Equipo › Trabajadores.</p>

  function setLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)))
  }

  return (
    <form
      className="ledger biz-form"
      onSubmit={(event) => {
        event.preventDefault()
        const result = recordEmployeePurchase({
          employeeId,
          method: payroll ? PAYROLL_DEDUCTION : method,
          discount: amountOf(discount) || 0,
          lines: lines
            .filter((line) => line.productId)
            .map((line) => ({
              productId: line.productId,
              name: products.find((item) => item.id === line.productId)?.name ?? '',
              qty: amountOf(line.qty) || 0,
              price: amountOf(line.price),
            })),
        })
        if (!result.ok) {
          setError(result.error)
          setNotice('')
          return
        }
        setError('')
        setNotice(
          payroll
            ? `${result.value.number}: ${money(result.value.total)} quedan por descontar a ${result.value.clientName} en la planilla.`
            : `${result.value.number}: ${result.value.clientName} pagó ${money(result.value.total)} en ${method.toLowerCase()}.`,
        )
        setLines([blankLine()])
        setDiscount('')
      }}
    >
      <h2>Nueva compra</h2>
      <Field label="Trabajador">
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>
          <option value="">Elige al trabajador…</option>
          {workers.map((user) => (
            <option key={user.id} value={user.id}>
              {[user.name, user.lastName].filter(Boolean).join(' ')} · {user.employeeCode}
            </option>
          ))}
        </select>
      </Field>
      <div className="line-editor">
        {lines.map((line, index) => (
          <div key={index} className="line">
            <Field label={index === 0 ? 'Producto' : ' '}>
              <select
                value={line.productId}
                onChange={(event) => {
                  const item = products.find((product) => product.id === event.target.value)
                  setLine(index, { productId: event.target.value, price: item ? String(item.price) : '' })
                }}
              >
                <option value="">Elige un producto…</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.name} · hay ${item.stock}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={index === 0 ? 'Cant.' : ' '}>
              <input className="num" inputMode="numeric" value={line.qty} onChange={(event) => setLine(index, { qty: event.target.value })} />
            </Field>
            <Field label={index === 0 ? 'Precio (Q)' : ' '}>
              <input className="num" inputMode="decimal" value={line.price} onChange={(event) => setLine(index, { price: event.target.value })} />
            </Field>
            <button type="button" className="icon-btn" aria-label="Quitar línea" onClick={() => setLines((current) => (current.length > 1 ? current.filter((_, at) => at !== index) : [blankLine()]))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setLines((current) => [...current, blankLine()])}>
          + Agregar producto
        </button>
      </div>
      <div className="form-pair">
        <Field label="Descuento (Q)">
          <input className="num" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
        </Field>
        {payroll ? null : (
          <Field label="Pagó con">
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHODS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="choice-row" role="group" aria-label="Forma de pago">
        <button type="button" aria-pressed={!payroll} onClick={() => setPayroll(false)}>
          Paga al contado
        </button>
        <button type="button" aria-pressed={payroll} onClick={() => setPayroll(true)}>
          Descuento en planilla
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {payroll
          ? 'No entra dinero a caja ahora. El monto aparece en los descuentos de su próxima planilla.'
          : 'Entra a caja como venta sin factura, con el nombre del trabajador.'}
      </p>
      <div className="biz-row" style={{ justifyContent: 'space-between' }}>
        <strong className="num" style={{ fontSize: '1.3rem' }}>
          Total {money(total)}
        </strong>
        <button type="submit" className="btn btn-primary">
          Registrar compra
        </button>
      </div>
      <Flash error={error} notice={notice} />
    </form>
  )
}

function Owed() {
  const { state } = useStore()
  const rows = workersOf(state.users)
    .map((user) => ({ user, owed: employeeOwed(state, user.id) }))
    .filter((row) => row.owed > 0)
  return (
    <article className="panel">
      <h2>Por descontar en planilla</h2>
      {rows.length === 0 ? (
        <p className="empty">Nadie tiene compras pendientes de descontar.</p>
      ) : (
        <ul className="owed-list">
          {rows.map(({ user, owed }) => (
            <li key={user.id}>
              <span>
                {[user.name, user.lastName].filter(Boolean).join(' ')}
                <small>{user.employeeCode}</small>
              </span>
              <b className="num">{money(owed)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Se descuenta solo al pagar la planilla del mes; si el líquido no alcanza, el resto queda para la siguiente.</p>
    </article>
  )
}

function History() {
  const { state } = useStore()
  const [cursor, setCursor] = useState(() => isoDate().slice(0, 7))
  const sales = (state.sales ?? []).filter((item) => item.employeeId && item.date.startsWith(cursor))
  const live = sales.filter((item) => item.status !== 'anulada')
  const onPayroll = live.filter((item) => item.method === PAYROLL_DEDUCTION)
  const sum = (items: typeof sales) => money(round2(items.reduce((total, item) => total + item.total, 0)))
  return (
    <div className="biz-stack">
      <div className="month-switch">
        <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => setCursor((value) => shiftMonth(`${value}-01`, -1).slice(0, 7))}>
          ‹
        </button>
        <strong>{monthTitle(`${cursor}-01`)}</strong>
        <button type="button" className="cal-arrow" aria-label="Mes siguiente" onClick={() => setCursor((value) => shiftMonth(`${value}-01`, 1).slice(0, 7))}>
          ›
        </button>
      </div>
      <Metrics
        items={[
          { label: 'Compras del mes', value: sum(live), tone: 'hot', detail: count(live.length, 'compra', 'compras') },
          { label: 'Al contado', value: sum(live.filter((item) => item.method !== PAYROLL_DEDUCTION)) },
          { label: 'Con descuento en planilla', value: sum(onPayroll), detail: count(onPayroll.length, 'compra', 'compras') },
        ]}
      />
      <div className="ledger">
        {sales.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Este mes no hay compras de empleados.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Compra</th>
                  <th>Trabajador</th>
                  <th>Pago</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <strong>{sale.number}</strong>
                      <small>{longDate(sale.date)}</small>
                    </td>
                    <td>
                      {sale.clientName}
                      <small>{sale.lines.map((line) => `${line.qty} × ${line.name}`).join(', ')}</small>
                    </td>
                    <td>
                      {sale.status === 'anulada' ? (
                        <Tag tone="mute">Anulada</Tag>
                      ) : sale.method === PAYROLL_DEDUCTION ? (
                        <Tag tone="warn">Planilla</Tag>
                      ) : (
                        <Tag tone="ok">{sale.method}</Tag>
                      )}
                    </td>
                    <td className="num">{money(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="section-note">Para anular una compra usa Punto de venta › Historial; la existencia regresa y, si era por planilla, ya no se descuenta.</p>
      </div>
    </div>
  )
}
