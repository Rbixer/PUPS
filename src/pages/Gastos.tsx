import { useState } from 'react'
import { EXPENSE_METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { count, isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import {
  areaLabel,
  defaultArea,
  EXPENSE_AREAS,
  EXPENSE_CATEGORIES,
  payFixedCost as payFixedCostOp,
  PETTY_CASH,
  PETTY_REFILL,
  pettyBalance,
  round2,
  UTILITIES,
} from '../ops'
import { useStore } from '../store'
import type { ExpenseArea, FixedCost, Movement } from '../types'

const blankFixed = (): FixedCost => ({ id: '', name: '', category: 'Alquiler', amount: 0, day: 1, active: true, area: 'administrativo' })

function categoryOf(item: Movement) {
  return item.category ?? (item.purchaseId ? 'Compras' : 'Sin categoría')
}

/** Rubro de un egreso: el que se eligió o, en gastos viejos, el que corresponde a su categoría. */
function areaOf(item: Movement): ExpenseArea {
  if (item.area) return item.area
  if (item.purchaseId) return 'venta'
  return defaultArea(item.category ?? '')
}

const isRefill = (item: Movement) => item.category === PETTY_REFILL
/** Internet, agua, luz y móvil se pagan en su propia pestaña. */
const isUtility = (item: FixedCost) => (UTILITIES as readonly string[]).includes(item.category)

/** Gasto fijo del servicio básico, si ya existe. */
function utilityCost(list: FixedCost[], name: string) {
  return list.find((item) => item.category === name && item.active) ?? list.find((item) => item.category === name)
}

export function Gastos() {
  const { state } = useStore()
  const [tab, setTab] = useState<'mes' | 'servicios' | 'chica' | 'fijos'>('mes')
  const [cursor, setCursor] = useState(() => isoDate().slice(0, 7))
  const egresos = state.movements.filter((item) => item.type === 'egreso' && item.date.startsWith(cursor) && !isRefill(item))
  const fixed = (state.fixedCosts ?? []).filter((item) => item.active && !isUtility(item))
  const pendingFixed = fixed.filter((item) => !state.movements.some((move) => move.fixedId === item.id && move.period === cursor))
  const total = round2(egresos.reduce((sum, item) => sum + item.amount, 0))
  const petty = pettyBalance(state.movements)
  const utilitiesPaid = UTILITIES.filter((name) => {
    const cost = utilityCost(state.fixedCosts ?? [], name)
    return cost && state.movements.some((move) => move.fixedId === cost.id && move.period === cursor)
  }).length

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compras y gastos</p>
          <h1>Gastos</h1>
          <p className="lede">Los gastos salen de la caja chica y cada uno lleva su rubro: administrativos, venta o servicio.</p>
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
          { label: 'Caja chica', value: money(petty), tone: petty <= 0 ? 'bad' : undefined, detail: petty <= 0 ? 'Hay que reponerla' : 'Disponible para gastos' },
          { label: 'Servicios pagados', value: `${utilitiesPaid} de ${UTILITIES.length}`, tone: utilitiesPaid < UTILITIES.length ? 'bad' : 'ok', detail: 'Internet, agua, luz y móvil' },
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
          { id: 'servicios', label: 'Pago de servicios', count: UTILITIES.length - utilitiesPaid },
          { id: 'chica', label: 'Caja chica' },
          { id: 'fijos', label: 'Gastos fijos', count: pendingFixed.length },
        ]}
      />
      {tab === 'mes' ? <MonthExpenses cursor={cursor} egresos={egresos} /> : null}
      {tab === 'servicios' ? <Utilities cursor={cursor} /> : null}
      {tab === 'chica' ? <PettyCash /> : null}
      {tab === 'fijos' ? <FixedCosts cursor={cursor} /> : null}
    </section>
  )
}

