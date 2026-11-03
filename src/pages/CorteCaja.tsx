import { useState } from 'react'
import { amountOf, Field, Flash, Metrics, Tag } from '../components/ui'
import { count, isoDate, longDate, money } from '../format'
import { cashSummary } from '../ops'
import { useStore } from '../store'

export function CorteCaja() {
  const { state, closeCash } = useStore()
  const [date, setDate] = useState(isoDate())
  const [opening, setOpening] = useState(() => String(state.settings.cashFloat ?? 0))
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const closes = state.cashCloses ?? []
  const closed = closes.find((item) => item.date === date)
  const summary = cashSummary(state.movements, date, closed ? closed.opening : amountOf(opening) || 0)
  const countedValue = counted.trim() ? amountOf(counted) : NaN
  const difference = Number.isFinite(countedValue) ? Math.round((countedValue - summary.expected) * 100) / 100 : null
  const names = new Map(state.users.map((user) => [user.id, user.name]))
  const charges = summary.movements.filter((item) => item.type === 'ingreso').length

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Ventas y caja</p>
          <h1>Corte de caja</h1>
          <p className="lede">Cuadra el efectivo del día contra lo registrado. Después del corte, ese día ya no admite cobros ni pagos nuevos.</p>
        </div>
        <label className="field">
          <span>Día</span>
          <input type="date" value={date} max={isoDate()} onChange={(event) => setDate(event.target.value || isoDate())} />
        </label>
      </header>

      <Metrics
        items={[
          { label: 'Ingresos del día', value: money(summary.income), detail: count(charges, 'cobro', 'cobros'), tone: 'ok' },
          { label: 'Egresos del día', value: money(summary.expense), tone: 'hot' },
          { label: 'Efectivo esperado', value: money(summary.expected), detail: `Fondo ${money(summary.opening)} + entradas ${money(summary.cashIn)} − salidas ${money(summary.cashOut)}` },
          { label: 'Pedidos por cobrar', value: money(summary.pending), detail: 'Fuera del corte hasta cobrarlos' },
        ]}
      />

      <div className="biz-split">
        <div className="ledger">
          <header className="module-bar">
            <h2>{closed ? 'Corte cerrado' : 'Cerrar el día'}</h2>
            {closed ? <Tag tone="ok">Cerrado</Tag> : <Tag tone="warn">Abierto</Tag>}
          </header>
          {closed ? (
            <div className="statement">
              <div>
                <span>Fondo inicial</span>
                <span>{money(closed.opening)}</span>
              </div>
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
                setNotice(`Corte del ${longDate(date)} cerrado.`)
                setCounted('')
                setNote('')
              }}
            >
              <div className="form-pair">
                <Field label="Fondo inicial (Q)">
                  <input className="num" inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} />
                </Field>
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
                Cerrar caja del día
              </button>
            </form>
          )}
          {closed && notice ? <Flash notice={notice} /> : null}
        </div>

        <div className="ledger">
          <header className="module-bar">
            <h2>Por método de pago</h2>
            <span>{longDate(date)}</span>
          </header>
          {Object.keys(summary.byMethod).length === 0 ? (
            <p className="empty" style={{ margin: 14 }}>Sin movimientos ese día.</p>
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
            <h2>Movimientos del día</h2>
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
                  <th>Día</th>
                  <th className="num">Fondo</th>
                  <th className="num">Esperado</th>
                  <th className="num">Contado</th>
                  <th className="num">Diferencia</th>
                  <th>Cerró</th>
                </tr>
              </thead>
              <tbody>
                {closes.map((item) => (
                  <tr key={item.id} className={item.date === date ? 'is-picked' : ''}>
                    <td>
                      <button type="button" className="linkish" onClick={() => setDate(item.date)}>
                        {longDate(item.date)}
                      </button>
                    </td>
                    <td className="num">{money(item.opening)}</td>
                    <td className="num">{money(item.expected)}</td>
                    <td className="num">{money(item.counted)}</td>
                    <td className={`num ${item.difference === 0 ? 'check-ok' : 'check-bad'}`}>{money(item.difference)}</td>
                    <td>{names.get(item.closedBy ?? '') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
