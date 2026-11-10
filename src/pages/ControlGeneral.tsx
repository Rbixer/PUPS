import { useMemo, useState } from 'react'
import { Metrics } from '../components/ui'
import { CONTROL_COLUMNS, CONTROL_GOAL, columnValue, controlFilename, controlGroups, controlSheet, type ControlColumn, type ControlLine } from '../control'
import { count, isoDate, money, parseAmount } from '../format'
import { buildJournal, incomeStatement } from '../ledger'
import { payableBalance, PETTY_REFILL, round2 } from '../ops'
import { useStore } from '../store'
import type { ControlField } from '../types'

export function ControlGeneral() {
  const { state, setControl, updateSettings } = useStore()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const entries = useMemo(() => buildJournal(state), [state])
  const result = incomeStatement(entries, `${year}-01-01`, `${year}-12-31`)
  const yearEgresos = state.movements.filter((item) => item.type === 'egreso' && item.category !== PETTY_REFILL && item.date.startsWith(String(year)))
  const fixedSpent = round2(yearEgresos.filter((item) => item.fixedId).reduce((sum, item) => sum + item.amount, 0))
  const generated = round2(yearEgresos.filter((item) => !item.fixedId).reduce((sum, item) => sum + item.amount, 0))
  const open = (state.payables ?? []).filter((item) => payableBalance(item) > 0)
  const owed = round2(open.reduce((sum, item) => sum + payableBalance(item), 0))
  const late = open.filter((item) => item.dueDate < isoDate()).length
  const [busy, setBusy] = useState<'excel' | 'pdf' | ''>('')
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState(false)
  const goal = state.settings.controlGoal ?? CONTROL_GOAL
  const sheet = useMemo(() => controlSheet(year, state.controlRows ?? [], state, goal), [state, year, goal])
  const groups = controlGroups(CONTROL_COLUMNS)
  const manualCount = sheet.months.reduce((total, line) => total + Object.keys(line.manual).length, 0)

  async function onExcel() {
    setBusy('excel')
    setFailed(false)
    setNote('')
    try {
      const { downloadControlExcel } = await import('../controlExport')
      await downloadControlExcel(sheet)
      setNote(`Se descargó ${controlFilename(year, 'xlsx')}.`)
    } catch {
      setFailed(true)
      setNote('No se pudo armar el Excel. Inténtalo de nuevo.')
    } finally {
      setBusy('')
    }
  }

  async function onPdf() {
    setBusy('pdf')
    setFailed(false)
    setNote('')
    try {
      const { downloadControlPdf } = await import('../controlExport')
      downloadControlPdf(sheet)
      setNote(`Se descargó ${controlFilename(year, 'pdf')}.`)
    } catch {
      setFailed(true)
      setNote('No se pudo armar el PDF. Inténtalo de nuevo.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Control general</h1>
          <p className="hint">Un renglón por mes, con las mismas columnas del control en Excel. PDF y Excel bajan esta misma hoja.</p>
          {note && <p className={failed ? 'excel-note is-error' : 'excel-note'}>{note}</p>}
        </div>
        <div className="export-row control-actions">
          <label className="field">
            <span>Año</span>
            <input className="num" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value) || year)} />
          </label>
          <label className="field">
            <span>Meta de paquetes al mes</span>
            <input
              className="num"
              type="number"
              min={1}
              max={9999}
              defaultValue={goal}
              key={goal}
              onBlur={(event) => {
                const next = Math.round(Number(event.target.value))
                if (!Number.isFinite(next) || next < 1 || next > 9999) event.target.value = String(goal)
                else if (next !== goal) updateSettings({ controlGoal: next })
              }}
            />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== ''} onClick={() => void onExcel()}>
            {busy === 'excel' ? 'Preparando…' : 'Excel'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => void onPdf()}>
            {busy === 'pdf' ? 'Preparando…' : 'PDF'}
          </button>
        </div>
      </header>

      <Metrics
        items={[
          { label: `Utilidad neta ${year}`, value: money(result.net), tone: result.net >= 0 ? 'ok' : 'bad', detail: `Ingresos ${money(result.totalRevenue)} · margen ${result.margin} %` },
          { label: 'Gastos fijos pagados', value: money(fixedSpent), detail: count((state.fixedCosts ?? []).filter((item) => item.active).length, 'gasto fijo activo', 'gastos fijos activos') },
          { label: 'Gastos generados', value: money(generated), detail: 'Compras, planilla y operación' },
          { label: 'Facturas pendientes de pago', value: money(owed), tone: late ? 'bad' : owed ? 'hot' : undefined, detail: `${count(open.length, 'abierta', 'abiertas')} · ${count(late, 'vencida', 'vencidas')}` },
        ]}
      />
      <p className="hint" style={{ margin: 0 }}>
        Cada mes se llena solo con lo registrado en la app: cobros, ventas, gastos fijos, compras, planilla y constancias de grooming. Si escribes una cifra, queda fija y se marca
        en azul; bórrala para volver al cálculo.
        {manualCount > 0 && ` Este año hay ${count(manualCount, 'cifra escrita a mano', 'cifras escritas a mano')}.`}
      </p>

      <div className="control-scroll">
        <table className="control-table">
          <thead>
            <tr>
              <th className="month" rowSpan={2}>
                Mes
              </th>
              {groups.map((group) => (
                <th key={group.label} colSpan={group.span} className={`group-${group.tone}`}>
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {CONTROL_COLUMNS.map((column) => (
                <th key={column.field ?? `calc-${column.calc}`}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.months.map((line) => (
              <tr key={line.label}>
                <th className="month">{line.label}</th>
                {CONTROL_COLUMNS.map((column) =>
                  column.field ? (
                    <td key={column.field} className={line.manual[column.field] ? 'is-manual' : undefined}>
                      <Cell year={year} line={line} column={column} field={column.field} onSave={setControl} />
                    </td>
                  ) : (
                    <td key={`calc-${column.calc}`} className={`control-calc num${column.calc === 'disponible' && line.disponible < 0 ? ' is-loss' : ''}`}>
                      {shown(columnValue(line, column), column.money)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="month">Total</th>
              {CONTROL_COLUMNS.map((column) => (
                <td key={column.field ?? `calc-${column.calc}`} className="num">
                  {column.money ? money(columnValue(sheet.totals, column)) : shown(columnValue(sheet.totals, column), false)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function shown(value: number, asMoney: boolean) {
  if (asMoney) return money(value)
  return value ? value.toLocaleString('es-GT') : ''
}

function Cell({
  year,
  line,
  column,
  field,
  onSave,
}: {
  year: number
  line: ControlLine
  column: ControlColumn
  field: ControlField
  onSave: (year: number, month: number, field: ControlField, value: number | null) => void
}) {
  const value = line.values[field]
  const auto = line.auto[field]
  const manual = Boolean(line.manual[field])
  const text = value ? String(value) : ''
  const calculated = column.money ? money(auto) : String(auto)
  return (
    <input
      className="num"
      inputMode="decimal"
      defaultValue={text}
      key={`${year}-${line.month}-${field}-${value}-${manual}`}
      aria-label={`${column.label} · ${line.label}`}
      title={manual ? `Escrito a mano. La app calcula ${calculated}. Bórralo para volver al cálculo.` : 'Calculado por la app. Escribe otra cifra para fijarla.'}
      onBlur={(event) => {
        const raw = event.target.value.trim()
        if (!raw) {
          if (manual) onSave(year, line.month, field, null)
          else event.target.value = text
          return
        }
        const amount = parseAmount(raw)
        if (!Number.isFinite(amount) || (amount < 0 && field !== 'diferencia')) {
          event.target.value = text
          return
        }
        const next = column.money ? amount : Math.round(amount)
        if (manual && next === auto) onSave(year, line.month, field, null)
        else if (next !== value) onSave(year, line.month, field, next)
      }}
    />
  )
}
