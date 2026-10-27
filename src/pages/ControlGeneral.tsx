import { useState } from 'react'
import { CONTROL_COUNTS, CONTROL_MONEY, controlFilename, controlGroups, controlSheet } from '../control'
import { downloadControlExcel, downloadControlPdf } from '../controlExport'
import { money } from '../format'
import { useStore } from '../store'
import type { ControlField } from '../types'

export function ControlGeneral() {
  const { state, setControl } = useStore()
  const [year, setYear] = useState(() => new Date().getFullYear())
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
          <p className="eyebrow">Equipo</p>
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
