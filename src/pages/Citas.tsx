import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { COATS, METHODS, SERVICE_NAMES, SEXES, SIZES } from '../catalog'
import { Constancia } from '../components/Constancia'
import { DayBoard } from '../components/DayBoard'
import { Field, StatusPill } from '../components/ui'
import { digits, formatName, isoDate, longDate, money, monthCells, monthStart, monthTitle, shiftMonth, show } from '../format'
import { useStore, type ChargeNote } from '../store'
import type { Appointment, AppointmentStatus } from '../types'
import { overlaps, petKey, visitMinutes } from '../visit'

type Draft = {
  petName: string
  date: string
  time: string
  status: AppointmentStatus
  clientName: string
  phone: string
  sex: string
  breed: string
  service: string
  size: string
  coat: string
  allergies: string
  cost: string
}

function blankDraft(): Draft {
  return {
    petName: '',
    date: isoDate(),
    time: '09:00',
    status: 'pendiente',
    clientName: '',
    phone: '',
    sex: 'Macho',
    breed: '',
    service: 'Baño y corte',
    size: 'Pequeño',
    coat: '',
    allergies: '',
    cost: '',
  }
}

function fromAppointment(item: Appointment): Draft {
  return {
    petName: item.petName,
    date: item.date,
    time: item.time,
    status: item.status,
    clientName: item.clientName,
    phone: item.phone,
    sex: item.sex,
    breed: item.breed,
    service: item.service,
    size: item.size,
    coat: item.coat,
    allergies: item.allergies,
    cost: String(item.cost),
  }
}

