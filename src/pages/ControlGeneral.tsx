import { useMemo, useState } from 'react'
import { Metrics } from '../components/ui'
import { CONTROL_COUNTS, CONTROL_MONEY, controlFilename, controlGroups, controlSheet } from '../control'
import { downloadControlExcel, downloadControlPdf } from '../controlExport'
import { count, isoDate, money } from '../format'
import { buildJournal, incomeStatement } from '../ledger'
import { payableBalance, round2 } from '../ops'
import { useStore } from '../store'
import type { ControlField } from '../types'

export function ControlGeneral() {
  const { state, setControl } = useStore()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const entries = useMemo(() => buildJournal(state), [state])
  const result = incomeStatement(entries, `${year}-01-01`, `${year}-12-31`)
  const yearEgresos = state.movements.filter((item) => item.type === 'egreso' && item.date.startsWith(String(year)))
  const fixedSpent = round2(yearEgresos.filter((item) => item.fixedId).reduce((sum, item) => sum + item.amount, 0))
  const generated = round2(yearEgresos.filter((item) => !item.fixedId).reduce((sum, item) => sum + item.amount, 0))
  const open = (state.payables ?? []).filter((item) => payableBalance(item) > 0)
  const owed = round2(open.reduce((sum, item) => sum + payableBalance(item), 0))
  const late = open.filter((item) => item.dueDate < isoDate()).length
  const [busy, setBusy] = useState<'excel' | 'pdf' | ''>('')
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState(false)
  const sheet = controlSheet(year, state.controlRows ?? [])
  const groups = controlGroups([...CONTROL_MONEY, ...CONTROL_COUNTS])

  async function onExcel() {
    setBusy('excel')
    setFailed(false)
    setNote('')
    try {
      await downloadControlExcel(sheet)
      setNote(`Se descargó ${controlFilename(year, 'xlsx')}.`)
    } catch {
      setFailed(true)
      setNote('No se pudo armar el Excel. Inténtalo de nuevo.')
    } finally {
      setBusy('')
    }
  }

  function onPdf() {
    setBusy('pdf')
    setFailed(false)
    setNote('')
    try {
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
          <p className="hint">Un renglón por mes. Gastos, disponible y los totales se calculan al escribir. PDF y Excel bajan esta misma hoja.</p>
          {note && <p className={failed ? 'excel-note is-error' : 'excel-note'}>{note}</p>}
        </div>
        <div className="export-row control-actions">
          <label className="field">
            <span>Año</span>
            <input className="num" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value) || year)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== ''} onClick={() => void onExcel()}>
            {busy === 'excel' ? 'Preparando…' : 'Excel'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={onPdf}>
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
      <p className="hint" style={{ margin: 0 }}>Las cifras de arriba salen solas del sistema. La hoja de abajo es el control manual de siempre.</p>

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
              {CONTROL_MONEY.map((column) => (
                <th key={column.field}>{column.label}</th>
              ))}
              <th>Gastos</th>
              <th>Disponible</th>
              <th>Total</th>
              {CONTROL_COUNTS.map((column) => (
                <th key={column.field}>{column.label}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sheet.months.map((line) => (
                <tr key={line.label}>
                  <th className="month">{line.label}</th>
                  {CONTROL_MONEY.map((column) => (
                    <td key={column.field}>
                      <Cell year={year} month={line.month} field={column.field} value={line.values[column.field]} money onSave={setControl} />
                    </td>
                  ))}
                  <td className="control-calc num">{money(line.gastos)}</td>
                  <td className="control-calc num">{money(line.disponible)}</td>
                  <td className="control-calc num">{money(line.servicio)}</td>
                  {CONTROL_COUNTS.map((column) => (
                    <td key={column.field}>
                      <Cell year={year} month={line.month} field={column.field} value={line.values[column.field]} onSave={setControl} />
                    </td>
                  ))}
                  <td className="control-calc num">{line.paquetes || ''}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="month">Total</th>
              {CONTROL_MONEY.map((column) => (
                <td key={column.field} className="num">
                  {money(sheet.totals.values[column.field])}
                </td>
              ))}
              <td className="num">{money(sheet.totals.gastos)}</td>
              <td className="num">{money(sheet.totals.disponible)}</td>
              <td className="num">{money(sheet.totals.servicio)}</td>
              {CONTROL_COUNTS.map((column) => (
                <td key={column.field} className="num">
                  {sheet.totals.values[column.field] || ''}
                </td>
              ))}
              <td className="num">{sheet.totals.paquetes || ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function Cell({
  year,
  month,
  field,
  value,
  money: asMoney,
  onSave,
}: {
  year: number
  month: number
  field: ControlField
  value: number
  money?: boolean
  onSave: (year: number, month: number, field: ControlField, value: number) => void
}) {
  return (
    <input
      className="num"
      inputMode="decimal"
      defaultValue={value ? String(value) : ''}
      key={`${year}-${month}-${field}-${value}`}
      aria-label={`${field} ${month}`}
      onBlur={(event) => {
        const next = Number(event.target.value.replace(',', '.'))
        const amount = Number.isFinite(next) ? next : 0
        if (amount !== value) onSave(year, month, field, asMoney ? amount : Math.round(amount))
      }}
    />
  )
}
