import { useEffect, useRef, useState } from 'react'
import { defaultsFor, PERMISSIONS, permissionLabel, resolvePermissions } from '../access'
import { saveBackupFile } from '../backup'
import { SiteContent } from '../components/SiteContent'
import { Field } from '../components/ui'
import { initials, PROMO_MAX, safeLink } from '../format'
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
  const [settingsTouched, setSettingsTouched] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settingsTouched) setSettings(state.settings)
  }, [state.settings, settingsTouched])

  function editSettings(patch: Partial<typeof settings>) {
    setSettingsTouched(true)
    setSaved(false)
    setSettingsError('')
    setSettings((current) => ({ ...current, ...patch }))
  }

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
                {initials(user.name)}
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
          if (busy) return
          setBusy(true)
          const message = editingId
            ? await updateUser(editingId, {
                name: form.name,
                username: form.username,
                role: form.role,
                permissions: form.permissions,
                password: form.password || undefined,
              })
            : await addUser({
                name: form.name,
                username: form.username,
                password: form.password,
                role: form.role,
                permissions: form.permissions,
              })
          setBusy(false)
          setError(message ?? '')
          if (message) return
          setEditingId(null)
          setForm(emptyDraft())
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
              placeholder={editingId ? 'Vacía si se queda la actual' : 'Mínimo 8 caracteres'}
              minLength={8}
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
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : editingId ? 'Guardar usuario' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <form
        className="panel team-shop"
        onSubmit={(event) => {
          event.preventDefault()
          const promoLink = (settings.promoLink ?? '').trim()
          if (promoLink && !safeLink(promoLink)) {
            setSettingsError('El enlace del aviso debe empezar con / (una página del sitio) o con https://.')
            return
          }
          updateSettings({
            whatsapp: settings.whatsapp.trim(),
            address: settings.address.trim(),
            hours: settings.hours.trim(),
            promoText: (settings.promoText ?? '').trim().slice(0, PROMO_MAX),
            promoLink,
          })
          setSettingsTouched(false)
          setSettingsError('')
          setSaved(true)
        }}
      >
        <h2>Datos del negocio</h2>
        <p className="hint">Aparecen en el sitio: contacto, pie, horario y el aviso de promoción.</p>
        <Field label="WhatsApp del negocio">
          <input
            value={settings.whatsapp}
            onChange={(event) => editSettings({ whatsapp: event.target.value })}
            placeholder="+502"
          />
        </Field>
        <Field label="Dirección">
          <input value={settings.address} onChange={(event) => editSettings({ address: event.target.value })} />
        </Field>
        <Field label="Horario">
          <input value={settings.hours} onChange={(event) => editSettings({ hours: event.target.value })} />
        </Field>
        <Field label="Aviso arriba del sitio (vacío no se muestra)">
          <input
            value={settings.promoText ?? ''}
            maxLength={PROMO_MAX}
            onChange={(event) => editSettings({ promoText: event.target.value })}
            placeholder="Ej. Promoción del mes en baño y corte"
          />
        </Field>
        <Field label="Enlace del aviso (opcional)">
          <input
            value={settings.promoLink ?? ''}
            onChange={(event) => editSettings({ promoLink: event.target.value })}
            placeholder="/reservar o https://facebook.com/…"
          />
        </Field>
        {settingsError ? <p className="form-error">{settingsError}</p> : null}
        {saved ? <p className="banner">Datos publicados en el sitio.</p> : null}
        <div className="team-actions">
          <button type="submit" className="btn btn-primary">
            Guardar datos
          </button>
        </div>
      </form>
      </div>

      <SiteContent />

      <section className="panel backup" aria-labelledby="backup-title">
        <div>
          <h2 id="backup-title">Respaldo de datos</h2>
          <p className="hint">
            El servidor guarda una copia diaria de los últimos 30 días. Además puedes descargar una copia con citas, fichas, caja y equipo para guardarla fuera del local. Las
            claves no viajan en el archivo.
          </p>
        </div>
        <div className="team-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const data = exportBackup()
              if (!data) return
              saveBackupFile(data)
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
              if (!window.confirm('Restaurar reemplaza los datos del sistema, en todos los equipos, con los del archivo. ¿Continuar?')) return
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
