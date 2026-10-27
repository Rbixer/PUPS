import { useRef, useState } from 'react'
import { defaultsFor, PERMISSIONS, permissionLabel, resolvePermissions } from '../access'
import { Field } from '../components/ui'
import { hashPassword } from '../format'
import { useStore } from '../store'
import type { Permission, Role, User } from '../types'

type Draft = {
  name: string
  username: string
  password: string
  role: Role
  permissions: Permission[]
}

const emptyDraft = (): Draft => ({
  name: '',
  username: '',
  password: '',
  role: 'Recepción',
  permissions: defaultsFor('Recepción'),
})

function mark(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('es') || '·'
}

function draftFrom(user: User): Draft {
  return {
    name: user.name,
    username: user.username,
    password: '',
    role: user.role,
    permissions: resolvePermissions(user),
  }
}

export function Usuarios() {
  const { state, addUser, updateUser, toggleUser, updateSettings, exportBackup, importBackup } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [backupNote, setBackupNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Draft>(emptyDraft)
  const [settings, setSettings] = useState(state.settings)

  function setRole(role: Role) {
    setForm((current) => ({ ...current, role, permissions: defaultsFor(role) }))
  }

  function togglePermission(id: Permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(id)
        ? current.permissions.filter((item) => item !== id)
        : [...current.permissions, id],
    }))
  }

  return (
    <section className="stack team">
      <header className="page-head">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1>Usuarios</h1>
          <p className="lede">
            Cada persona entra con Administrador o Recepción, y los módulos se marcan uno por uno. Quien ya existía conserva lo que ese rol podía hacer.
          </p>
        </div>
      </header>

      <div className="team-board">
        {state.users.map((user) => {
          const permissions = resolvePermissions(user)
          return (
            <article key={user.id} className={editingId === user.id ? 'person is-editing' : user.active ? 'person' : 'person is-off'}>
              <span className="person-mark" aria-hidden="true">
                {mark(user.name)}
              </span>
              <div className="person-id">
                <strong>{user.name}</strong>
                <span className="num">{user.username}</span>
              </div>
              <span className={user.active ? 'pill pill-completada' : 'pill pill-cancelada'}>
                {user.active ? user.role : 'Inactivo'}
              </span>
              <ul className="person-tags">
                {permissions.length === 0 ? <li>Sin módulos</li> : permissions.map((id) => <li key={id}>{permissionLabel(id)}</li>)}
              </ul>
              <div className="person-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingId(user.id)
                    setForm(draftFrom(user))
                    setError('')
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const message = toggleUser(user.id)
                    setError(message ?? '')
                  }}
                >
                  {user.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <div className="team-split">
      <form
        className="panel team-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (editingId) {
            const password = form.password ? await hashPassword(form.password) : undefined
            const message = updateUser(editingId, {
              name: form.name,
              username: form.username,
              role: form.role,
              permissions: form.permissions,
              password,
            })
            setError(message ?? '')
            if (!message) {
              setEditingId(null)
              setForm(emptyDraft())
            }
            return
          }
          const password = await hashPassword(form.password)
          const message = addUser({
            name: form.name,
            username: form.username,
            password,
            role: form.role,
            permissions: form.permissions,
          })
          setError(message ?? '')
          if (!message) setForm(emptyDraft())
        }}
      >
        <h2>{editingId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <div className="team-fields">
          <Field label="Nombre">
            <input value={form.name} autoComplete="off" onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Usuario">
            <input value={form.username} autoComplete="off" onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          </Field>
          <Field label={editingId ? 'Nueva clave' : 'Clave'}>
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              placeholder={editingId ? 'Vacía si se queda la actual' : ''}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required={!editingId}
            />
          </Field>
          <Field label="Rol">
            <select value={form.role} onChange={(event) => setRole(event.target.value as Role)}>
              <option>Recepción</option>
              <option>Administrador</option>
            </select>
          </Field>
        </div>
        <p className="hint">Al cambiar el rol se marcan los permisos de ese rol. Puedes ajustarlos antes de guardar.</p>
        <div className="permit-grid" role="group" aria-label="Módulos">
          {PERMISSIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="permit"
              aria-pressed={form.permissions.includes(item.id)}
              onClick={() => togglePermission(item.id)}
            >
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="team-actions">
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
          <button type="submit" className="btn btn-primary">
            {editingId ? 'Guardar usuario' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <form
        className="panel team-shop"
        onSubmit={(event) => {
          event.preventDefault()
          updateSettings({
            whatsapp: settings.whatsapp.trim(),
            address: settings.address.trim(),
            hours: settings.hours.trim(),
          })
          setSaved(true)
        }}
      >
        <h2>Datos del negocio</h2>
        <p className="hint">Aparecen en el sitio: contacto, pie y horario.</p>
        <Field label="WhatsApp del negocio">
          <input
            value={settings.whatsapp}
            onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })}
            placeholder="+502"
          />
        </Field>
        <Field label="Dirección">
          <input value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} />
        </Field>
        <Field label="Horario">
          <input value={settings.hours} onChange={(event) => setSettings({ ...settings, hours: event.target.value })} />
        </Field>
        {saved ? <p className="banner">Datos publicados en el sitio.</p> : null}
        <div className="team-actions">
          <button type="submit" className="btn btn-primary">
            Guardar datos
          </button>
        </div>
      </form>
      </div>

      <section className="panel backup" aria-labelledby="backup-title">
        <div>
          <h2 id="backup-title">Respaldo de datos</h2>
          <p className="hint">
            Todo vive en este equipo. Descarga una copia con citas, fichas, caja y equipo, y guárdala fuera del local.
          </p>
        </div>
        <div className="team-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const data = exportBackup()
              if (!data) return
              const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
              const link = document.createElement('a')
              link.href = url
              link.download = `pups-respaldo-${new Date().toISOString().slice(0, 10)}.json`
              link.click()
              URL.revokeObjectURL(url)
              setBackupNote({ tone: 'ok', text: 'Respaldo descargado.' })
            }}
          >
            Descargar respaldo
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Restaurar desde archivo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              if (!window.confirm('Restaurar reemplaza los datos de este equipo con los del archivo. ¿Continuar?')) return
              const problem = importBackup(await file.text())
              setBackupNote(problem ? { tone: 'error', text: problem } : { tone: 'ok', text: 'Datos restaurados.' })
            }}
          />
        </div>
        {backupNote ? (
          <p className={backupNote.tone === 'error' ? 'banner warn' : 'banner'} role="status">
            {backupNote.text}
          </p>
        ) : null}
      </section>
    </section>
  )
}
