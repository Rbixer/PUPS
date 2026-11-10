import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Field, Flash } from '../components/ui'
import { digits, formatName } from '../format'
import { useStore } from '../store'
import type { WaDelivery } from '../types'

function clock(iso: string) {
  return new Date(iso).toLocaleString('es-GT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABEL: Record<WaDelivery, string> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  fallido: 'Falló',
  recibido: 'Recibido',
}

export function WhatsApp() {
  const { state, updateSettings, ensureThread, sendMessage, waCloudStatus, markRead } = useStore()
  const [params, setParams] = useSearchParams()
  const [line, setLine] = useState(state.settings.whatsapp)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savedLine, setSavedLine] = useState(false)
  const [lineTouched, setLineTouched] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cloud, setCloud] = useState<{ configured: boolean; phoneNumberId: string; template: string } | null>(null)

  useEffect(() => {
    if (!lineTouched) setLine(state.settings.whatsapp)
  }, [state.settings.whatsapp, lineTouched])

  useEffect(() => {
    let alive = true
    void waCloudStatus().then((status) => {
      if (alive) setCloud(status)
    })
    return () => {
      alive = false
    }
  }, [waCloudStatus])

  const threads = useMemo(
    () =>
      [...state.conversations].sort((a, b) => {
        const left = a.messages.at(-1)?.at ?? ''
        const right = b.messages.at(-1)?.at ?? ''
        return right.localeCompare(left)
      }),
    [state.conversations],
  )

  useEffect(() => {
    const tel = params.get('tel')
    if (!tel) return
    const match = state.appointments.find((item) => digits(item.phone) === digits(tel))
    const id = ensureThread(tel, match?.clientName || 'Cliente', match?.petName || '')
    setActiveId(id)
    setParams({}, { replace: true })
  }, [params, setParams, state.appointments, ensureThread])

  useEffect(() => {
    if (activeId && threads.some((item) => item.id === activeId)) return
    setActiveId(threads[0]?.id ?? null)
  }, [threads, activeId])

  const active = threads.find((item) => item.id === activeId) ?? null

  useEffect(() => {
    if (active && active.unread > 0) markRead(active.id)
  }, [active, markRead])

  const lineReady = digits(state.settings.whatsapp).length >= 8
  const apiReady = Boolean(cloud?.configured)

  return (
    <section className="stack wa-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Canal</p>
          <h1>WhatsApp</h1>
          <p className="lede">El chat de la cuenta del negocio vive aquí. Los mensajes entran y salen por WhatsApp Cloud API.</p>
        </div>
        <span className={apiReady ? 'pill pill-completada' : 'pill pill-pendiente'}>{apiReady ? 'API conectada' : 'API sin configurar'}</span>
      </header>

      <aside className="wa-setup panel" aria-label="Configuración de WhatsApp">
        <h2>Cómo activar la cuenta</h2>
        <ol className="wa-steps">
          <li>Crea Meta Business Manager y una app tipo Business con el producto WhatsApp.</li>
          <li>Agrega el número del celular: Meta manda un SMS; al activarlo ese número deja la app normal.</li>
          <li>
            En el servidor configura <code>WA_TOKEN</code>, <code>WA_PHONE_NUMBER_ID</code>, <code>WA_VERIFY_TOKEN</code> y <code>WA_APP_SECRET</code>.
          </li>
          <li>
            Webhook: <code>https://tu-dominio/api/whatsapp/webhook</code> con el campo <code>messages</code>.
          </li>
          <li>
            Aprueba la plantilla <code>{cloud?.template ?? 'reserva_nueva'}</code> en español para reservas y mensajes fuera de 24 h.
          </li>
        </ol>
        <p className="hint">
          {apiReady
            ? `Phone number ID ${cloud?.phoneNumberId}. Plantilla ${cloud?.template}.`
            : 'Mientras la API no esté en el servidor, la bandeja no envía ni recibe mensajes reales.'}
        </p>
      </aside>

      <form
        className="wa-connect"
        onSubmit={(event) => {
          event.preventDefault()
          const next = line.trim()
          updateSettings({ whatsapp: next })
          setLineTouched(false)
          setSavedLine(digits(next).length >= 8)
        }}
      >
        <Field label="Número público de PUP'S">
          <input
            value={line}
            onChange={(event) => {
              setSavedLine(false)
              setLineTouched(true)
              setLine(event.target.value)
            }}
            placeholder="+502"
            inputMode="tel"
          />
        </Field>
        <button type="submit" className="btn btn-primary">
          Guardar número
        </button>
        <p className="hint">
          {savedLine || lineReady
            ? 'Este número aparece en el sitio para que los clientes te escriban.'
            : 'Guarda el mismo número que registraste en Meta para mostrarlo en la página pública.'}
        </p>
      </form>

      <Flash error={error} notice={notice} />

      <div className="wa-shell">
        <aside className="wa-list" aria-label="Conversaciones">
          {threads.length === 0 ? <p className="empty">Todavía no hay mensajes.</p> : null}
          {threads.map((item) => {
            const last = item.messages.at(-1)
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === active?.id ? 'wa-row active' : 'wa-row'}
                onClick={() => setActiveId(item.id)}
              >
                <span className="wa-avatar">{formatName(item.name).slice(0, 1)}</span>
                <span>
                  <strong>{formatName(item.name)}</strong>
                  <small>
                    {item.petName ? `${formatName(item.petName)} · ` : ''}
                    {last?.body ?? 'Sin mensajes'}
                  </small>
                </span>
                {item.unread > 0 ? <b>{item.unread}</b> : <em className="num">{item.phone}</em>}
              </button>
            )
          })}
        </aside>

        {active ? (
          <section className="wa-thread" aria-label={`Hilo de ${formatName(active.name)}`}>
            <header>
              <div>
                <strong>{formatName(active.name)}</strong>
                <span>
                  {active.petName ? `${formatName(active.petName)} · ` : ''}
                  {active.phone}
                </span>
              </div>
            </header>
            <div className="wa-log">
              {active.messages.length === 0 ? <p className="empty">Este hilo todavía no tiene mensajes.</p> : null}
              {active.messages.map((message) => (
                <article key={message.id} className={message.direction === 'out' ? 'bubble out' : 'bubble in'}>
                  <p>{message.body}</p>
                  <time className="num">
                    {clock(message.at)} · {STATUS_LABEL[message.status] ?? message.status}
                    {message.error ? ` · ${message.error}` : ''}
                  </time>
                </article>
              ))}
            </div>
            <form
              className="wa-compose"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!draft.trim() || sending) return
                setSending(true)
                setError('')
                setNotice('')
                const problem = await sendMessage(active.id, draft)
                setSending(false)
                if (problem) {
                  setError(problem)
                  return
                }
                setDraft('')
                setNotice('Mensaje enviado.')
              }}
            >
              <textarea
                value={draft}
                rows={2}
                placeholder={apiReady ? 'Escribe la respuesta' : 'Configura la API en el servidor para enviar'}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!apiReady || sending}
              />
              <button type="submit" className="btn btn-primary" disabled={!apiReady || !draft.trim() || sending}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
            <p className="hint" style={{ margin: '0 14px 12px' }}>
              Texto libre solo si el cliente escribió en las últimas 24 h. Fuera de esa ventana Meta exige una plantilla aprobada.
            </p>
          </section>
        ) : (
          <p className="empty">Elige una conversación.</p>
        )}
      </div>
    </section>
  )
}
