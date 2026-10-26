import { useMemo, useState } from 'react'
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

  return (
    <section className="section page split">
      <div>
        <p className="eyebrow">Reservar</p>
        <h2>La cita nace con folio.</h2>
        <p className="lede">
          Elige un horario libre. Recepción la verá en la misma agenda de este equipo y podrá editar el costo cuando
          termine el servicio.
        </p>
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
      </div>
      <form
        className="form-grid"
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
        <Field label="Cliente">
          <input value={form.clientName} onChange={(event) => set('clientName', event.target.value)} required />
        </Field>
        <Field label="Teléfono">
          <input value={form.phone} onChange={(event) => set('phone', event.target.value)} inputMode="tel" required />
        </Field>
        <Field label="Mascota">
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
        <fieldset className="slot-field">
          <legend>Horarios libres</legend>
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
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn btn-primary">
          Confirmar cita
        </button>
      </form>
    </section>
  )
}
