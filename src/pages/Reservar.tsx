import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { COATS, SERVICE_NAMES, SEXES, SIZES } from '../catalog'
import { Field } from '../components/ui'
import { isoDate, longDate, whatsappUrl } from '../format'
import { useStore } from '../store'
import { slotTaken } from '../visit'

const SLOTS = Array.from({ length: ((18 - 8) * 60) / 30 + 1 }, (_, index) => {
  const total = 8 * 60 + index * 30
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
})

export function Reservar() {
  const [params] = useSearchParams()
  const requested = params.get('servicio') ?? ''
  const initialService = SERVICE_NAMES.includes(requested) ? requested : 'Baño y corte'
  const { state, addAppointment } = useStore()
  const [folio, setFolio] = useState<number | null>(null)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    clientName: '',
    phone: '',
    petName: '',
    sex: 'Hembra',
    breed: '',
    size: 'Pequeño',
    coat: '',
    service: initialService,
    date: isoDate(),
    time: '09:00',
    allergies: '',
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFolio(null)
    setConfirm('')
  }

  const free = useMemo(
    () => SLOTS.filter((time) => !slotTaken(state.appointments, form.date, time, form.service)),
    [state.appointments, form.date, form.service],
  )

  useEffect(() => {
    if (free.length > 0 && !free.includes(form.time)) set('time', free[0])
  }, [free, form.time])

  const chosenTaken = !free.includes(form.time)

  return (
    <section className="section page book">
      <header className="book-head">
        <div>
          <p className="eyebrow">Reservar</p>
          <h2>Agenda la visita.</h2>
          <p className="lede">
            Tutor, mascota y un horario libre. La cita entra al panel como pendiente, con folio.
          </p>
        </div>
        {folio ? (
          <p className="banner" role="status">
            Cita #{folio} quedó en la agenda.{' '}
            {confirm ? (
              <a href={confirm} target="_blank" rel="noreferrer">
                Avisar por WhatsApp
              </a>
            ) : null}
          </p>
        ) : null}
      </header>
      <form
        className="book-layout"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.clientName.trim() || !form.phone.trim() || !form.petName.trim() || !form.date || !form.time) {
            setError('Cliente, teléfono, mascota, fecha y hora son obligatorios.')
            return
          }
          if (slotTaken(state.appointments, form.date, form.time, form.service)) {
            setError('Esa hora ya está ocupada. Elige otro horario libre.')
            return
          }
          const created = addAppointment({
            ...form,
            clientName: form.clientName.trim(),
            phone: form.phone.trim(),
            petName: form.petName.trim(),
            breed: form.breed.trim(),
            allergies: form.allergies.trim(),
            status: 'pendiente',
            cost: 0,
          })
          setError('')
          setFolio(created.folio)
          setConfirm(
            whatsappUrl(
              form.phone,
              `Hola ${form.clientName.trim()}, tu cita en PUP'S quedó para ${longDate(form.date)} a las ${form.time}. Folio #${created.folio}.`,
            ),
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
                <input type="date" value={form.date} onChange={(event) => set('date', event.target.value)} required />
              </Field>
            </div>
            <fieldset className="slot-field">
              <legend>Horarios de {longDate(form.date)}</legend>
              <div className="slot-picks">
                {SLOTS.map((time) => {
                  const taken = !free.includes(time)
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
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={chosenTaken}>
            Confirmar cita
          </button>
          <p className="hint">Recepción la ve en la agenda de este equipo y confirma el costo al terminar.</p>
        </aside>
      </form>
    </section>
  )
}
