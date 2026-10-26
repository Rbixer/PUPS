import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { useStore } from '../store'

export function Login() {
  const { login, currentUser } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = "Entrar · PUP'S"
  }, [])

  if (currentUser) return <Navigate to="/admin" replace />

  const requested = (location.state as { from?: string } | null)?.from
  const destination = requested && requested.startsWith('/admin') ? requested : '/admin'

  return (
    <main className="login">
      <section className="login-brand">
        <a href="/" className="back-link">
          Volver al sitio
        </a>
        <div>
          <p className="eyebrow on-light">Sistema interno</p>
          <h1>
            Entra al <em>panel.</em>
          </h1>
          <p>Citas del día, ficha de la mascota, constancia y caja en quetzales.</p>
        </div>
        <img className="login-logo" src="/logo.png" alt="PUP'S Pet Shop y Grooming" />
      </section>
      <section className="login-panel">
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault()
            const ok = await login(username, password)
            if (!ok) {
              setError('Usuario o clave incorrectos.')
              return
            }
            navigate(destination, { replace: true })
          }}
        >
          <p className="eyebrow">Acceso</p>
          <h2>Panel de administración</h2>
          <Field label="Usuario">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Clave">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
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
