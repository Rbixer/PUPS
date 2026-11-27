import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildChimeWav, buildSilentWav, onIncoming } from '../chime'

function wavUrl(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return URL.createObjectURL(new Blob([copy], { type: 'audio/wav' }))
}

/** Suena cuando entra un mensaje y, si estás en otro módulo, deja un aviso para abrirlo. */
export function MessageChime() {
  const chime = useRef<HTMLAudioElement>(null)
  const probe = useRef<HTMLAudioElement>(null)
  const [src] = useState(() => wavUrl(buildChimeWav()))
  const [silent] = useState(() => wavUrl(buildSilentWav()))
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const bell = chime.current
    const unlock = probe.current
    if (!bell || !unlock) return
    let armed = false
    let waiting = false
    let hide = 0

    const play = () => {
      bell.volume = 0.9
      try {
        bell.currentTime = 0
      } catch {
        /* El archivo todavía no carga. */
      }
      void bell.play().catch(() => undefined)
    }

    const arm = () => {
      if (armed) return
      unlock.volume = 0
      void unlock.play().then(() => {
        unlock.pause()
        armed = true
        if (waiting) {
          waiting = false
          play()
        }
      }).catch(() => undefined)
    }

    const stop = onIncoming((count) => {
      const text = count === 1 ? 'Nuevo mensaje de WhatsApp.' : `${count} mensajes nuevos de WhatsApp.`
      setNote((current) => (count === 1 && current.startsWith('Nuevo') ? 'Llegó un mensaje de WhatsApp.' : text))
      if (!window.location.pathname.startsWith('/admin/whatsapp')) {
        setToast(text.replace(/\.$/, ''))
        window.clearTimeout(hide)
        hide = window.setTimeout(() => setToast(''), 8000)
      }
      if (!armed) {
        waiting = true
        return
      }
      play()
    })

    window.addEventListener('pointerdown', arm, true)
    window.addEventListener('keydown', arm, true)
    return () => {
      stop()
      window.clearTimeout(hide)
      window.removeEventListener('pointerdown', arm, true)
      window.removeEventListener('keydown', arm, true)
    }
  }, [])

  return (
    <>
      <audio ref={chime} className="chime-audio" data-chime="message" src={src} preload="auto" aria-hidden="true" />
      <audio ref={probe} className="chime-audio" src={silent} preload="auto" aria-hidden="true" />
      <span className="sr-only" role="status">
        {note}
      </span>
      {toast ? (
        <Link className="wa-toast" to="/admin/whatsapp">
          {toast}
        </Link>
      ) : null}
    </>
  )
}