function Meter({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const peak = Math.max(...rows.map((row) => row[1]), 1)
  return (
    <article className="panel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
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
  )
}

function sumBy(items: Movement[], key: (item: Movement) => string): [string, number][] {
  const groups = new Map<string, number>()
  for (const item of items) groups.set(key(item), round2((groups.get(key(item)) ?? 0) + item.amount))
  return [...groups.entries()].sort((a, b) => b[1] - a[1])
}

function MonthExpenses({ cursor, egresos }: { cursor: string; egresos: Movement[] }) {
  const { state, addMovement } = useStore()
  const general = state.settings.taxRegime === 'general'
  const [form, setForm] = useState({
    date: isoDate(),
    category: 'Insumos de grooming',
    area: defaultArea('Insumos de grooming'),
    concept: '',
    amount: '',
    method: PETTY_CASH as string,
    notes: '',
    withTax: false,
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const petty = pettyBalance(state.movements)
  const empty = `Sin gastos en ${monthTitle(`${cursor}-01`).toLowerCase()}.`

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
              area: form.area,
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
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, area: defaultArea(event.target.value) })}>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Concepto">
            <input value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} required />
          </Field>
          <div className="form-trio">
            <Field label="Monto (Q)">
              <input className="num" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </Field>
            <Field label="Rubro">
              <select value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value as ExpenseArea })}>
                {EXPENSE_AREAS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pagado con">
              <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                {EXPENSE_METHODS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          {form.method === PETTY_CASH ? <p className="hint">En caja chica hay {money(petty)}.</p> : null}
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
        <Meter title="Por rubro" rows={sumBy(egresos, (item) => areaLabel(areaOf(item)))} empty={empty} />
        <Meter title="Por categoría" rows={sumBy(egresos, categoryOf)} empty={empty} />
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
                  <th>Rubro</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {egresos.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.concept}</strong>
                      <small>
                        {item.document} · {longDate(item.date)} · {item.method} · {categoryOf(item)}
                      </small>
                    </td>
                    <td>
                      <Tag tone={item.fixedId ? 'info' : 'mute'}>{areaLabel(areaOf(item))}</Tag>
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

function Utilities({ cursor }: { cursor: string }) {
  const { state, saveFixedCost, payFixedCost } = useStore()
  const list = state.fixedCosts ?? []
  const today = isoDate()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [methods, setMethods] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function pay(name: string) {
    const amount = amountOf(amounts[name] ?? '')
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(`Escribe cuánto vino el recibo de ${name.toLowerCase()}.`)
      setNotice('')
      return
    }
    const method = methods[name] ?? PETTY_CASH
    let cost = utilityCost(list, name)
    const draft: FixedCost = { ...(cost ?? { id: 'nuevo', day: 10 }), name: cost?.name ?? name, category: name, amount, active: true, area: cost?.area ?? 'administrativo' }
    const check = payFixedCostOp({ ...state, fixedCosts: [draft, ...list.filter((item) => item.id !== draft.id)] }, { fixedId: draft.id, period: cursor, amount, method, date: today })
    if (!check.ok) {
      setError(check.error)
      setNotice('')
      return
    }
    if (!cost || !cost.active) {
      const saved = saveFixedCost(cost ? draft : { ...draft, id: '' })
      if (!saved.ok) {
        setError(saved.error)
        setNotice('')
        return
      }
      cost = saved.value
    }
    const result = payFixedCost({ fixedId: cost.id, period: cursor, amount, method, date: today })
    if (!result.ok) {
      setError(result.error)
      setNotice('')
      return
    }
    setError('')
    setNotice(`${name} de ${monthTitle(`${cursor}-01`).toLowerCase()} pagado con ${result.value.document}.`)
    setAmounts({ ...amounts, [name]: '' })
  }

  return (
    <div className="ledger">
      <header className="module-bar">
        <h2>Pago de servicios · {monthTitle(`${cursor}-01`)}</h2>
        <span>{money(pettyBalance(state.movements))} en caja chica</span>
      </header>
      <p className="section-note">Cada recibo cambia de mes a mes: anota el monto que vino y págalo. Quedan en el rubro administrativo.</p>
      <Flash error={error} notice={notice} />
      <div className="table-wrap">
        <table className="biz-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Estado</th>
              <th className="num">Monto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {UTILITIES.map((name) => {
              const cost = utilityCost(list, name)
              const paid = cost ? state.movements.find((move) => move.fixedId === cost.id && move.period === cursor) : undefined
              const last = cost
                ? state.movements.filter((move) => move.fixedId === cost.id).sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''))[0]
                : undefined
              return (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                    <small>
                      {paid
                        ? `${longDate(paid.date)} · ${paid.method}`
                        : last
                          ? `Último: ${money(last.amount)} en ${monthTitle(`${last.period}-01`).toLowerCase()}`
                          : 'Sin pagos registrados'}
                    </small>
                  </td>
                  <td>{paid ? <Tag tone="ok">Pagado {paid.document}</Tag> : <Tag tone="warn">Pendiente</Tag>}</td>
                  <td className="num">
                    {paid ? (
                      money(paid.amount)
                    ) : (
                      <input
                        className="num"
                        inputMode="decimal"
                        aria-label={`Monto de ${name}`}
                        placeholder={last ? String(last.amount) : 'Q'}
                        value={amounts[name] ?? ''}
                        onChange={(event) => setAmounts({ ...amounts, [name]: event.target.value })}
                        style={{ width: 110 }}
                      />
                    )}
                  </td>
                  <td>
                    {paid ? null : (
                      <div className="row-actions">
                        <select value={methods[name] ?? PETTY_CASH} onChange={(event) => setMethods({ ...methods, [name]: event.target.value })} aria-label={`Cómo se pagó ${name}`}>
                          {EXPENSE_METHODS.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => pay(name)}>
                          Pagar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PettyCash() {
  const { state, addMovement } = useStore()
  const balance = pettyBalance(state.movements)
  const moves = state.movements
    .filter((item) => item.type === 'egreso' && (isRefill(item) || item.method === PETTY_CASH))
    .sort((a, b) => b.date.localeCompare(a.date) || b.document.localeCompare(a.document))
    .slice(0, 60)
  const [form, setForm] = useState({ date: isoDate(), amount: '', method: 'Efectivo', notes: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <div className="biz-split">
      <form
        className="ledger biz-form"
        onSubmit={(event) => {
          event.preventDefault()
          const result = addMovement({
            type: 'egreso',
            date: form.date,
            concept: 'Reposición de caja chica',
            amount: amountOf(form.amount),
            method: form.method,
            notes: form.notes,
            category: PETTY_REFILL,
          })
          if (!result.ok) {
            setError(result.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(`Caja chica repuesta con ${money(result.value.amount)}.`)
          setForm({ ...form, amount: '', notes: '' })
        }}
      >
        <h2>Reponer caja chica</h2>
        <p className="hint">
          Hay {money(balance)}. Reponer no es un gasto: pasa dinero de la caja o del banco a la caja chica. El gasto se registra cuando se paga algo con ella.
        </p>
        <div className="form-trio">
          <Field label="Fecha">
            <input type="date" value={form.date} max={isoDate()} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
          </Field>
          <Field label="Monto (Q)">
            <input className="num" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
          </Field>
          <Field label="Sale de">
            <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              <option value="Efectivo">Efectivo de la caja</option>
              <option value="Transferencia">Banco</option>
            </select>
          </Field>
        </div>
        <Field label="Nota">
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" />
        </Field>
        <Flash error={error} notice={notice} />
        <button type="submit" className="btn btn-primary">
          Reponer
        </button>
      </form>
      <div className="ledger">
        <header className="module-bar">
          <h2>Movimientos de caja chica</h2>
          <span>{money(balance)}</span>
        </header>
        {moves.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Todavía no hay movimientos. Empieza reponiendo la caja chica con el fondo que manejan.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <tbody>
                {moves.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.concept}</strong>
                      <small>
                        {item.document} · {longDate(item.date)}
                        {isRefill(item) ? ` · desde ${item.method === 'Efectivo' ? 'la caja' : 'el banco'}` : ` · ${areaLabel(areaOf(item))}`}
                      </small>
                    </td>
                    <td className={`num ${isRefill(item) ? 'ok-text' : 'hot-text'}`}>
                      {isRefill(item) ? '+' : '−'} {money(item.amount)}
                    </td>
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
  const list = (state.fixedCosts ?? []).filter((item) => !isUtility(item))
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
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alquiler del local, contador…" required />
        </Field>
        <div className="form-trio">
          <Field label="Categoría">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, area: defaultArea(event.target.value) })}>
              {EXPENSE_CATEGORIES.filter((item) => !(UTILITIES as readonly string[]).includes(item)).map((item) => (
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
        <Field label="Rubro">
          <select value={form.area ?? defaultArea(form.category)} onChange={(event) => setForm({ ...form, area: event.target.value as ExpenseArea })}>
            {EXPENSE_AREAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
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
          <p className="empty" style={{ margin: 14 }}>Agrega el alquiler y lo que se paga cada mes. Internet, agua, luz y móvil se pagan en Pago de servicios.</p>
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
                  const method = methods[item.id] ?? PETTY_CASH
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
                          {item.category} · {areaLabel(item.area ?? defaultArea(item.category))} · día {item.day}
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
                              {EXPENSE_METHODS.map((option) => (
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
