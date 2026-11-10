import { useState } from 'react'
import { METHODS as PAY_METHODS } from '../catalog'
import { amountOf, Field, Flash, Metrics, Tabs, Tag } from '../components/ui'
import { count, hoursLabel, isoDate, longDate, money, monthTitle, shiftMonth } from '../format'
import { attendanceOf, employeeOwed, round2, type WorkerPatch } from '../ops'
import { LEGAL_BONUS, PAYROLL_RATES, averageCommission, laborLiability, payrollLine, payrollTotals, workersOf, type PayrollAdjust } from '../payroll'
import { useStore } from '../store'
import type { User } from '../types'


const pct = (value: number) => `${round2(value * 100)} %`

export function Planilla() {
  const [tab, setTab] = useState<'pago' | 'equipo' | 'pasivo' | 'historial'>('pago')
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Planilla</h1>
          <p className="lede">
            Salario, comisión sobre servicios atendidos, bonificación incentivo e IGSS. Las prestaciones (aguinaldo, bono 14, vacaciones e indemnización) se provisionan cada mes.
          </p>
        </div>
      </header>
      <Tabs
        label="Secciones de planilla"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pago', label: 'Pago del mes' },
          { id: 'equipo', label: 'Salarios, comisiones y metas' },
          { id: 'pasivo', label: 'Pasivo laboral' },
          { id: 'historial', label: 'Historial' },
        ]}
      />
      {tab === 'pago' ? <Run /> : tab === 'equipo' ? <Workers /> : tab === 'pasivo' ? <Liabilities /> : <History />}
    </section>
  )
}

