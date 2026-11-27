import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmojiPicker } from '../components/EmojiPicker'
import { Field, Flash } from '../components/ui'
import { Linkified, MediaView } from '../components/WaMedia'
import { MEDIA_LABEL, digits, formatName } from '../format'
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

const PHOTO_MAX = 5 * 1024 * 1024

function isPhoto(bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  return jpeg || png
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
  const { state, allows, updateSettings, ensureThread, sendMessage, sendImage, waCloudStatus, waMedia, markRead } = useStore()
  const canSend = allows('whatsapp_enviar')
  const [params, setParams] = useSearchParams()
  const [line, setLine] = useState(state.settings.whatsapp)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<{ url: string; file: File } | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoUrl = useRef<string | null>(null)
  photoUrl.current = photo?.url ?? null
  const log = useRef<HTMLDivElement>(null)
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

  const shown = active?.messages.length ?? 0
  useEffect(() => {
    const box = log.current
    if (box) box.scrollTop = box.scrollHeight
  }, [active?.id, shown])

  useEffect(() => {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }, [activeId])

  useEffect(() => {
    return () => {
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    }
  }, [])

  function clearPhoto() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > PHOTO_MAX) {
      setError('La imagen es muy pesada. El máximo es 5 MB.')
      return
    }
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    if (!isPhoto(head)) {
      setError('Solo se pueden enviar fotos JPG o PNG.')
      return
    }
    const url = URL.createObjectURL(file)
    setError('')
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return { file, url }
    })
  }

  function insertEmoji(emoji: string) {
    const input = field.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + emoji + draft.slice(end))
    const caret = start + emoji.length
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(caret, caret)
    })
  }

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
            Webhook: <code>{`${window.location.origin}/api/whatsapp/webhook`}</code> con el campo <code>messages</code>.
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

      {allows('whatsapp_linea') ? (
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
      ) : null}

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
            <div className="wa-log" ref={log}>
              {active.messages.length === 0 ? <p className="empty">Este hilo todavía no tiene mensajes.</p> : null}
              {active.messages.map((message) => (
                <article key={message.id} className={message.direction === 'out' ? 'bubble out' : 'bubble in'}>
                  {message.media ? <MediaView media={message.media} load={waMedia} /> : null}
                  {message.media && message.body === MEDIA_LABEL[message.media.voice ? 'voice' : message.media.kind] ? null : (
                    <p>
                      <Linkified text={message.body} />
                    </p>
                  )}
                  {message.link ? (
                    <a className="wa-place" href={message.link} target="_blank" rel="noopener noreferrer">
                      Abrir ubicación en el mapa
                    </a>
                  ) : null}
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
                const caption = draft.trim()
                if (sending || (!caption && !photo)) return
                setSending(true)
                setError('')
                setNotice('')
                const problem = photo ? await sendImage(active.id, photo.file, caption) : await sendMessage(active.id, caption)
                setSending(false)
                if (problem) {
                  setError(problem)
                  return
                }
                setDraft('')
                clearPhoto()
                setNotice(photo ? 'Imagen enviada.' : 'Mensaje enviado.')
              }}
            >
              {photo ? (
                <div className="wa-attach-preview">
                  <img src={photo.url} alt="Imagen para enviar" />
                  <button type="button" onClick={clearPhoto} disabled={sending}>
                    Quitar
                  </button>
                </div>
              ) : null}
              <EmojiPicker onPick={insertEmoji} disabled={!canSend || !apiReady || sending} />
              <button
                type="button"
                className="emoji-toggle wa-attach"
                aria-label="Adjuntar imagen"
                disabled={!canSend || !apiReady || sending}
                onClick={() => fileRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                  <circle cx="8.5" cy="10" r="1.4" />
                  <path d="M20.5 16.5 15 12l-4.5 4.5" />
                  <path d="m10.5 13.5-2.5 2.5" />
                </svg>
              </button>
              <input
                ref={fileRef}
                className="wa-file"
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => void pickPhoto(event)}
              />
              <textarea
                ref={field}
                value={draft}
                rows={2}
                placeholder={!canSend ? 'Solo lectura: tu usuario no puede enviar mensajes' : apiReady ? 'Escribe la respuesta o adjunta una foto' : 'Configura la API en el servidor para enviar'}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!canSend || !apiReady || sending}
              />
              <button type="submit" className="btn btn-primary" disabled={!canSend || !apiReady || sending || (!draft.trim() && !photo)}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
            <p className="hint" style={{ margin: '0 14px 12px' }}>
              Texto o una foto JPG o PNG de hasta 5 MB, si el cliente escribió en las últimas 24 h. Fuera de esa ventana Meta exige una plantilla aprobada y no deja mandar la foto.
            </p>
          </section>
        ) : (
          <p className="empty">Elige una conversación.</p>
        )}
      </div>
    </section>
  )
}
