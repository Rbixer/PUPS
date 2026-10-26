import { useState } from 'react'
import { Field } from '../components/ui'
import { useStore } from '../store'

export function Contacto() {
  const { state, addLead } = useStore()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', message: '' })
  const whatsapp = state.settings.whatsapp.trim()

  return (
    <section className="section page split">
      <div>
        <p className="eyebrow">Contacto</p>
        <h2>Escríbenos y queda en el panel.</h2>
        <p className="lede">
          {state.settings.address.trim() || 'Guatemala'}. {state.settings.hours.trim() || 'Horario por confirmar.'}
        </p>
        {whatsapp ? <p className="num contact-phone">{whatsapp}</p> : null}
        {sent ? (
          <p className="banner" role="status">
            Mensaje guardado en el panel de este navegador.
          </p>
        ) : null}
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.name.trim() || !form.message.trim()) {
            setError('Nombre y mensaje son obligatorios.')
            return
          }
          addLead(form)
          setError('')
          setSent(true)
          setForm({ name: '', phone: '', message: '' })
        }}
      >
        <Field label="Nombre">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Teléfono">
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} inputMode="tel" />
        </Field>
        <Field label="Mensaje">
          <textarea
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            rows={5}
            required
          />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn btn-primary">
          Enviar mensaje
        </button>
      </form>
    </section>
  )
}