export function Citas() {
  const { state, allows, addAppointment, updateAppointment } = useStore()
  const today = isoDate()
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState(() => monthStart(today))
  const [selected, setSelected] = useState(today)
  const [chipLimit, setChipLimit] = useState(3)
  const [sheet, setSheet] = useState<Appointment | null>(null)
  const [sheetIntent, setSheetIntent] = useState<'form' | 'print'>('form')
  const [completeTarget, setCompleteTarget] = useState<Appointment | null>(null)
  const [payMethod, setPayMethod] = useState<(typeof METHODS)[number]>('Efectivo')
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft())
  const [formError, setFormError] = useState('')
  const [costTarget, setCostTarget] = useState<Appointment | null>(null)
  const [costValue, setCostValue] = useState('')
  const [costError, setCostError] = useState('')
  const [cashNote, setCashNote] = useState<ChargeNote | null>(null)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const id = params.get('constancia')
    if (!id) return
    const found = state.appointments.find((item) => item.id === id)
    if (found) setSheet(found)
    setParams({}, { replace: true })
  }, [params, setParams, state.appointments])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const apply = () => setChipLimit(media.matches ? 2 : 3)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setSheet(null)
      setEditing(null)
      setCostTarget(null)
      setCompleteTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const needle = query.trim().toLowerCase()
  const matches = (item: Appointment) => {
    if (!needle) return true
    return [item.clientName, item.petName, item.phone, item.breed, item.service, String(item.folio)]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  }

  const cells = useMemo(() => monthCells(month), [month])
  const monthKey = month.slice(0, 7)
  const byDay = useMemo(() => {
    const grouped = new Map<string, Appointment[]>()
    for (const item of state.appointments) {
      if (!matches(item)) continue
      grouped.set(item.date, [...(grouped.get(item.date) ?? []), item].sort((a, b) => a.time.localeCompare(b.time)))
    }
    return grouped
  }, [state.appointments, needle])
  const selectedItems = byDay.get(selected) ?? []
  const dayItems = state.appointments.filter((item) => item.date === selected)
  const pending = dayItems.filter((item) => item.status === 'pendiente').length
  const done = dayItems.filter((item) => item.status === 'completada').length
  const cancelled = dayItems.filter((item) => item.status === 'cancelada').length
  const sales = dayItems.filter((item) => item.status === 'completada').reduce((sum, item) => sum + item.cost, 0)
  const dayLabel = selected === today ? 'hoy' : longDate(selected)

  useEffect(() => {
    if (!needle) return
    const latest = state.appointments
      .filter((item) =>
        [item.clientName, item.petName, item.phone, item.breed, item.service, String(item.folio)]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))[0]
    if (!latest) return
    setSelected(latest.date)
    setMonth(monthStart(latest.date))
  }, [needle, state.appointments])

  function openEdit(item: Appointment) {
    setEditing(item)
    setDraft(fromAppointment(item))
    setFormError('')
  }

  function openNew(date = selected, time = '09:00') {
    setEditing('new')
    setDraft({ ...blankDraft(), date, time })
    setSelected(date)
    setMonth(monthStart(date))
    setFormError('')
  }

  function moveAppointment(id: string, patch: { date?: string; time?: string }) {
    const note = updateAppointment(id, patch)
    setCashNote(note)
  }

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function Actions({ item }: { item: Appointment }) {
    return (
      <div className="record-actions">
        {item.status === 'pendiente' ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCompleteTarget(item)
              setPayMethod('Efectivo')
            }}
          >
            Completar
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setSheetIntent('form')
            setSheet(item)
          }}
        >
          Constancia
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setSheetIntent('print')
            setSheet(item)
          }}
        >
          Imprimir
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
          Editar
        </button>
        {allows('costos') ? (
          <button
            type="button"
            className="btn btn-amber btn-sm"
            onClick={() => {
              setCostTarget(item)
              setCostValue(String(item.cost))
              setCostError('')
            }}
          >
            Editar costo
          </button>
        ) : null}
        <Link className="btn btn-ghost btn-sm" to={`/admin/fichas/${encodeURIComponent(petKey(item))}`}>
          Ficha
        </Link>
        <Link className="btn btn-wa btn-sm" to={`/admin/whatsapp?tel=${digits(item.phone)}`}>
          WhatsApp
        </Link>
      </div>
    )
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Operación</p>
          <h1>Citas</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openNew()}>
          Nueva cita
        </button>
      </header>

      {cashNote ? (
        <p className="banner">
          {cashNote.removed
            ? `Se retiró ${cashNote.document} de caja.`
            : `${cashNote.created ? 'Caja' : 'Caja actualizada'}: ${cashNote.document} · ${money(cashNote.amount)}`}
        </p>
      ) : null}

      <div className="kpis">
        <article className="kpi">
          <span>Pendientes ({dayLabel})</span>
          <strong className="num hot">{pending}</strong>
        </article>
        <article className="kpi">
          <span>Completadas ({dayLabel})</span>
          <strong className="num ok">{done}</strong>
        </article>
        <article className="kpi">
          <span>Canceladas ({dayLabel})</span>
          <strong className="num">{cancelled}</strong>
        </article>
        <article className="kpi">
          <span>Ventas ({dayLabel})</span>
          <strong className="num cyan">{money(sales)}</strong>
        </article>
      </div>

      <form
        className="filters filters-search"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <Field label="Buscar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Teléfono, cliente, mascota..."
          />
        </Field>
      </form>

      <div className="agenda">
      <section className="cal" aria-label="Calendario de citas">
        <header className="cal-head">
          <h2>{monthTitle(month)}</h2>
          <div className="cal-tools">
            <button type="button" className="cal-arrow" aria-label="Mes anterior" onClick={() => setMonth((current) => shiftMonth(current, -1))}>
              ‹
            </button>
            <button type="button" className="cal-arrow" aria-label="Mes siguiente" onClick={() => setMonth((current) => shiftMonth(current, 1))}>
              ›
            </button>
            <button type="button" className="cal-add" aria-label="Nueva cita" onClick={() => openNew(selected)}>
              +
            </button>
          </div>
        </header>
        <div className="cal-grid">
          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((label, index) => (
            <span key={`${label}-${index}`} className="cal-dow">
              {label}
            </span>
          ))}
          {cells.map((iso) => {
            const items = byDay.get(iso) ?? []
            const visible = items.slice(0, chipLimit)
            const extra = items.length - visible.length
            const inMonth = iso.startsWith(monthKey)
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={iso === selected}
                aria-label={`${longDate(iso)}, ${items.length === 1 ? '1 cita' : `${items.length} citas`}`}
                className={['cal-day', inMonth ? '' : 'out', iso === selected ? 'selected' : '', iso === today ? 'today' : ''].filter(Boolean).join(' ')}
                onClick={() => setSelected(iso)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const id = event.dataTransfer.getData('text/pups-id')
                  const time = event.dataTransfer.getData('text/pups-time')
                  if (!id || !time) return
                  moveAppointment(id, { date: iso, time })
                  setSelected(iso)
                  setMonth(monthStart(iso))
                }}
              >
                <span className="cal-num">{Number(iso.slice(8))}</span>
                {visible.map((item) => (
                  <span
                    key={item.id}
                    className={`cal-chip ${item.status}`}
                    draggable
                    onDragStart={(event) => {
                      event.stopPropagation()
                      event.dataTransfer.setData('text/pups-id', item.id)
                      event.dataTransfer.setData('text/pups-time', item.time)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    {formatName(item.petName)}
                  </span>
                ))}
                {extra > 0 ? <span className="cal-more">+{extra}</span> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="day-column">
        <h2>
          {selected === today ? 'Hoy' : longDate(selected)} · {selectedItems.length}{' '}
          {selectedItems.length === 1 ? 'cita' : 'citas'}
        </h2>
        <p className="hint">Arrastra una cita dentro del día o suéltala en otro día del mes. La hora del tablero es de operación, de 8:00 a 19:00.</p>
        <DayBoard
          items={selectedItems}
          onMove={(id, time) => moveAppointment(id, { time })}
          onCreate={(time) => openNew(selected, time)}
        />
      </section>
      </div>

      <section>
        <h2>Detalle</h2>
        {selectedItems.length === 0 ? (
          <p className="empty">Este día no tiene citas. El + del calendario abre una aquí.</p>
        ) : (
          <div className="schedule">
            {selectedItems.map((item) => (
              <article key={item.id} className="slot">
                <time className="num">{item.time}</time>
                <div>
                  <strong>
                    #{item.folio} · {formatName(item.petName)}
                  </strong>
                  <span>
                    {formatName(item.clientName)} · {show(item.service)} · {visitMinutes(item)} min
                  </span>
                  {state.appointments.some((other) => overlaps(item, other)) ? (
                    <em className="clash">
                      Se cruza con{' '}
                      {state.appointments
                        .filter((other) => overlaps(item, other))
                        .map((other) => `${formatName(other.petName)} ${other.time}`)
                        .join(', ')}
                    </em>
                  ) : null}
                </div>
                <StatusPill status={item.status} />
                <b className="num">{money(item.cost)}</b>
                <Actions item={item} />
              </article>
            ))}
          </div>
        )}
      </section>

      {state.leads.length > 0 ? (
        <section>
          <h2>Mensajes del sitio</h2>
          <div className="records">
            {state.leads.map((lead) => (
              <article key={lead.id} className="record">
                <header>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{lead.phone || 'Sin teléfono'}</span>
                  </div>
                </header>
                <p>{lead.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sheet ? (
        <Constancia
          appointment={sheet}
          history={state.appointments}
          intent={sheetIntent}
          onClose={() => setSheet(null)}
          onSave={(patch) => {
            updateAppointment(sheet.id, patch)
            setSheet((current) => (current ? { ...current, ...patch } : current))
          }}
        />
      ) : null}

      {editing ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <form
            className="drawer"
            onSubmit={(event) => {
              event.preventDefault()
              if (!draft.clientName.trim() || !draft.phone.trim() || !draft.petName.trim() || !draft.date || !draft.time) {
                setFormError('Cliente, teléfono, mascota, fecha y hora son obligatorios.')
                return
              }
              const cost = Number(draft.cost || 0)
              if (!Number.isFinite(cost) || cost < 0) {
                setFormError('El costo debe ser un número válido.')
                return
              }
              const payload = {
                petName: draft.petName.trim(),
                date: draft.date,
                time: draft.time,
                status: draft.status,
                clientName: draft.clientName.trim(),
                phone: draft.phone.trim(),
                sex: draft.sex,
                breed: draft.breed.trim(),
                service: draft.service,
                size: draft.size,
                coat: draft.coat,
                allergies: draft.allergies.trim(),
                cost: allows('costos') || editing === 'new' ? cost : editing.cost,
              }
              if (editing === 'new') {
                addAppointment(payload)
                setCashNote(null)
              } else setCashNote(updateAppointment(editing.id, payload))
              setEditing(null)
            }}
          >
            <header className="page-head">
              <h2 id="edit-title">{editing === 'new' ? 'Nueva cita' : `Editar #${editing.folio}`}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                Cerrar
              </button>
            </header>
            <div className="drawer-grid">
              <Field label="Mascota">
                <input value={draft.petName} onChange={(event) => patch('petName', event.target.value)} required />
              </Field>
              <Field label="Cliente">
                <input value={draft.clientName} onChange={(event) => patch('clientName', event.target.value)} required />
              </Field>
              <Field label="Teléfono">
                <input value={draft.phone} onChange={(event) => patch('phone', event.target.value)} required />
              </Field>
              <Field label="Fecha">
                <input type="date" value={draft.date} onChange={(event) => patch('date', event.target.value)} required />
              </Field>
              <Field label="Hora">
                <input type="time" value={draft.time} onChange={(event) => patch('time', event.target.value)} required />
              </Field>
              <Field label="Estado">
                <select value={draft.status} onChange={(event) => patch('status', event.target.value as AppointmentStatus)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="completada">Completada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </Field>
              <Field label="Sexo">
                <select value={draft.sex} onChange={(event) => patch('sex', event.target.value)}>
                  {SEXES.map((sex) => (
                    <option key={sex}>{sex}</option>
                  ))}
                </select>
              </Field>
              <Field label="Raza">
                <input value={draft.breed} onChange={(event) => patch('breed', event.target.value)} />
              </Field>
              <Field label="Tamaño">
                <select value={draft.size} onChange={(event) => patch('size', event.target.value)}>
                  {SIZES.map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </Field>
              <Field label="Servicio">
                <select value={draft.service} onChange={(event) => patch('service', event.target.value)}>
                  <option value="">Por definir</option>
                  {SERVICE_NAMES.map((service) => (
                    <option key={service}>{service}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pelaje">
                <select value={draft.coat} onChange={(event) => patch('coat', event.target.value)}>
                  <option value="">Sin anotar</option>
                  {COATS.map((coat) => (
                    <option key={coat}>{coat}</option>
                  ))}
                </select>
              </Field>
              <Field label="Enf. / alergias">
                <input value={draft.allergies} onChange={(event) => patch('allergies', event.target.value)} />
              </Field>
              {allows('costos') || editing === 'new' ? (
                <Field label="Costo (Q)">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={draft.cost}
                    onChange={(event) => patch('cost', event.target.value)}
                  />
                </Field>
              ) : null}
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </form>
        </div>
      ) : null}

      {completeTarget ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="done-title">
          <form
            className="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              setCashNote(updateAppointment(completeTarget.id, { status: 'completada' }, payMethod))
              setCompleteTarget(null)
            }}
          >
            <h2 id="done-title">Completar #{completeTarget.folio}</h2>
            <p className="hint">
              {formatName(completeTarget.petName)} · {money(completeTarget.cost)}. El cobro entra a caja con este medio.
            </p>
            <Field label="Medio de pago">
              <select value={payMethod} onChange={(event) => setPayMethod(event.target.value as (typeof METHODS)[number])}>
                {METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </Field>
            <div className="overlay-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCompleteTarget(null)}>
                Volver
              </button>
              <button type="submit" className="btn btn-primary">
                Completar y cobrar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {costTarget ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="cost-title">
          <form
            className="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              const value = Number(costValue)
              if (!Number.isFinite(value) || value < 0) {
                setCostError('Escribe un monto válido.')
                return
              }
              setCashNote(updateAppointment(costTarget.id, { cost: value }))
              setCostTarget(null)
            }}
          >
            <h2 id="cost-title">Editar costo · #{costTarget.folio}</h2>
            <Field label="Costo (Q)">
              <input className="num" inputMode="decimal" value={costValue} onChange={(event) => setCostValue(event.target.value)} autoFocus />
            </Field>
            {costError ? <p className="form-error">{costError}</p> : null}
            <div className="overlay-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCostTarget(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-amber">
                Guardar costo
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