function Run() {
  const { state, payPayroll } = useStore()
  const [period, setPeriod] = useState(() => isoDate().slice(0, 7))
  const [adjust, setAdjust] = useState<Record<string, { extra: string; deductions?: string }>>({})
  const [method, setMethod] = useState('Transferencia')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const workers = workersOf(state.users)
  const paid = (state.payrolls ?? []).find((item) => item.period === period)
  const owed = Object.fromEntries(workers.map((user) => [user.id, employeeOwed(state, user.id)]))
  const deductionText = (id: string) => adjust[id]?.deductions ?? (owed[id] ? String(owed[id]) : '')
  const adjustOf = (id: string): PayrollAdjust => {
    const deductions = amountOf(deductionText(id)) || 0
    return { extra: amountOf(adjust[id]?.extra ?? '') || 0, deductions, purchases: Math.min(owed[id] ?? 0, deductions) }
  }
  const lines = paid ? paid.lines : workers.map((user) => payrollLine(user, state.appointments, period, adjustOf(user.id)))
  const totals = payrollTotals(lines)
  const setField = (id: string, key: 'extra' | 'deductions', value: string) =>
    setAdjust((current) => ({ ...current, [id]: { extra: current[id]?.extra ?? '', deductions: deductionText(id), [key]: value } }))

  return (
    <div className="biz-stack">
      <div className="biz-row" style={{ justifyContent: 'space-between' }}>
        <div className="month-switch">
          <button
            type="button"
            className="cal-arrow"
            aria-label="Mes anterior"
            onClick={() => {
              setAdjust({})
              setPeriod((value) => shiftMonth(`${value}-01`, -1).slice(0, 7))
            }}
          >
            ‹
          </button>
          <strong>{monthTitle(`${period}-01`)}</strong>
          <button
            type="button"
            className="cal-arrow"
            aria-label="Mes siguiente"
            onClick={() => {
              setAdjust({})
              setPeriod((value) => shiftMonth(`${value}-01`, 1).slice(0, 7))
            }}
          >
            ›
          </button>
        </div>
        {paid ? <Tag tone="ok">Pagada el {longDate(paid.paidAt)} · {paid.document}</Tag> : <Tag tone="warn">Pendiente de pago</Tag>}
      </div>
      <Metrics
        items={[
          { label: 'Líquido a pagar', value: money(totals.net), tone: 'hot', detail: count(lines.length, 'trabajador', 'trabajadores') },
          { label: 'Comisiones', value: money(totals.commission) },
          { label: 'IGSS laboral + patronal', value: money(round2(totals.igss + totals.employerIgss)), detail: 'Queda en facturas por pagar' },
          { label: 'Costo total del mes', value: money(totals.cost), detail: `Incluye ${money(totals.provisions)} de prestaciones` },
        ]}
      />
      {workers.length === 0 && !paid ? (
        <p className="empty">No hay trabajadores activos con código. Se agregan en Equipo › Trabajadores.</p>
      ) : (
        <div className="ledger">
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th className="num">Asistencia</th>
                  <th className="num">Salario</th>
                  <th className="num">Comisión</th>
                  <th className="num">Bonif.</th>
                  <th className="num">Extras</th>
                  <th className="num">IGSS</th>
                  <th className="num">Descuentos</th>
                  <th className="num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.userId}>
                    <td>
                      <strong>{line.name}</strong>
                      <small>
                        {line.code} · {count(line.services, 'servicio', 'servicios')} por {money(line.servicesBase)} al {line.commissionRate} %
                      </small>
                      {line.purchases ? <small>Incluye {money(line.purchases)} de compras en tienda</small> : null}
                    </td>
                    <td className="num">
                      {count(attendanceOf(state.attendance, line.userId, period).days, 'día', 'días')}
                      <small>{hoursLabel(attendanceOf(state.attendance, line.userId, period).hours)}</small>
                    </td>
                    <td className="num">{money(line.salary)}</td>
                    <td className="num">{money(line.commission)}</td>
                    <td className="num">{money(line.bonus)}</td>
                    <td className="num">
                      {paid ? money(line.extra) : <input inputMode="decimal" value={adjust[line.userId]?.extra ?? ''} onChange={(event) => setField(line.userId, 'extra', event.target.value)} aria-label={`Extras de ${line.name}`} placeholder="0" />}
                    </td>
                    <td className="num hot-text">− {money(line.igss)}</td>
                    <td className="num">
                      {paid ? (
                        money(line.deductions)
                      ) : (
                        <input inputMode="decimal" value={deductionText(line.userId)} onChange={(event) => setField(line.userId, 'deductions', event.target.value)} aria-label={`Descuentos de ${line.name}`} placeholder="0" />
                      )}
                    </td>
                    <td className="num">
                      <strong>{money(line.net)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="num">{money(totals.salary)}</td>
                  <td className="num">{money(totals.commission)}</td>
                  <td className="num">{money(totals.bonus)}</td>
                  <td className="num">{money(totals.extra)}</td>
                  <td className="num">{money(totals.igss)}</td>
                  <td className="num">{money(totals.deductions)}</td>
                  <td className="num">{money(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="statement">
            <div className="head">
              <span>Costo patronal del mes</span>
              <span />
            </div>
            <div>
              <span>Cuota patronal IGSS, IRTRA e INTECAP ({pct(PAYROLL_RATES.igssPatronal)})</span>
              <span>{money(totals.employerIgss)}</span>
            </div>
            <div>
              <span>Provisión de aguinaldo, bono 14, vacaciones e indemnización</span>
              <span>{money(totals.provisions)}</span>
            </div>
          </div>
          {!paid ? (
            <div className="biz-form">
              <div className="biz-row">
                <Field label="Pagar con">
                  <select value={method} onChange={(event) => setMethod(event.target.value)}>
                    {PAY_METHODS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const result = payPayroll({ period, lines, method, date: isoDate() })
                    if (!result.ok) {
                      setError(result.error)
                      setNotice('')
                      return
                    }
                    setError('')
                    setNotice(`Planilla de ${monthTitle(`${period}-01`).toLowerCase()} pagada con ${result.value.document}. Las cuotas del IGSS quedaron en facturas por pagar.`)
                    setAdjust({})
                  }}
                >
                  Registrar pago de planilla
                </button>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                IGSS laboral {pct(PAYROLL_RATES.igssLaboral)} sobre salario, comisión y extras. Bonificación incentivo de ley {money(LEGAL_BONUS)}, libre de IGSS. Conviene confirmar los porcentajes con el contador cada año.
              </p>
            </div>
          ) : null}
          <div style={{ padding: '0 18px 12px' }}>
            <Flash error={error} notice={notice} />
          </div>
        </div>
      )}
    </div>
  )
}

function Workers() {
  const { state, updateWorker } = useStore()
  const workers = workersOf(state.users)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  if (workers.length === 0) return <p className="empty">No hay trabajadores activos con código. Se agregan en Equipo › Trabajadores.</p>
  return (
    <div className="biz-stack">
      <Flash error={error} notice={notice} />
      <div className="team-board">
        {workers.map((user) => (
          <WorkerCard
            key={`${user.id}-${user.salary}-${user.commissionRate}-${user.bonus}-${user.hiredAt}-${user.salesGoal}-${user.servicesGoal}`}
            user={user}
            onSave={(patch) => {
              const result = updateWorker(user.id, patch)
              if (!result.ok) {
                setError(result.error)
                setNotice('')
                return
              }
              setError('')
              setNotice(`${user.name}: datos de planilla guardados.`)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function WorkerCard({ user, onSave }: { user: User; onSave: (patch: WorkerPatch) => void }) {
  const [form, setForm] = useState({
    salary: user.salary !== undefined ? String(user.salary) : '',
    commissionRate: user.commissionRate !== undefined ? String(user.commissionRate) : '',
    bonus: user.bonus !== undefined ? String(user.bonus) : String(LEGAL_BONUS),
    hiredAt: user.hiredAt ?? '',
    salesGoal: user.salesGoal ? String(user.salesGoal) : '',
    servicesGoal: user.servicesGoal ? String(user.servicesGoal) : '',
  })
  return (
    <form
      className="ledger biz-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          salary: form.salary.trim() ? amountOf(form.salary) : undefined,
          commissionRate: form.commissionRate.trim() ? amountOf(form.commissionRate) : undefined,
          bonus: form.bonus.trim() ? amountOf(form.bonus) : undefined,
          hiredAt: form.hiredAt || undefined,
          salesGoal: form.salesGoal.trim() ? amountOf(form.salesGoal) : undefined,
          servicesGoal: form.servicesGoal.trim() ? Math.floor(amountOf(form.servicesGoal)) : undefined,
        })
      }}
    >
      <h2>
        {[user.name, user.lastName].filter(Boolean).join(' ')} <small className="hint">· {user.employeeCode}</small>
      </h2>
      <div className="form-pair">
        <Field label="Salario mensual (Q)">
          <input className="num" inputMode="decimal" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} />
        </Field>
        <Field label="Comisión (%)">
          <input className="num" inputMode="decimal" value={form.commissionRate} onChange={(event) => setForm({ ...form, commissionRate: event.target.value })} placeholder="0" />
        </Field>
        <Field label="Bonificación incentivo (Q)">
          <input className="num" inputMode="decimal" value={form.bonus} onChange={(event) => setForm({ ...form, bonus: event.target.value })} />
        </Field>
        <Field label="Fecha de ingreso">
          <input type="date" value={form.hiredAt} max={isoDate()} onChange={(event) => setForm({ ...form, hiredAt: event.target.value })} />
        </Field>
        <Field label="Meta de ventas al mes (Q)">
          <input className="num" inputMode="decimal" value={form.salesGoal} onChange={(event) => setForm({ ...form, salesGoal: event.target.value })} placeholder="Sin meta" />
        </Field>
        <Field label="Meta de servicios al mes">
          <input className="num" inputMode="numeric" value={form.servicesGoal} onChange={(event) => setForm({ ...form, servicesGoal: event.target.value })} placeholder="Sin meta" />
        </Field>
      </div>
      <button type="submit" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}>
        Guardar
      </button>
    </form>
  )
}

function Liabilities() {
  const { state } = useStore()
  const rows = workersOf(state.users).map((user) => laborLiability(user, isoDate(), averageCommission(user.id, state.payrolls ?? [])))
  const total = (pick: (row: (typeof rows)[number]) => number) => money(round2(rows.reduce((sum, row) => sum + pick(row), 0)))
  return (
    <div className="biz-stack">
      <Metrics
        items={[
          { label: 'Pasivo laboral total', value: total((row) => row.total), tone: 'hot', detail: `Al ${longDate(isoDate())}` },
          { label: 'Indemnización', value: total((row) => row.indemnizacion), detail: 'Un salario por año trabajado' },
          { label: 'Aguinaldo y bono 14', value: total((row) => row.aguinaldo + row.bono14), detail: 'Proporcional del ciclo vigente' },
          { label: 'Vacaciones', value: total((row) => row.vacaciones), detail: '15 días hábiles por año' },
        ]}
      />
      <div className="ledger">
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th className="num">Antigüedad</th>
                <th className="num">Aguinaldo</th>
                <th className="num">Bono 14</th>
                <th className="num">Vacaciones</th>
                <th className="num">Indemnización</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.hiredAt ? `Ingresó el ${longDate(row.hiredAt)} · base ${money(row.salary)}` : 'Falta fecha de ingreso o salario'}</small>
                  </td>
                  <td className="num">{row.hiredAt ? count(row.years, 'año', 'años') : '—'}</td>
                  <td className="num">{money(row.aguinaldo)}</td>
                  <td className="num">{money(row.bono14)}</td>
                  <td className="num">{money(row.vacaciones)}</td>
                  <td className="num">{money(row.indemnizacion)}</td>
                  <td className="num">
                    <strong>{money(row.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className="empty" style={{ margin: 14 }}>Sin trabajadores activos.</p> : null}
        <p className="section-note">
          La base es el salario vigente más el promedio de comisiones de las últimas seis planillas. El aguinaldo corre del 1 de diciembre y el bono 14 del 1 de julio; las vacaciones
          desde el último aniversario. La indemnización suma la sexta parte por aguinaldo y bono 14. Cuando pagues aguinaldo, bono 14, vacaciones o una indemnización, regístralo en
          Gastos con la categoría “Prestaciones laborales”.
        </p>
      </div>
    </div>
  )
}

function History() {
  const { state, voidPayroll } = useStore()
  const runs = state.payrolls ?? []
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [arm, setArm] = useState<string | null>(null)
  if (runs.length === 0) return <p className="empty">Todavía no se ha pagado ninguna planilla.</p>
  return (
    <div className="biz-stack">
      <Flash error={error} notice={notice} />
      <div className="ledger">
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Pago</th>
                <th className="num">Líquido</th>
                <th className="num">Costo total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const totals = payrollTotals(run.lines)
                return (
                  <tr key={run.id}>
                    <td>
                      <strong>{monthTitle(`${run.period}-01`)}</strong>
                      <small>{run.lines.map((line) => line.name).join(', ')}</small>
                    </td>
                    <td>
                      {run.document} · {run.method}
                      <small>{longDate(run.paidAt)}</small>
                    </td>
                    <td className="num">{money(totals.net)}</td>
                    <td className="num">{money(totals.cost)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${arm === run.id ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => {
                            if (arm !== run.id) {
                              setArm(run.id)
                              return
                            }
                            const result = voidPayroll(run.id)
                            setArm(null)
                            if (!result.ok) {
                              setError(result.error)
                              setNotice('')
                              return
                            }
                            setError('')
                            setNotice(`Planilla ${run.period} anulada.`)
                          }}
                        >
                          {arm === run.id ? 'Confirmar anulación' : 'Anular'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
