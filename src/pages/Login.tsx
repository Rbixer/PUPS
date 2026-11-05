import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { DEMO_MODE } from '../env'
import { useStore } from '../store'
import { usePanelTheme } from '../theme'

export function Login() {
  const { login, currentUser } = useStore()
  usePanelTheme(true)
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [remember, setRemember] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [expired] = useState(() => sessionStorage.getItem('pups-expired') === '1')

  useEffect(() => {
    document.title = "Entrar · PUP'S"
  }, [])

  const requested = (location.state as { from?: string } | null)?.from
  const destination = requested && requested.startsWith('/admin') ? requested : '/admin'

  if (currentUser) return <Navigate to={destination} replace />

  return (
    <main className="login">
      <section className="login-stage">
        <div className="login-mark">
          <img className="login-logo" src="/logo.png" alt="PUP'S Pet Shop y Grooming" />
          <div>
            <p className="eyebrow">Sistema interno</p>
            <h1>Panel de operación</h1>
            <p>Citas, fichas, caja y equipo en un solo lugar.</p>
          </div>
        </div>
        <form
          className="login-panel form-grid"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            const data = new FormData(event.currentTarget)
            const userName = String(data.get('username') ?? username)
            const pass = String(data.get('password') ?? password)
            setBusy(true)
            const result = await login(userName, pass, remember)
            setBusy(false)
            if (!result.ok) {
              setError(result.error)
              return
            }
            navigate(destination, { replace: true })
          }}
        >
          <p className="eyebrow">Acceso</p>
          <h2>Panel de administración</h2>
          <Field label="Usuario">
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
            />
          </Field>
          <Field label="Clave">
            <input
              name="password"
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
            />
            <button type="button" className="reveal" aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>
              {reveal ? 'Ocultar' : 'Ver'}
            </button>
          </Field>
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Mantener la sesión en este dispositivo
          </label>
          {expired && !error ? (
            <p className="banner" role="status">
              La sesión venció. Vuelve a entrar.
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          {DEMO_MODE ? (
            <div className="demo-access">
              <p className="eyebrow">Acceso de demostración</p>
              <div className="demo-grid">
                <button
                  type="button"
                  onClick={() => {
                    setUsername('admin')
                    setPassword('pups2026')
                    setError('')
                  }}
                >
                  <strong>Administración</strong>
                  <span>Acceso completo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsername('recepcion')
                    setPassword('pups2026')
                    setError('')
                  }}
                >
                  <strong>Recepción</strong>
                  <span>Citas, fichas y caja</span>
                </button>
              </div>
            </div>
          ) : null}
          <p className="hint">Los datos se guardan en el equipo del local y se comparten con cada dispositivo que entre al panel.</p>
        </form>
      </section>
    </main>
  )
}
