import { useState } from 'react'
import { amountOf, Field, Flash, Metrics, Tag } from '../components/ui'
import { count, isoDate, longDate, money } from '../format'
import { cashOnHand, cashPeriod, cashSplit, cashSummary, round2, sinceDeposit } from '../ops'
import { useStore } from '../store'
import type { CashSplit } from '../types'

const splitTotal = (part: CashSplit['facturado']) => round2(part.ventas + part.servicios)

function range(from: string, to: string) {
  return from === to ? longDate(to) : `${longDate(from)} al ${longDate(to)}`
}

export function CorteCaja() {
  const { state, closeCash } = useStore()
  const [date, setDate] = useState(isoDate())
  const [opening, setOpening] = useState(() => String(state.settings.cashFloat ?? 0))
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const closes = state.cashCloses ?? []
  const closed = closes.find((item) => (item.from ?? item.date) <= date && date <= item.date)
  const period = cashPeriod(state, date)
  const summary = closed
    ? cashSummary(state.movements, closed.date, closed.opening, { from: closed.from ?? closed.date, deposits: state.deposits })
    : cashSummary(state.movements, date, period.previous ? period.opening : amountOf(opening) || 0, { from: period.from, deposits: state.deposits })
  const split = closed?.split ?? summary.split
  const countedValue = counted.trim() ? amountOf(counted) : NaN
  const difference = Number.isFinite(countedValue) ? round2(countedValue - summary.expected) : null
  const names = new Map(state.users.map((user) => [user.id, user.name]))
  const charges = summary.movements.filter((item) => item.type === 'ingreso' && item.method !== 'Pedido').length

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Corte de caja</h1>
          <p className="lede">
            El efectivo se acumula de un corte al siguiente y solo baja con gastos en efectivo o con un depósito al banco. Si un día no se cerró, el siguiente corte lo incluye.
          </p>
        </div>
        <label className="field">
          <span>Día</span>
          <input type="date" value={date} max={isoDate()} onChange={(event) => setDate(event.target.value || isoDate())} />
        </label>
      </header>

      <Metrics
        items={[
          { label: 'Cobrado en el corte', value: money(summary.income), detail: `${count(charges, 'cobro', 'cobros')} · ${range(summary.from, summary.date)}`, tone: 'ok' },
          { label: 'Facturado', value: money(splitTotal(split.facturado)), detail: `Ventas ${money(split.facturado.ventas)} · servicios ${money(split.facturado.servicios)}` },
          { label: 'Sin factura', value: money(splitTotal(split.sinFactura)), detail: `Ventas ${money(split.sinFactura.ventas)} · servicios ${money(split.sinFactura.servicios)}` },
          {
            label: 'Efectivo esperado',
            value: money(summary.expected),
            detail: `Viene ${money(summary.opening)} + entradas ${money(summary.cashIn)} − salidas ${money(summary.cashOut)}${summary.deposited ? ` − depósitos ${money(summary.deposited)}` : ''}`,
          },
        ]}
      />

      <div className="biz-split">
        <div className="ledger">
          <header className="module-bar">
            <h2>{closed ? 'Corte cerrado' : 'Cerrar el corte'}</h2>
            {closed ? <Tag tone="ok">Cerrado</Tag> : <Tag tone="warn">Abierto</Tag>}
          </header>
          {closed ? (
            <div className="statement">
              <div>
                <span>Cubre</span>
                <span>{range(closed.from ?? closed.date, closed.date)}</span>
              </div>
              <div>
                <span>Efectivo al empezar</span>
                <span>{money(closed.opening)}</span>
              </div>
              {closed.deposited ? (
                <div>
                  <span>Depositado al banco</span>
                  <span>− {money(closed.deposited)}</span>
                </div>
              ) : null}
              <div>
                <span>Efectivo esperado</span>
                <span>{money(closed.expected)}</span>
              </div>
              <div>
                <span>Efectivo contado</span>
                <span>{money(closed.counted)}</span>
              </div>
              <div className="total">
                <span>Diferencia</span>
                <span className={closed.difference === 0 ? 'check-ok' : 'check-bad'}>{money(closed.difference)}</span>
              </div>
              <div className="indent">
                <span>
                  Cerró {names.get(closed.closedBy ?? '') ?? '—'} · {new Date(closed.closedAt).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span />
              </div>
              {closed.note ? (
                <div className="indent">
                  <span>{closed.note}</span>
                  <span />
                </div>
              ) : null}
            </div>
          ) : (
            <form
              className="biz-form"
              onSubmit={(event) => {
                event.preventDefault()
                const result = closeCash({ date, opening: amountOf(opening), counted: countedValue, note })
                if (!result.ok) {
                  setError(result.error)
                  setNotice('')
                  return
                }
                setError('')
                setNotice(`Corte del ${range(result.value.from ?? result.value.date, result.value.date)} cerrado.`)
                setCounted('')
                setNote('')
              }}
            >
              {summary.from !== date ? (
                <p className="hint">
                  Este corte cubre del {longDate(summary.from)} al {longDate(date)}, porque el último corte fue el {longDate(period.previous!.date)}.
                </p>
              ) : null}
              <div className="form-pair">
                {period.previous ? (
                  <div className="field">
                    <span>Efectivo al empezar</span>
                    <p className="num carry">
                      {money(period.opening)} <small>contado el {longDate(period.previous.date)}</small>
                    </p>
                  </div>
                ) : (
                  <Field label="Fondo inicial (Q)">
                    <input className="num" inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} />
                  </Field>
                )}
                <Field label="Efectivo contado (Q)">
                  <input className="num" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} required />
                </Field>
              </div>
              {difference !== null ? (
                <p className={difference === 0 ? 'check-ok' : 'check-bad'}>
                  {difference === 0 ? 'La caja cuadra.' : difference > 0 ? `Sobran ${money(difference)}.` : `Faltan ${money(-difference)}.`}
                </p>
              ) : null}
              <Field label="Observaciones">
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Obligatorio si hay diferencia" />
              </Field>
              <Flash error={error} notice={notice} />
              <button type="submit" className="btn btn-primary">
                Cerrar caja
              </button>
            </form>
          )}
          {closed && notice ? <Flash notice={notice} /> : null}

          <header className="module-bar">
            <h2>Facturado y sin factura</h2>
            <span>{range(summary.from, summary.date)}</span>
          </header>
          <div className="split-close">
            <SplitStatement title="Cierre facturado" part={split.facturado} />
            <SplitStatement title="Cierre sin factura" part={split.sinFactura} note="Ventas que salieron del inventario y servicios cobrados sin factura." />
          </div>
        </div>

        <div className="ledger">
          <header className="module-bar">
            <h2>Por método de pago</h2>
            <span>{range(summary.from, summary.date)}</span>
          </header>
          {Object.keys(summary.byMethod).length === 0 ? (
            <p className="empty" style={{ margin: 14 }}>Sin movimientos en esos días.</p>
          ) : (
            <div className="statement">
              {Object.entries(summary.byMethod).map(([method, amount]) => (
                <div key={method}>
                  <span>{method}</span>
                  <span className={amount >= 0 ? 'ok-text' : 'hot-text'}>{money(amount)}</span>
                </div>
              ))}
            </div>
          )}
          <header className="module-bar">
            <h2>Movimientos</h2>
            <span>{summary.movements.length}</span>
          </header>
          <div className="table-wrap">
            <table className="biz-table">
              <tbody>
                {summary.movements.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.concept}</strong>
                      <small>
                        {item.document} · {item.method}
                        {summary.from !== summary.date ? ` · ${longDate(item.date)}` : ''}
                        {item.type === 'ingreso' && item.method !== 'Pedido' ? (item.invoiced ? ' · con factura' : ' · sin factura') : ''}
                      </small>
                    </td>
                    <td className={`num ${item.type === 'ingreso' ? 'ok-text' : 'hot-text'}`}>
                      {item.type === 'ingreso' ? '+' : '−'} {money(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Deposits />

      <div className="ledger">
        <header className="module-bar">
          <h2>Cortes anteriores</h2>
          <span>{closes.length}</span>
        </header>
        {closes.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Todavía no hay cortes.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Cubre</th>
                  <th className="num">Facturado</th>
                  <th className="num">Sin factura</th>
                  <th className="num">Esperado</th>
                  <th className="num">Contado</th>
                  <th className="num">Diferencia</th>
                  <th>Cerró</th>
                </tr>
              </thead>
              <tbody>
                {[...closes]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((item) => {
                    const itemSplit = item.split ?? cashSplit(state.movements.filter((move) => (item.from ?? item.date) <= move.date && move.date <= item.date))
                    return (
                      <tr key={item.id} className={item.id === closed?.id ? 'is-picked' : ''}>
                        <td>
                          <button type="button" className="linkish" onClick={() => setDate(item.date)}>
                            {range(item.from ?? item.date, item.date)}
                          </button>
                        </td>
                        <td className="num">{money(splitTotal(itemSplit.facturado))}</td>
                        <td className="num">{money(splitTotal(itemSplit.sinFactura))}</td>
                        <td className="num">{money(item.expected)}</td>
                        <td className="num">{money(item.counted)}</td>
                        <td className={`num ${item.difference === 0 ? 'check-ok' : 'check-bad'}`}>{money(item.difference)}</td>
                        <td>{names.get(item.closedBy ?? '') ?? '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function SplitStatement({ title, part, note }: { title: string; part: CashSplit['facturado']; note?: string }) {
  return (
    <div className="statement">
      <div className="head">
        <span>{title}</span>
        <span />
      </div>
      <div>
        <span>Ventas</span>
        <span>{money(part.ventas)}</span>
      </div>
      <div>
        <span>Servicios</span>
        <span>{money(part.servicios)}</span>
      </div>
      <div className="total">
        <span>Total</span>
        <span>{money(splitTotal(part))}</span>
      </div>
      {note ? (
        <div className="indent">
          <span>{note}</span>
          <span />
        </div>
      ) : null}
    </div>
  )
}

function Deposits() {
  const { state, recordDeposit, removeDeposit } = useStore()
  const today = isoDate()
  const onHand = cashOnHand(state, today)
  const fund = state.settings.cashFloat ?? 0
  const suggested = round2(Math.max(0, onHand - fund))
  const since = sinceDeposit(state, today)
  const deposits = [...(state.deposits ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at))
  const names = new Map(state.users.map((user) => [user.id, user.name]))
  const [form, setForm] = useState({ date: today, amount: '', bank: '', reference: '', note: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <div className="ledger">
      <header className="module-bar">
        <h2>Depósitos al banco</h2>
        <span>{since.last ? `Último: ${longDate(since.last.date)}` : 'Sin depósitos'}</span>
      </header>
      <div className="biz-split deposit-split">
        <div>
          <div className="statement">
            <div>
              <span>Efectivo en caja hoy</span>
              <span>{money(onHand)}</span>
            </div>
            <div>
              <span>Fondo que se queda en caja</span>
              <span>− {money(fund)}</span>
            </div>
            <div className="total">
              <span>Para depositar</span>
              <span>{money(suggested)}</span>
            </div>
          </div>
          <div className="statement">
            <div className="head">
              <span>Cobrado desde el {longDate(since.from)}</span>
              <span />
            </div>
            <div>
              <span>Facturado</span>
              <span>{money(splitTotal(since.split.facturado))}</span>
            </div>
            <div>
              <span>Sin factura</span>
              <span>{money(splitTotal(since.split.sinFactura))}</span>
            </div>
            <div className="total">
              <span>Total</span>
              <span>{money(round2(splitTotal(since.split.facturado) + splitTotal(since.split.sinFactura)))}</span>
            </div>
          </div>
        </div>
        <form
          className="biz-form"
          onSubmit={(event) => {
            event.preventDefault()
            const result = recordDeposit({ ...form, amount: amountOf(form.amount) })
            if (!result.ok) {
              setError(result.error)
              setNotice('')
              return
            }
            setError('')
            setNotice(`Depósito de ${money(result.value.amount)} registrado. El efectivo en caja bajó.`)
            setForm({ date: today, amount: '', bank: form.bank, reference: '', note: '' })
          }}
        >
          <div className="form-pair">
            <Field label="Fecha">
              <input type="date" value={form.date} max={today} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
            </Field>
            <Field label="Monto (Q)">
              <input
                className="num"
                inputMode="decimal"
                value={form.amount}
                placeholder={suggested ? String(suggested) : ''}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                required
              />
            </Field>
            <Field label="Banco">
              <input value={form.bank} onChange={(event) => setForm({ ...form, bank: event.target.value })} placeholder="Ej. Banco Industrial" />
            </Field>
            <Field label="No. de boleta">
              <input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} required />
            </Field>
          </div>
          <Field label="Nota">
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Opcional" />
          </Field>
          <Flash error={error} notice={notice} />
          <button type="submit" className="btn btn-primary">
            Registrar depósito
          </button>
        </form>
      </div>
      {deposits.length ? (
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Banco y boleta</th>
                <th className="num">Monto</th>
                <th>Registró</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deposits.map((item) => (
                <tr key={item.id}>
                  <td>{longDate(item.date)}</td>
                  <td>
                    <strong>{item.bank || 'Banco'}</strong>
                    <small>
                      Boleta {item.reference}
                      {item.note ? ` · ${item.note}` : ''}
                    </small>
                  </td>
                  <td className="num">{money(item.amount)}</td>
                  <td>{names.get(item.userId ?? '') ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        if (!window.confirm(`¿Quitar el depósito de ${money(item.amount)}?`)) return
                        const result = removeDeposit(item.id)
                        setError(result.ok ? '' : result.error)
                        setNotice(result.ok ? 'Depósito quitado.' : '')
                      }}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
