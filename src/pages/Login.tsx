import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Field } from '../components/ui'
import { useStore } from '../store'

const DEMO_ACCESS = import.meta.env.VITE_DEMO_ACCESS !== 'off'

const DEMO_USERS = [
  { label: 'Administración', username: 'admin', password: 'pups2026', detail: 'Acceso completo' },
  { label: 'Recepción', username: 'recepcion', password: 'pups2026', detail: 'Citas, fichas y caja' },
]

const POINTS = ['Agenda del día, hora por hora', 'Fichas con el antes y el después', 'Caja, constancias y reportes en un toque']

export function Login() {
  const { login, currentUser } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [remember, setRemember] = useState(() => localStorage.getItem('pups-remember-pref') === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)

  useEffect(() => {
    document.title = "Entrar · PUP'S"
  }, [])

  if (currentUser) return <Navigate to="/admin" replace />

  const requested = (location.state as { from?: string } | null)?.from
  const destination = requested && requested.startsWith('/admin') ? requested : '/admin'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const userName = String(data.get('username') ?? username)
    const pass = String(data.get('password') ?? password)
    setBusy(true)
    setError('')
    try {
      localStorage.setItem('pups-remember-pref', remember ? '1' : '0')
      const ok = await login(userName, pass, remember)
      if (!ok) {
        setError('Usuario o clave incorrectos.')
        setShake((value) => value + 1)
        return
      }
      navigate(destination, { replace: true })
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === 'LOCKED'
          ? 'Demasiados intentos. Espera 30 segundos e inténtalo otra vez.'
          : 'No se pudo comprobar la clave en este dispositivo. Recarga e inténtalo de nuevo.',
      )
      setShake((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <span className="login-blob a" aria-hidden="true" />
      <span className="login-blob b" aria-hidden="true" />
      <section className="login-stage">
        <div className="login-mark">
          <div className="login-logo-wrap">
            <img className="login-logo" src="/logo.png" alt="PUP'S Pet Shop y Grooming" />
          </div>
          <div>
            <p className="eyebrow">Sistema interno</p>
            <h1>
              Cada visita, <em>bien cuidada.</em>
            </h1>
            <p>Citas, fichas, caja y equipo en un solo lugar.</p>
            <ul className="login-points">
              {POINTS.map((point) => (
                <li key={point}>
                  <Icon name="check" size={16} strokeWidth={2.2} />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <form className="login-panel form-grid" onSubmit={submit}>
          <div>
            <p className="eyebrow">Acceso</p>
            <h2>Bienvenido de nuevo</h2>
          </div>
          <p className="lede">Entra con tu usuario para abrir el panel.</p>
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
            <div className="input-wrap">
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
              <button type="button" className="reveal" aria-label={reveal ? 'Ocultar clave' : 'Mostrar clave'} aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>
                <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </Field>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>Mantener la sesión en este dispositivo</span>
          </label>
          {error ? (
            <p key={shake} className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={busy ? 'btn btn-primary is-loading' : 'btn btn-primary'} disabled={busy}>
            Entrar al panel
            <Icon name="arrowRight" size={18} />
          </button>
          {DEMO_ACCESS ? (
            <div className="demo">
              <span>Acceso de demostración</span>
              <div className="demo-row">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.username}
                    type="button"
                    className="demo-chip"
                    onClick={() => {
                      setUsername(user.username)
                      setPassword(user.password)
                      setError('')
                    }}
                  >
                    <strong>{user.label}</strong>
                    <small>{user.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <p className="login-foot">La agenda se comparte en este equipo mientras el panel está abierto.</p>
        </form>
      </section>
    </main>
  )
}
