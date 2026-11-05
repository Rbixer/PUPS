import { useState } from 'react'
import { defaultsFor } from '../access'
import { Field } from '../components/ui'
import { isoDate, money, parseAmount } from '../format'
import { useStore } from '../store'
import type { User } from '../types'

type Draft = {
  name: string
  lastName: string
  phone: string
  email: string
  username: string
  password: string
  salary: string
}

const emptyDraft = (): Draft => ({ name: '', lastName: '', phone: '', email: '', username: '', password: '', salary: '' })

function nextCode(users: User[]) {
  const numbers = users.map((item) => Number(item.employeeCode)).filter((value) => Number.isInteger(value) && value >= 1001)
  return String(numbers.length ? Math.max(...numbers) + 1 : 1001)
}

function fullName(user: Pick<User, 'name' | 'lastName'>) {
  return [user.name, user.lastName].filter(Boolean).join(' ')
}

export function Trabajadores() {
  const { state, addUser, updateUser, toggleUser } = useStore()
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const workers = state.users
    .filter((item) => item.employeeCode)
    .sort((a, b) => (a.employeeCode ?? '').localeCompare(b.employeeCode ?? ''))
  const month = isoDate().slice(0, 7)
  const code = editingId ? state.users.find((item) => item.id === editingId)?.employeeCode ?? '' : nextCode(state.users)

  function countFor(employeeCode: string) {
    const rows = state.appointments.filter((item) => item.employeeCode === employeeCode && item.status !== 'cancelada')
    return { total: rows.length, month: rows.filter((item) => item.date.startsWith(month)).length }
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="stack team">
      <header className="page-head">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1>Trabajadores</h1>
          <p className="hint">Cada persona entra con su usuario. El código se guarda en las citas que registra y así se cuenta el trabajo de cada uno.</p>
        </div>
      </header>

      {workers.length === 0 ? (
        <p className="empty">Todavía no hay trabajadores. El primero recibe el código 1001.</p>
      ) : (
        <div className="staff-board">
          {workers.map((worker) => {
            const counts = countFor(worker.employeeCode ?? '')
            return (
              <article key={worker.id} className={worker.active ? 'staff-card' : 'staff-card is-off'}>
                <b className="staff-code num">{worker.employeeCode}</b>
                <div className="person-id">
                  <strong>{fullName(worker)}</strong>
                  <span className="num">{worker.username}</span>
                </div>
                <p className="hint staff-count">
                  {worker.phone || 'Sin teléfono'}
                  {worker.email ? ` · ${worker.email}` : ''}
                  {worker.salary != null ? ` · Sueldo ${money(worker.salary)}` : ''}
                </p>
                <p className="hint staff-count">
                  {counts.month} este mes · {counts.total} en total
                  {worker.active ? '' : ' · Inactivo'}
                </p>
                <div className="person-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditingId(worker.id)
                      setForm({
                        name: worker.name,
                        lastName: worker.lastName ?? '',
                        phone: worker.phone ?? '',
                        email: worker.email ?? '',
                        username: worker.username,
                        password: '',
                        salary: worker.salary != null ? String(worker.salary) : '',
                      })
                      setError('')
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const message = toggleUser(worker.id)
                      setError(message ?? '')
                    }}
                  >
                    {worker.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <form
        className="panel team-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          const salary = parseAmount(form.salary)
          if (!Number.isFinite(salary) || salary < 0) {
            setError('El sueldo debe ser un número válido.')
            return
          }
          setBusy(true)
          if (editingId) {
            const worker = state.users.find((item) => item.id === editingId)
            if (!worker) {
              setBusy(false)
              return
            }
            const message = await updateUser(editingId, {
              name: form.name,
              lastName: form.lastName,
              phone: form.phone,
              email: form.email,
              salary,
              username: form.username,
              role: worker.role,
              permissions: worker.permissions ?? defaultsFor(worker.role),
              password: form.password || undefined,
            })
            setBusy(false)
            setError(message ?? '')
            if (!message) {
              setEditingId(null)
              setForm(emptyDraft())
            }
            return
          }
          const message = await addUser({
            name: form.name,
            lastName: form.lastName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            salary,
            username: form.username,
            password: form.password,
            role: 'Recepción',
            permissions: defaultsFor('Recepción'),
            employeeCode: nextCode(state.users),
          })
          setBusy(false)
          setError(message ?? '')
          if (!message) setForm(emptyDraft())
        }}
      >
        <h2>{editingId ? 'Editar trabajador' : 'Nuevo trabajador'}</h2>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="team-fields">
          <Field label="Nombre">
            <input value={form.name} autoComplete="off" onChange={(event) => set('name', event.target.value)} required />
          </Field>
          <Field label="Apellidos">
            <input value={form.lastName} autoComplete="off" onChange={(event) => set('lastName', event.target.value)} required />
          </Field>
          <Field label="Teléfono">
            <input value={form.phone} inputMode="tel" autoComplete="off" onChange={(event) => set('phone', event.target.value)} required />
          </Field>
          <Field label="Correo">
            <input type="email" value={form.email} autoComplete="off" onChange={(event) => set('email', event.target.value)} required />
          </Field>
          <Field label="Usuario">
            <input value={form.username} autoComplete="off" autoCapitalize="none" onChange={(event) => set('username', event.target.value)} required />
          </Field>
          <Field label={editingId ? 'Nueva contraseña' : 'Contraseña'}>
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              placeholder={editingId ? 'Vacía si se queda la actual' : 'Mínimo 8 caracteres'}
              minLength={8}
              onChange={(event) => set('password', event.target.value)}
              required={!editingId}
            />
          </Field>
          <Field label="Sueldo (Q)">
            <input className="num" inputMode="decimal" value={form.salary} onChange={(event) => set('salary', event.target.value)} required />
          </Field>
          <Field label="Código de empleado">
            <input className="num" value={code} readOnly />
          </Field>
        </div>
        <p className="hint">El código no cambia. Al guardar una cita con su usuario, esa cita suma en su cuenta.</p>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear trabajador'}
        </button>
        {editingId ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setEditingId(null)
              setForm(emptyDraft())
              setError('')
            }}
          >
            Cancelar
          </button>
        ) : null}
      </form>
    </section>
  )
}
