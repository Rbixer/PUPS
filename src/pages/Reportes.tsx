import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CONTROL_GOAL, controlFilename, controlSheet } from '../control'
import { isoDate, monthStart, monthTitle } from '../format'
import { balanceSheet, buildJournal, incomeStatement, taxMonths } from '../ledger'
import { iconTone, ModuleIcon } from '../modules'
import { buildMonthReport, downloadExcel, excelFilename } from '../report'
import { useStore } from '../store'
import type { Permission } from '../types'

type Report = {
  id: string
  to: string
  title: string
  detail: string
  /** Permiso para abrir el módulo que muestra el reporte. */
  permission: Permission
  download?: { label: string; run: () => Promise<string> }
}

function lastOfMonth(month: string) {
  const [year, number] = month.split('-').map(Number)
  return isoDate(new Date(year, number, 0))
}

export function Reportes() {
  const { state, allows } = useStore()
  const [month, setMonth] = useState(() => isoDate().slice(0, 7))
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const year = Number(month.slice(0, 4))

  useEffect(() => {
    document.title = "Reportes · PUP'S"
  }, [])

  const reports: Report[] = [
    {
      id: 'estadisticas',
      to: '/admin/estadisticas',
      title: 'Estadísticas del mes',
      detail: 'Citas, ventas, paquetes pagados, servicios y horas fuertes del mes.',
      permission: 'estadisticas',
      download: {
        label: 'Excel',
        run: async () => {
          const report = buildMonthReport(state, monthStart(`${month}-01`))
          await downloadExcel(report)
          return excelFilename(report)
        },
      },
    },
    {
      id: 'contabilidad',
      to: '/admin/contabilidad',
      title: 'Contabilidad',
      detail: 'Estado de resultados, balance, libro diario, bancos e impuestos.',
      permission: 'contabilidad',
      download: {
        label: 'Excel',
        run: async () => {
          const entries = buildJournal(state)
          const from = `${month}-01`
          const to = lastOfMonth(month)
          const statement = incomeStatement(entries, from, to)
          const sheet = balanceSheet(entries, to)
          const taxes = taxMonths(entries, state.settings, year)
          const filename = `pups-contabilidad-${month}.xlsx`
          const { downloadLedgerExcel } = await import('../ledgerExport')
          await downloadLedgerExcel({
            label: monthTitle(`${month}-01`),
            filename,
            entries: entries.filter((entry) => entry.date >= from && entry.date <= to),
            statement,
            sheet,
            taxes,
          })
          return filename
        },
      },
    },
    {
      id: 'control',
      to: '/admin/control',
      title: 'Control general del año',
      detail: 'Una fila por mes: paquetes, ingresos, gastos y meta.',
      permission: 'control',
      download: {
        label: 'Excel',
        run: async () => {
          const goal = state.settings.controlGoal ?? CONTROL_GOAL
          const sheet = controlSheet(year, state.controlRows ?? [], state, goal)
          const { downloadControlExcel } = await import('../controlExport')
          await downloadControlExcel(sheet)
          return controlFilename(year, 'xlsx')
        },
      },
    },
    { id: 'corte', to: '/admin/corte', title: 'Corte de caja', detail: 'Cierres del día y depósitos al banco.', permission: 'corte' },
    { id: 'inventario', to: '/admin/inventario', title: 'Inventario y kárdex', detail: 'Existencias, costos y movimientos de cada producto.', permission: 'inventario' },
    { id: 'planilla', to: '/admin/planilla', title: 'Planilla', detail: 'Pagos, comisiones, metas y pasivo laboral.', permission: 'planilla' },
    { id: 'compras', to: '/admin/compras', title: 'Compras y proveedores', detail: 'Lo comprado en el periodo y lo que se debe.', permission: 'compras' },
  ]

  async function onDownload(report: Report) {
    if (!report.download) return
    setBusy(report.id)
    setNote(null)
    try {
      const filename = await report.download.run()
      setNote({ tone: 'ok', text: `Se descargó ${filename}.` })
    } catch {
      setNote({ tone: 'error', text: 'No se pudo armar el archivo. Inténtalo de nuevo.' })
    } finally {
      setBusy('')
    }
  }

  const canDownload = allows('reportes')

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Reportes</h1>
          <p className="lede">Todos los reportes del negocio en un solo lugar. Abre uno para verlo completo o descárgalo en Excel.</p>
        </div>
        <label className="field">
          <span>Mes de los reportes</span>
          <input type="month" value={month} max={isoDate().slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        </label>
      </header>

      {note ? (
        <p className={note.tone === 'error' ? 'banner error' : 'banner'} role="status">
          {note.text}
        </p>
      ) : null}
      {!canDownload ? <p className="hint">Tu usuario puede ver los reportes, pero no descargarlos. Pídele al administrador el permiso «Descargar Excel / PDF».</p> : null}

      <ul className="modules-grid reports-grid">
        {reports.map((report) => {
          const open = allows(report.permission)
          return (
            <li key={report.id} className={open ? undefined : 'is-locked'}>
              <article className="module-card report-card" style={{ '--tone': iconTone(report.to) } as CSSProperties}>
                <span className="module-icon">
                  <ModuleIcon to={report.to} size={24} />
                </span>
                <span className="module-text">
                  <strong>{report.title}</strong>
                  <small>{report.detail}</small>
                  <span className="report-actions">
                    {open ? (
                      <Link className="btn btn-ghost btn-sm" to={report.to}>
                        Abrir
                      </Link>
                    ) : (
                      <span className="report-lock">Sin permiso para abrir este módulo</span>
                    )}
                    {open && canDownload && report.download ? (
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => void onDownload(report)}>
                        {busy === report.id ? 'Preparando…' : report.download.label}
                      </button>
                    ) : null}
                  </span>
                </span>
              </article>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
