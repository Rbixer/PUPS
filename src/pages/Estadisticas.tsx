import { useEffect, useMemo, useState } from 'react'
import { MonthReport } from '../components/MonthReport'
import { isoDate, money, monthStart, monthTitle, parseIso, shiftMonth, weekday } from '../format'
import { buildMonthReport, change, downloadExcel, excelFilename, rate } from '../report'
import { useStore } from '../store'

function dayCaption(iso: string) {
  const label = parseIso(iso).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric' })
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1)
}

function Donut({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let cursor = 0
  const slices = parts.filter((part) => part.value > 0)
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`${total} citas en el mes`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--cream)" strokeWidth="14" />
        {slices.map((part) => {
          const length = total ? (part.value / total) * circumference : 0
          const dash = `${length} ${circumference - length}`
          const offset = cursor
          cursor += length
          return (
            <circle
              key={part.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={part.color}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          )
        })}
        <text x="60" y="58" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-caption">
          citas
        </text>
      </svg>
      <ul className="legend">
        {parts.map((part) => (
          <li key={part.label}>
            <i style={{ background: part.color }} />
            <span>{part.label}</span>
            <b className="num">
              {part.value} · {rate(part.value, total)}%
            </b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Meter({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  const peak = Math.max(...rows.map((row) => row.value), 1)
  if (rows.length === 0) return <p className="empty">Este mes todavía no tiene este corte.</p>
  return (
    <div className="meter">
      {rows.map((row) => (
        <div key={row.label} className="meter-row">
          <div>
            <strong>{row.label}</strong>
            <div className="meter-track" aria-hidden="true">
              <div className="meter-fill" style={{ width: `${Math.max(4, (row.value / peak) * 100)}%` }} />
            </div>
          </div>
          <b className="num">{row.detail}</b>
        </div>
      ))}
    </div>
  )
}

export function Estadisticas() {
  const { state, allows } = useStore()
  const [cursor, setCursor] = useState(() => monthStart(isoDate()))
  const [preview, setPreview] = useState(false)
  const [excelNote, setExcelNote] = useState('')
  const [excelError, setExcelError] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const atPresent = cursor.slice(0, 7) >= isoDate().slice(0, 7)
  const report = useMemo(() => buildMonthReport(state, cursor), [state, cursor])
  const salesChange = change(report.sales, report.prevSales)
  const resultChange = change(report.result, report.prevResult)
  const peakSales = Math.max(...report.days.map((day) => day.sales), 1)
  const peakDay = report.days.reduce((best, day) => (day.sales > best.sales ? day : best), report.days[0])
  const peakHour = Math.max(...report.hours.map((hour) => hour.count), 1)
  const status = [
    { label: 'Completadas', value: report.done.length, color: '#5f7d6c' },
    { label: 'Pendientes', value: report.pending, color: '#c4784a' },
    { label: 'Canceladas', value: report.cancelled, color: '#b3a99d' },
  ]

  useEffect(() => {
    setExcelNote('')
    setExcelError(false)
  }, [report.key])

  useEffect(() => {
    if (!preview) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  async function onExcel() {
    setExcelBusy(true)
    setExcelError(false)
    setExcelNote('')
    try {
      await downloadExcel(report)
      setExcelNote(`Se descargó ${excelFilename(report)}.`)
    } catch {
      setExcelError(true)
      setExcelNote('No se pudo armar el Excel. Inténtalo de nuevo.')
    } finally {
      setExcelBusy(false)
    }
  }

  function onPdf() {
    const previous = document.title
    document.title = `PUP'S estadisticas ${report.key}`
    document.body.classList.add('report-print')
    const finish = () => {
      document.body.classList.remove('report-print')
      document.title = previous
      window.removeEventListener('afterprint', finish)
    }
    window.addEventListener('afterprint', finish)
    window.print()
  }

  return (
    <section className="stack stats">
      <header className="page-head">
        <div>
          <p className="eyebrow">Reportería</p>
          <h1>{monthTitle(cursor)}</h1>
          <p className="lede">El mes cerrado en una sola vista. Excel lleva las hojas y el PDF deja el informe listo para guardar.</p>
          {excelNote && <p className={excelError ? 'excel-note is-error' : 'excel-note'}>{excelNote}</p>}
        </div>
        <div className="export-row">
          <div className="month-switch">
            <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => setCursor((value) => shiftMonth(value, -1))}>
              ‹
            </button>
            <strong>{monthTitle(cursor)}</strong>
            <button
              type="button"
              className="cal-arrow"
              aria-label="Mes siguiente"
              disabled={atPresent}
              onClick={() => setCursor((value) => shiftMonth(value, 1))}
            >
              ›
            </button>
          </div>
          {allows('reportes') ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" disabled={excelBusy} onClick={() => void onExcel()}>
                {excelBusy ? 'Preparando…' : 'Excel'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreview(true)}>
                PDF
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="stats-hero">
        <div className="stats-lead">
          <span>Resultado de caja</span>
          <strong className={report.result >= 0 ? 'ok' : 'hot'}>{money(report.result)}</strong>
          <small className={`delta ${resultChange.tone}`}>{resultChange.label}</small>
          <p>
            Ingresos {money(report.income)} · egresos {money(report.expense)}
          </p>
        </div>
        <div className="stats-figures">
          <article>
            <span>Cobrado en citas</span>
            <strong className="num">{money(report.sales)}</strong>
            <small className={`delta ${salesChange.tone}`}>{salesChange.label}</small>
          </article>
          <article>
            <span>Ticket promedio</span>
            <strong className="num">{money(report.average)}</strong>
            <small className="delta flat">{report.done.length} citas completadas</small>
          </article>
          <article>
            <span>Cierre del mes</span>
            <strong className="num">{rate(report.done.length, report.appointments.length)}%</strong>
            <small className="delta flat">
              {report.pending} pendientes · {report.cancelled === 1 ? '1 cancelada' : `${report.cancelled} canceladas`}
            </small>
          </article>
          <article>
            <span>Mascotas</span>
            <strong className="num">{report.pets}</strong>
            <small className="delta flat">{report.clients} tutores</small>
          </article>
        </div>
      </section>

      <div className="metric-rail">
        <article>
          <span>Ingresos</span>
          <strong className="num ok">{money(report.income)}</strong>
        </article>
        <article>
          <span>Egresos</span>
          <strong className="num hot">{money(report.expense)}</strong>
        </article>
        <article>
          <span>WhatsApp</span>
          <strong className="num">{report.messages}</strong>
          <small>
            {report.unread} sin leer · {report.leads} del sitio
          </small>
        </article>
        <article>
          <span>Premium</span>
          <strong className="num">
            {report.premium}
            <em>/{report.done.length || 0}</em>
          </strong>
          <small>Completadas con plan premium</small>
        </article>
      </div>

      <div className="stat-board">
        <article className="panel">
          <h2>Cobro por día</h2>
          <p className="hint">
            {peakDay && peakDay.sales > 0
              ? `Día más alto: ${dayCaption(peakDay.date)} · ${money(peakDay.sales)}. La altura es el monto cobrado.`
              : 'Suma de las citas completadas. La altura es el monto, no la cantidad de mascotas.'}
          </p>
          <div className="pulse" role="list" tabIndex={0} aria-label="Cobro diario del mes, desplazable">
            {report.days.map((day) => (
              <div
                key={day.date}
                className={day.sales > 0 && day.date === peakDay?.date ? 'pulse-col is-peak' : 'pulse-col'}
                role="listitem"
                title={`${weekday(day.date)} ${Number(day.date.slice(8))} · ${money(day.sales)} · ${day.citas === 1 ? '1 cita' : `${day.citas} citas`}`}
              >
                <div className="pulse-track">
                  <div className="pulse-bar" style={{ height: `${day.sales ? Math.max(8, (day.sales / peakSales) * 100) : 0}%` }} />
                </div>
                <span>{Number(day.date.slice(8))}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Estado de las citas</h2>
          <Donut parts={status} total={report.appointments.length} />
          <p className="hint">
            {report.done.length === 0
              ? 'Este mes no tiene citas completadas.'
              : `Premium en completadas: ${report.premium} de ${report.done.length}.`}
          </p>
        </article>
      </div>

      <div className="stat-split">
        <article className="panel">
          <h2>Servicios</h2>
          <Meter
            rows={report.services.map(([name, slot]) => ({
              label: name,
              value: slot.amount || slot.count,
              detail: `${slot.count} · ${money(slot.amount)}`,
            }))}
          />
        </article>
        <article className="panel">
          <h2>Medios de pago</h2>
          <Meter
            rows={report.methods.map(([name, amount]) => ({
              label: name,
              value: amount,
              detail: money(amount),
            }))}
          />
          <h2>Tamaño en completadas</h2>
          <Meter
            rows={report.sizes.map(([name, count]) => ({
              label: name,
              value: count,
              detail: String(count),
            }))}
          />
        </article>
      </div>

      <div className="stat-split">
        <article className="panel">
          <h2>Horas con más citas</h2>
          <p className="hint">Cuenta pendientes y completadas. Canceladas no entran.</p>
          <div className="hour-grid">
            {report.hours.map((hour) => (
              <div key={hour.label} className="hour-cell">
                <span className="num">{hour.label}</span>
                <b className="num">{hour.count}</b>
                <div className="meter-track" aria-hidden="true">
                  <div className="meter-fill" style={{ width: `${hour.count ? Math.max(8, (hour.count / peakHour) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Tutores con más cobro</h2>
          {report.tutors.length === 0 ? (
            <p className="empty">Cuando se complete una cita, el tutor aparece aquí.</p>
          ) : (
            <ol className="rank">
              {report.tutors.slice(0, 5).map(([name, slot], index) => (
                <li key={name}>
                  <span className="num">{index + 1}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {slot.visits} {slot.visits === 1 ? 'visita' : 'visitas'}
                    </small>
                  </div>
                  <b className="num">{money(slot.amount)}</b>
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>

      {preview && (
        <div className="overlay report-overlay" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={() => setPreview(false)}>
          <div className="report-frame" onClick={(event) => event.stopPropagation()}>
            <div className="report-toolbar">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(false)}>
                Cerrar
              </button>
              {allows('reportes') ? (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={excelBusy} onClick={() => void onExcel()}>
                    {excelBusy ? 'Preparando…' : 'Excel'}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={onPdf}>
                    Guardar PDF
                  </button>
                </>
              ) : null}
            </div>
            <MonthReport report={report} />
          </div>
        </div>
      )}
    </section>
  )
}
