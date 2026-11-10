import { useEffect, useState } from 'react'
import { allows } from '../access'
import { Field, Flash, Metrics, Tag } from '../components/ui'
import { clockTime, count, hoursLabel, isoDate, longDate, money, monthTitle, newId, shiftMonth, timeInput, todayLabel, weekday } from '../format'
import { attendanceOf, openShift, shiftHours } from '../ops'
import { behindGoal, goalProgress, workersOf, type GoalProgress } from '../payroll'
import { useStore } from '../store'
import type { Attendance, User } from '../types'

const fullName = (user: Pick<User, 'name' | 'lastName'>) => [user.name, user.lastName].filter(Boolean).join(' ')

/** Une la fecha del registro con una hora local HH:MM. */
const stampOf = (date: string, time: string) => (time ? new Date(`${date}T${time}`).toISOString() : undefined)

export function Asistencia() {
  const { currentUser } = useStore()
  const team = currentUser ? allows(currentUser, 'planilla') : false
  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1>Asistencia</h1>
          <p className="lede">Marca tu entrada al llegar y tu salida al irte. La hora la pone el sistema y se usa en la planilla.</p>
        </div>
      </header>
      <div className="biz-split">
        <ClockCard />
        <MyGoals />
      </div>
      <MyMonth />
      {team ? <Team /> : null}
    </section>
  )
}

function ClockCard() {
  const { state, currentUser, clockIn, clockOut } = useStore()
  const [now, setNow] = useState(() => new Date())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  if (!currentUser) return null
  const today = isoDate(now)
  const open = openShift(state.attendance, currentUser.id, today)
  const worked = (state.attendance ?? []).filter((item) => item.userId === currentUser.id && item.date === today).reduce((sum, item) => sum + shiftHours(item), 0)

  return (
    <article className="ledger clock-card">
      <p className="eyebrow">{todayLabel()}</p>
      <strong className="clock-now num">{clockTime(now.toISOString())}</strong>
      <p className="hint">
        {open ? `Entraste a las ${clockTime(open.inAt)}` : worked > 0 ? `Hoy llevas ${hoursLabel(worked)} trabajadas.` : 'Todavía no marcas tu entrada de hoy.'}
      </p>
      <button
        type="button"
        className={`btn ${open ? 'btn-ghost' : 'btn-primary'} clock-btn`}
        onClick={() => {
          const result = open ? clockOut() : clockIn()
          if (!result.ok) {
            setError(result.error)
            setNotice('')
            return
          }
          setError('')
          setNotice(open ? `Salida marcada a las ${clockTime(result.value.outAt ?? '')}` : `Entrada marcada a las ${clockTime(result.value.inAt)}`)
        }}
      >
        {open ? 'Marcar salida' : 'Marcar entrada'}
      </button>
      <Flash error={error} notice={notice} />
    </article>
  )
}

function GoalMeters({ progress }: { progress: GoalProgress }) {
  const rows = [
    progress.salesGoal > 0 ? { label: 'Ventas', done: progress.sales, goal: progress.salesGoal, show: money } : null,
    progress.servicesGoal > 0 ? { label: 'Servicios', done: progress.services, goal: progress.servicesGoal, show: (value: number) => String(value) } : null,
  ].filter((row) => row !== null)
  if (rows.length === 0) return <p className="empty">Sin metas asignadas este mes.</p>
  return (
    <div className="meter">
      {rows.map((row) => (
        <div key={row.label} className="meter-row">
          <div>
            <strong>{row.label}</strong>
            <div className="meter-track" aria-hidden="true">
              <div className="meter-fill" style={{ width: `${Math.min(100, Math.max(4, (row.done / row.goal) * 100))}%` }} />
            </div>
          </div>
          <b className="num">
            {row.show(row.done)} de {row.show(row.goal)}
          </b>
        </div>
      ))}
    </div>
  )
}

function MyGoals() {
  const { state, currentUser } = useStore()
  if (!currentUser) return null
  const period = isoDate().slice(0, 7)
  const progress = goalProgress(currentUser, state, period)
  const behind = behindGoal(progress, period)
  return (
    <article className="panel">
      <h2>Mis metas de {monthTitle(`${period}-01`).toLowerCase()}</h2>
      <GoalMeters progress={progress} />
      {behind.length ? <p className="hint">Vas por debajo del ritmo del mes en {behind.join(' y ')}.</p> : null}
    </article>
  )
}

