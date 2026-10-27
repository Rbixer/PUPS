import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { lockSeconds, useStore } from '../store'

export function Login() {
  const { login, currentUser } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    document.title = "Entrar · PUP'S"
  }, [])

  if (currentUser) return <Navigate to="/admin" replace />

  const requested = (location.state as { from?: string } | null)?.from
  const destination = requested && requested.startsWith('/admin') ? requested : '/admin'

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
            const data = new FormData(event.currentTarget)
            const userName = String(data.get('username') ?? username)
            const pass = String(data.get('password') ?? password)
            const wait = lockSeconds()
            if (wait > 0) {
              setError(`Demasiados intentos. Espera ${wait} s e inténtalo de nuevo.`)
              return
            }
            let ok = false
            try {
              ok = await login(userName, pass, remember)
            } catch {
              setError('No se pudo comprobar la clave en este celular. Recarga e inténtalo de nuevo.')
              return
            }
            if (!ok) {
              const locked = lockSeconds()
              setError(locked > 0 ? `Demasiados intentos. Espera ${locked} s e inténtalo de nuevo.` : 'Usuario o clave incorrectos.')
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
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
            />
          </Field>
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Mantener la sesión en este dispositivo
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary">
            Entrar
          </button>
          <p className="hint">
            La agenda se comparte en este equipo mientras el panel está abierto. Administración:{' '}
            <span className="num">admin</span> · <span className="num">pups2026</span>. Recepción:{' '}
            <span className="num">recepcion</span> · <span className="num">pups2026</span>.
          </p>
        </form>
      </section>
    </main>
  )
}
