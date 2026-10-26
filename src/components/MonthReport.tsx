import { formatName, longDate, money } from '../format'
import { change, planLabel, rate, statusLabel, type MonthReport as MonthFigures } from '../report'

export function MonthReport({ report }: { report: MonthFigures }) {
  const salesChange = change(report.sales, report.prevSales)
  const resultChange = change(report.result, report.prevResult)
  const busyHours = report.hours.filter((hour) => hour.count > 0)
  const peak = report.days.reduce((best, day) => (day.sales > best.sales ? day : best), report.days[0])

  return (
    <article className="report-sheet">
      <header className="report-mast">
        <img src="/logo.png" alt="PUP'S" />
        <div>
          <p className="eyebrow">PUP'S Pet Shop y Grooming</p>
          <h2 id="report-title">Estadísticas</h2>
          <p>{report.title} · Guatemala</p>
        </div>
        <p className="report-stamp">Generado el {longDate(report.generated)}</p>
      </header>

      <table className="report-summary">
        <tbody>
          <tr>
            <th>Resultado de caja</th>
            <td className="num">{money(report.result)}</td>
            <td>{resultChange.label}</td>
            <th>Cobrado en citas</th>
            <td className="num">{money(report.sales)}</td>
            <td>{salesChange.label}</td>
          </tr>
          <tr>
            <th>Ingresos</th>
            <td className="num">{money(report.income)}</td>
            <td>Egresos {money(report.expense)}</td>
            <th>Ticket promedio</th>
            <td className="num">{money(report.average)}</td>
            <td>{report.done.length} completadas</td>
          </tr>
          <tr>
            <th>Cierre</th>
            <td className="num">{rate(report.done.length, report.appointments.length)}%</td>
            <td>
              {report.pending} pendientes · {report.cancelled === 1 ? '1 cancelada' : `${report.cancelled} canceladas`}
            </td>
            <th>Mascotas</th>
            <td className="num">{report.pets}</td>
            <td>{report.clients} tutores · {report.messages} mensajes</td>
          </tr>
        </tbody>
      </table>

      <h3>Citas</h3>
      {report.appointments.length === 0 ? (
        <p className="empty">Este mes no tiene citas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Mascota</th>
              <th>Servicio</th>
              <th>Estado</th>
              <th className="num">Cobro</th>
            </tr>
          </thead>
          <tbody>
            {report.appointments.map((item) => (
              <tr key={item.id}>
                <td>
                  {longDate(item.date)}
                  <small>{item.time} · #{item.folio}</small>
                </td>
                <td>
                  {formatName(item.petName)}
                  <small>
                    {formatName(item.clientName)} · {item.phone || 'sin teléfono'}
                  </small>
                </td>
                <td>
                  {item.service.trim() || 'Sin servicio'}
                  <small>
                    {item.size.trim() || 'Sin tamaño'} · {planLabel(item)}
                  </small>
                </td>
                <td>{statusLabel(item.status)}</td>
                <td className="num">{money(item.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Caja</h3>
      {report.movements.length === 0 ? (
        <p className="empty">Este mes no tiene movimientos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Concepto</th>
              <th className="num">Monto</th>
            </tr>
          </thead>
          <tbody>
            {report.movements.map((item) => (
              <tr key={item.id}>
                <td>{longDate(item.date)}</td>
                <td>
                  {item.document}
                  <small>{item.type === 'ingreso' ? 'Ingreso' : 'Egreso'} · {item.method.trim() || 'sin medio'}</small>
                </td>
                <td>{item.concept}</td>
                <td className="num">{item.type === 'egreso' ? `−${money(item.amount)}` : money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="report-columns">
        <section>
          <h3>Servicios</h3>
          {report.services.length === 0 ? (
            <p className="empty">Sin servicios en el mes.</p>
          ) : (
            <table>
              <tbody>
                {report.services.map(([name, slot]) => (
                  <tr key={name}>
                    <th>{name}</th>
                    <td>{slot.count}</td>
                    <td className="num">{money(slot.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section>
          <h3>Medios de pago</h3>
          {report.methods.length === 0 ? (
            <p className="empty">Sin ingresos en el mes.</p>
          ) : (
            <table>
              <tbody>
                {report.methods.map(([name, amount]) => (
                  <tr key={name}>
                    <th>{name}</th>
                    <td className="num">{money(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {busyHours.length > 0 && (
            <p className="report-hours">
              Horas con citas: {busyHours.map((hour) => `${hour.label} (${hour.count})`).join(' · ')}
            </p>
          )}
          {peak && peak.sales > 0 && <p className="report-hours">Día más alto: {longDate(peak.date)} · {money(peak.sales)}</p>}
        </section>
      </div>

      <h3>Tutores con más cobro</h3>
      {report.tutors.length === 0 ? (
        <p className="empty">Cuando se complete una cita, el tutor aparece aquí.</p>
      ) : (
        <table>
          <tbody>
            {report.tutors.map(([name, slot], index) => (
              <tr key={name}>
                <td>{index + 1}</td>
                <th>{name}</th>
                <td>{slot.visits === 1 ? '1 visita' : `${slot.visits} visitas`}</td>
                <td className="num">{money(slot.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="report-foot">
        Los montos salen de las citas y de los movimientos registrados en el panel. Cifras en quetzales.
      </footer>
    </article>
  )
}
