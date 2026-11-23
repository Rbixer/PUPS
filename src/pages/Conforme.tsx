import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { longDate } from '../format'

type Info = {
  folio: number
  petName: string
  date: string
  ackedAt?: string
}

export function Conforme() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = "Conforme · PUP'S"
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/public/conforme/${encodeURIComponent(token)}`)
        const body = (await response.json().catch(() => ({}))) as Info & { error?: string }
        if (cancelled) return
        if (!response.ok) {
          setError(body.error || 'No encontramos esa constancia.')
          return
        }
        setInfo(body)
        if (body.ackedAt) setDone(true)
      } catch {
        if (!cancelled) setError('No se pudo cargar. Revisa tu conexión.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function confirm() {
    if (busy || done) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/public/conforme/${encodeURIComponent(token)}`, { method: 'POST' })
      const body = (await response.json().catch(() => ({}))) as Info & { error?: string }
      if (!response.ok) {
        setError(body.error || 'No se pudo registrar el conforme.')
        setBusy(false)
        return
      }
      setInfo(body)
      setDone(true)
    } catch {
      setError('No se pudo registrar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <section className="login-stage" style={{ maxWidth: 420 }}>
        <div className="login-mark">
          <img className="login-logo" src="/logo.png" alt="PUP'S" />
          <div>
            <p className="eyebrow">Constancia de visita</p>
            <h1>Conforme</h1>
            <p>Confirma que recibiste a tu mascota y revisaste el egreso.</p>
          </div>
        </div>
        <div className="login-panel form-grid">
          {error ? <p className="form-error">{error}</p> : null}
          {!info && !error ? <p className="hint">Cargando…</p> : null}
          {info ? (
            <>
              <p>
                <strong>{info.petName}</strong>
                <br />
                Folio #{info.folio} · {longDate(info.date)}
              </p>
              {done ? (
                <p className="banner" role="status">
                  Gracias. Quedó registrado el conforme
                  {info.ackedAt ? ` el ${longDate(info.ackedAt.slice(0, 10))}` : ''}.
                </p>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
                  {busy ? 'Guardando…' : 'Conforme'}
                </button>
              )}
            </>
          ) : null}
          <p className="hint">
            <Link to="/">Volver al sitio</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