function MyMonth() {
  const { state, currentUser } = useStore()
  const [period, setPeriod] = useState(() => isoDate().slice(0, 7))
  if (!currentUser) return null
  const mine = attendanceOf(state.attendance, currentUser.id, period)
  return (
    <div className="biz-stack">
      <MonthSwitch period={period} onChange={setPeriod} />
      <Metrics
        items={[
          { label: 'Días con asistencia', value: String(mine.days), tone: 'ok' },
          { label: 'Horas trabajadas', value: hoursLabel(mine.hours) },
          { label: 'Sin salida marcada', value: String(mine.open), detail: mine.open ? 'Pide que te la corrijan' : undefined },
        ]}
      />
      <div className="ledger">
        {mine.records.length === 0 ? (
          <p className="empty" style={{ margin: 14 }}>Sin registros este mes.</p>
        ) : (
          <div className="table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th className="num">Horas</th>
                </tr>
              </thead>
              <tbody>
                {mine.records.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{weekday(item.date)}</strong> {longDate(item.date)}
                    </td>
                    <td>{clockTime(item.inAt)}</td>
                    <td>{item.outAt ? clockTime(item.outAt) : item.date === isoDate() ? <Tag tone="ok">En curso</Tag> : <Tag tone="warn">Sin salida</Tag>}</td>
                    <td className="num">{item.outAt ? hoursLabel(shiftHours(item)) : '—'}</td>
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

function MonthSwitch({ period, onChange }: { period: string; onChange: (period: string) => void }) {
  return (
    <div className="month-switch">
      <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => onChange(shiftMonth(`${period}-01`, -1).slice(0, 7))}>
        ‹
      </button>
      <strong>{monthTitle(`${period}-01`)}</strong>
      <button type="button" className="cal-arrow" aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(`${period}-01`, 1).slice(0, 7))}>
        ›
      </button>
    </div>
  )
}

function Team() {
  const { state } = useStore()
  const [period, setPeriod] = useState(() => isoDate().slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const workers = workersOf(state.users)
  const today = isoDate()
  return (
    <div className="biz-stack">
      <h2 className="section-title">Equipo</h2>
      <MonthSwitch period={period} onChange={setPeriod} />
      <div className="ledger">
        <div className="table-wrap">
          <table className="biz-table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Hoy</th>
                <th className="num">Días</th>
                <th className="num">Horas</th>
                <th>Metas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workers.map((user) => {
                const month = attendanceOf(state.attendance, user.id, period)
                const todays = (state.attendance ?? []).filter((item) => item.userId === user.id && item.date === today)
                const open = todays.find((item) => !item.outAt)
                const progress = goalProgress(user, state, period)
                const behind = behindGoal(progress, period)
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{fullName(user)}</strong>
                      <small>{user.employeeCode}</small>
                    </td>
                    <td>
                      {open ? (
                        <Tag tone="ok">Desde {clockTime(open.inAt)}</Tag>
                      ) : todays.length ? (
                        <Tag tone="mute">Salió {clockTime(todays[0].outAt ?? todays[0].inAt)}</Tag>
                      ) : (
                        <Tag tone="warn">Sin marcar</Tag>
                      )}
                    </td>
                    <td className="num">{month.days}</td>
                    <td className="num">{hoursLabel(month.hours)}</td>
                    <td>
                      {progress.salesGoal || progress.servicesGoal ? (
                        <span className="tag-row">
                          {progress.salesGoal ? (
                            <Tag tone={behind.includes('ventas') ? 'bad' : 'ok'}>
                              {money(progress.sales)} de {money(progress.salesGoal)}
                            </Tag>
                          ) : null}
                          {progress.servicesGoal ? (
                            <Tag tone={behind.includes('servicios') ? 'bad' : 'ok'}>
                              {progress.services} de {count(progress.servicesGoal, 'servicio', 'servicios')}
                            </Tag>
                          ) : null}
                        </span>
                      ) : (
                        <small>Sin metas</small>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={selected === user.id} onClick={() => setSelected(selected === user.id ? null : user.id)}>
                          {selected === user.id ? 'Cerrar' : 'Registros'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {workers.length === 0 ? <p className="empty" style={{ margin: 14 }}>No hay trabajadores activos con código.</p> : null}
        <p className="section-note">Las metas se fijan en Planilla › Salarios, comisiones y metas. En rojo, quien va por debajo del ritmo del mes.</p>
      </div>
      {selected ? <Corrections key={`${selected}-${period}`} user={workers.find((item) => item.id === selected)} period={period} /> : null}
    </div>
  )
}

function Corrections({ user, period }: { user: User | undefined; period: string }) {
  const { state, saveAttendance, removeAttendance } = useStore()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fresh, setFresh] = useState({ date: isoDate(), inAt: '08:00', outAt: '' })
  if (!user) return null
  const records = attendanceOf(state.attendance, user.id, period).records

  function save(record: Attendance, message: string) {
    const result = saveAttendance(record)
    if (!result.ok) {
      setError(result.error)
      setNotice('')
      return false
    }
    setError('')
    setNotice(message)
    return true
  }

  return (
    <div className="ledger biz-form">
      <h2>
        Registros de {fullName(user)} <small className="hint">· {monthTitle(`${period}-01`)}</small>
      </h2>
      {records.length === 0 ? <p className="empty">Sin registros en este mes.</p> : null}
      <div className="table-wrap">
        <table className="biz-table">
          <tbody>
            {records.map((item) => (
              <RecordRow
                key={`${item.id}-${item.inAt}-${item.outAt}`}
                record={item}
                onSave={(next) => save(next, `${longDate(item.date)} corregido.`)}
                onRemove={() => {
                  removeAttendance(item.id)
                  setNotice(`Registro del ${longDate(item.date)} borrado.`)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="hint" style={{ margin: 0 }}>Agregar un día que no marcó</h3>
      <div className="form-trio">
        <Field label="Fecha">
          <input type="date" value={fresh.date} max={isoDate()} onChange={(event) => setFresh({ ...fresh, date: event.target.value })} />
        </Field>
        <Field label="Entrada">
          <input type="time" value={fresh.inAt} onChange={(event) => setFresh({ ...fresh, inAt: event.target.value })} />
        </Field>
        <Field label="Salida">
          <input type="time" value={fresh.outAt} onChange={(event) => setFresh({ ...fresh, outAt: event.target.value })} />
        </Field>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          const record: Attendance = { id: newId(), userId: user.id, date: fresh.date, inAt: stampOf(fresh.date, fresh.inAt) ?? '', outAt: stampOf(fresh.date, fresh.outAt), note: 'Agregado por planilla' }
          if (save(record, `Asistencia del ${longDate(fresh.date)} agregada.`)) setFresh({ ...fresh, outAt: '' })
        }}
      >
        Agregar registro
      </button>
      <Flash error={error} notice={notice} />
    </div>
  )
}

function RecordRow({ record, onSave, onRemove }: { record: Attendance; onSave: (record: Attendance) => boolean; onRemove: () => void }) {
  const [inAt, setInAt] = useState(timeInput(record.inAt))
  const [outAt, setOutAt] = useState(timeInput(record.outAt))
  const [arm, setArm] = useState(false)
  const changed = inAt !== timeInput(record.inAt) || outAt !== timeInput(record.outAt)
  return (
    <tr>
      <td>
        <strong>{weekday(record.date)}</strong> {longDate(record.date)}
        {record.note ? <small>{record.note}</small> : null}
      </td>
      <td>
        <input type="time" value={inAt} onChange={(event) => setInAt(event.target.value)} aria-label="Entrada" />
      </td>
      <td>
        <input type="time" value={outAt} onChange={(event) => setOutAt(event.target.value)} aria-label="Salida" />
      </td>
      <td>
        <div className="row-actions">
          {changed ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onSave({ ...record, inAt: stampOf(record.date, inAt) ?? '', outAt: stampOf(record.date, outAt), note: record.note ?? 'Corregido por planilla' })}
            >
              Guardar
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn-sm ${arm ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              if (!arm) {
                setArm(true)
                return
              }
              onRemove()
            }}
          >
            {arm ? 'Confirmar' : 'Borrar'}
          </button>
        </div>
      </td>
    </tr>
  )
}
