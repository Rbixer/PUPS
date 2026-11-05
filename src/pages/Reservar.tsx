import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { COATS, SERVICE_NAMES, SEXES, SIZES } from '../catalog'
import { Field } from '../components/ui'
import { addDays, isoDate, longDate, whatsappUrl } from '../format'
import { useStore } from '../store'
import { BOOKING_SLOTS as SLOTS, slotPassed, slotTaken } from '../visit'

export function Reservar() {
  const [params] = useSearchParams()
  const requested = params.get('servicio') ?? ''
  const initialService = SERVICE_NAMES.includes(requested) ? requested : 'Baño y corte'
  const { state, bookAppointment } = useStore()
  const [folio, setFolio] = useState<number | null>(null)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const banner = useRef<HTMLParagraphElement>(null)
  const today = isoDate()
  const [form, setForm] = useState({
    clientName: params.get('tutor') ?? '',
    phone: params.get('tel') ?? '',
    petName: params.get('mascota') ?? '',
    sex: 'Hembra',
    breed: '',
    size: 'Pequeño',
    coat: '',
    service: initialService,
    date: slotPassed(isoDate(), SLOTS[SLOTS.length - 1]) ? addDays(isoDate(), 1) : isoDate(),
    time: '09:00',
    allergies: '',
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFolio(null)
    setConfirm('')
  }

  const free = useMemo(
    () => SLOTS.filter((time) => !slotPassed(form.date, time) && !slotTaken(state.appointments, form.date, time, form.service)),
    [state.appointments, form.date, form.service],
  )

  useEffect(() => {
    if (folio !== null) return
    if (free.length > 0 && !free.includes(form.time)) setForm((current) => ({ ...current, time: free[0] }))
  }, [free, form.time, folio])

  useEffect(() => {
    if (folio !== null) banner.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [folio])

  const chosenTaken = !free.includes(form.time)

  return (
    <section className="section page book">
      <header className="book-head">
        <div>
          <p className="eyebrow">Reservar</p>
          <h1 className="page-title">Agenda la visita.</h1>
          <p className="lede">
            Tus datos, los de tu mascota y un horario libre. Te confirmamos la cita con su número de folio.
          </p>
        </div>
        {folio ? (
          <p className="banner" role="status" ref={banner}>
            Tu cita #{folio} quedó agendada. Guarda el número de folio.{' '}
            {confirm ? (
              <a href={confirm} target="_blank" rel="noreferrer">
                Escribirnos por WhatsApp
              </a>
            ) : null}
          </p>
        ) : null}
      </header>
      <form
        className="book-layout"
        onSubmit={async (event) => {
          event.preventDefault()
          if (sending) return
          if (!form.clientName.trim() || !form.phone.trim() || !form.petName.trim() || !form.date || !form.time) {
            setError('Tu nombre, teléfono, el nombre de la mascota, la fecha y la hora son obligatorios.')
            return
          }
          if (slotPassed(form.date, form.time)) {
            setError('Ese horario ya pasó. Elige otro.')
            return
          }
          if (slotTaken(state.appointments, form.date, form.time, form.service)) {
            setError('Esa hora ya está ocupada. Elige otro horario libre.')
            return
          }
          setSending(true)
          const created = await bookAppointment({
            ...form,
            clientName: form.clientName.trim(),
            phone: form.phone.trim(),
            petName: form.petName.trim(),
            breed: form.breed.trim(),
            allergies: form.allergies.trim(),
          })
          setSending(false)
          if (!created.ok) {
            setError(created.error)
            return
          }
          setError('')
          setFolio(created.folio)
          const shop = state.settings.whatsapp.trim()
          setConfirm(
            shop
              ? whatsappUrl(
                  shop,
                  `Hola, soy ${form.clientName.trim()}. Agendé a ${form.petName.trim()} para ${longDate(form.date)} a las ${form.time}. Folio #${created.folio}.`,
                )
              : '',
          )
          setForm((current) => ({ ...current, clientName: '', phone: '', petName: '', breed: '', allergies: '' }))
        }}
      >
        <div className="book-main">
          <section className="book-card">
            <header>
              <span>01</span>
              <h3>Tutor</h3>
            </header>
            <div className="book-grid">
              <Field label="Cliente">
                <input value={form.clientName} onChange={(event) => set('clientName', event.target.value)} required />
              </Field>
              <Field label="Teléfono">
                <input value={form.phone} onChange={(event) => set('phone', event.target.value)} inputMode="tel" required />
              </Field>
            </div>
          </section>

          <section className="book-card">
            <header>
              <span>02</span>
              <h3>Mascota</h3>
            </header>
            <div className="book-grid">
              <Field label="Nombre">
                <input value={form.petName} onChange={(event) => set('petName', event.target.value)} required />
              </Field>
              <Field label="Sexo">
                <select value={form.sex} onChange={(event) => set('sex', event.target.value)}>
                  {SEXES.map((sex) => (
                    <option key={sex}>{sex}</option>
                  ))}
                </select>
              </Field>
              <Field label="Raza">
                <input value={form.breed} onChange={(event) => set('breed', event.target.value)} />
              </Field>
              <Field label="Tamaño">
                <select value={form.size} onChange={(event) => set('size', event.target.value)}>
                  {SIZES.map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pelaje">
                <select value={form.coat} onChange={(event) => set('coat', event.target.value)}>
                  <option value="">Sin anotar</option>
                  {COATS.map((coat) => (
                    <option key={coat}>{coat}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="book-card">
            <header>
              <span>03</span>
              <h3>Visita</h3>
            </header>
            <div className="book-grid">
              <Field label="Servicio">
                <select value={form.service} onChange={(event) => set('service', event.target.value)}>
                  {SERVICE_NAMES.map((service) => (
                    <option key={service}>{service}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha">
                <input type="date" value={form.date} min={today} onChange={(event) => set('date', event.target.value < today ? today : event.target.value)} required />
              </Field>
            </div>
            <fieldset className="slot-field">
              <legend>Horarios de {longDate(form.date)}</legend>
              <div className="slot-picks">
                {SLOTS.map((time) => {
                  const taken = !free.includes(time)
                  if (slotPassed(form.date, time)) return null
                  return (
                    <button
                      key={time}
                      type="button"
                      className={['slot-pick', form.time === time ? 'on' : '', taken ? 'taken' : ''].filter(Boolean).join(' ')}
                      disabled={taken}
                      onClick={() => set('time', time)}
                    >
                      {time}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <Field label="Enfermedades / alergias">
              <textarea value={form.allergies} onChange={(event) => set('allergies', event.target.value)} rows={3} />
            </Field>
          </section>
        </div>

        <aside className="book-summary">
          <p>Resumen</p>
          <dl>
            <div>
              <dt>Mascota</dt>
              <dd>{form.petName.trim() || 'Por definir'}</dd>
            </div>
            <div>
              <dt>Servicio</dt>
              <dd>{form.service}</dd>
            </div>
            <div>
              <dt>Cuándo</dt>
              <dd>
                {longDate(form.date)} · {form.time}
              </dd>
            </div>
            <div>
              <dt>Tutor</dt>
              <dd>{form.clientName.trim() || 'Por definir'}</dd>
            </div>
          </dl>
          {chosenTaken ? <p className="form-error">Esa hora ya está ocupada.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {free.length === 0 ? <p className="form-error">Ya no quedan horarios libres ese día. Elige otra fecha.</p> : null}
          <button type="submit" className="btn btn-primary" disabled={chosenTaken || sending || free.length === 0}>
            {sending ? 'Agendando…' : 'Confirmar cita'}
          </button>
          <p className="hint">El costo final depende del tamaño y del estado del pelaje; te lo confirmamos al recibir a tu mascota.</p>
        </aside>
      </form>
    </section>
  )
}
