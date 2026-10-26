import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Field } from '../components/ui'
import { digits, formatName, whatsappUrl } from '../format'
import { useStore } from '../store'

function clock(iso: string) {
  return new Date(iso).toLocaleString('es-GT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WhatsApp() {
  const { state, updateSettings, ensureThread, sendMessage, markRead } = useStore()
  const [params, setParams] = useSearchParams()
  const [line, setLine] = useState(state.settings.whatsapp)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savedLine, setSavedLine] = useState(false)

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

  const connected = digits(state.settings.whatsapp).length >= 8

  return (
    <section className="stack wa-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Canal</p>
          <h1>WhatsApp</h1>
        </div>
        <span className={connected ? 'pill pill-completada' : 'pill pill-pendiente'}>
          {connected ? 'Línea lista' : 'Sin línea'}
        </span>
      </header>

      <form
        className="wa-connect"
        onSubmit={(event) => {
          event.preventDefault()
          const next = line.trim()
          updateSettings({ whatsapp: next })
          setSavedLine(digits(next).length >= 8)
        }}
      >
        <Field label="Número de PUP'S">
          <input
            value={line}
            onChange={(event) => {
              setSavedLine(false)
              setLine(event.target.value)
            }}
            placeholder="+502"
            inputMode="tel"
          />
        </Field>
        <button type="submit" className="btn btn-primary">
          Conectar línea
        </button>
        <p className="hint">
          {savedLine
            ? 'La línea quedó guardada. Los hilos de los clientes se leen y se responden en esta bandeja.'
            : 'Con este número la bandeja identifica la línea del negocio. Cada cliente abre su propio hilo.'}
        </p>
      </form>

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
              <a className="btn btn-wa btn-sm" href={whatsappUrl(active.phone, draft || 'Hola, te escribimos de PUP\'S.')} target="_blank" rel="noreferrer">
                Abrir chat
              </a>
            </header>
            <div className="wa-log">
              {active.messages.length === 0 ? <p className="empty">Este hilo todavía no tiene mensajes.</p> : null}
              {active.messages.map((message) => (
                <article key={message.id} className={message.direction === 'out' ? 'bubble out' : 'bubble in'}>
                  <p>{message.body}</p>
                  <time className="num">
                    {clock(message.at)} · {message.direction === 'out' ? 'Enviado' : 'Recibido'}
                  </time>
                </article>
              ))}
            </div>
            <form
              className="wa-compose"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage(active.id, draft)
                setDraft('')
              }}
            >
              <textarea
                value={draft}
                rows={2}
                placeholder="Escribe la respuesta"
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                Enviar
              </button>
            </form>
          </section>
        ) : (
          <p className="empty">Elige una conversación.</p>
        )}
      </div>
    </section>
  )
}
