import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  defaultsFor,
  grantModuleAll,
  NODES,
  nodeCount,
  PERMISSION_GROUPS,
  PERMISSIONS,
  permissionSummary,
  resolvePermissions,
  revokeModuleAll,
  toggleAction,
  toggleModule,
  type PermissionNode,
} from '../access'
import { saveBackupFile } from '../backup'
import { SiteContent } from '../components/SiteContent'
import { IssuedKey } from '../components/IssuedKey'
import { Field } from '../components/ui'
import { temporaryPassword } from '../password'
import { initials, PROMO_MAX, safeLink } from '../format'
import { useStore } from '../store'
import type { Permission, Role, User } from '../types'

type Draft = {
  name: string
  username: string
  role: Role
  permissions: Permission[]
}

const emptyDraft = (): Draft => ({
  name: '',
  username: '',
  role: 'Recepción',
  permissions: defaultsFor('Recepción'),
})

function draftFrom(user: User): Draft {
  return {
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: resolvePermissions(user),
  }
}

export function Usuarios() {
  const { state, allows, addUser, updateUser, toggleUser, updateSettings, exportBackup, importBackup } = useStore()
  const [params] = useSearchParams()
  const focusModule = NODES.find((node) => node.id === params.get('modulo'))?.label ?? ''
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
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)

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

  function setPermissions(next: Permission[]) {
    setForm((current) => ({ ...current, permissions: next }))
  }

  return (
    <section className="stack team">
      <header className="page-head">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1>Usuarios</h1>
          <p className="lede">
            Elige el rol y ajusta módulos y acciones sensibles. Administrador lo puede todo. Recepción arranca con el mostrador. Trabajador arranca con citas, fichas, tareas y su asistencia.
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
              <p className="person-count">
                {permissions.length} de {PERMISSIONS.length} permisos
              </p>
              <ul className="person-tags">
                {permissions.length === 0 ? (
                  <li>Sin módulos</li>
                ) : (
                  permissionSummary(permissions).map((item) => (
                    <li key={item.label}>
                      {item.label}
                      {item.extra ? <b> +{item.extra}</b> : null}
                    </li>
                  ))
                )}
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
          const password = editingId ? '' : temporaryPassword()
          const message = editingId
            ? await updateUser(editingId, {
                name: form.name,
                username: form.username,
                role: form.role,
                permissions: form.permissions,
              })
            : await addUser({
                name: form.name,
                username: form.username,
                password,
                role: form.role,
                permissions: form.permissions,
              })
          setBusy(false)
          setError(message ?? '')
          if (message) return
          if (!editingId) setIssued({ username: form.username.trim(), password })
          setEditingId(null)
          setForm(emptyDraft())
        }}
      >
        <h2>{editingId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        {issued ? <IssuedKey username={issued.username} password={issued.password} /> : null}
        <div className="team-fields">
          <Field label="Nombre">
            <input value={form.name} autoComplete="off" onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Usuario">
            <input value={form.username} autoComplete="off" onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          </Field>
          {editingId ? (
            <Field label="Clave temporal">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={async () => {
                  const password = temporaryPassword()
                  setBusy(true)
                  const message = await updateUser(editingId, {
                    name: form.name,
                    username: form.username,
                    role: form.role,
                    permissions: form.permissions,
                    password,
                  })
                  setBusy(false)
                  setError(message ?? '')
                  if (!message) setIssued({ username: form.username.trim(), password })
                }}
              >
                Generar clave temporal
              </button>
            </Field>
          ) : null}
          <Field label="Rol">
            <select value={form.role} onChange={(event) => setRole(event.target.value as Role)}>
              <option>Trabajador</option>
              <option>Recepción</option>
              <option>Administrador</option>
            </select>
          </Field>
        </div>
        <p className="hint">
          {editingId
            ? 'Al cambiar el rol se marcan los del rol. Marca el módulo y, debajo, las acciones sensibles que sí puede hacer dentro de él.'
            : 'Al crearlo se genera una clave temporal. Dásela a la persona: al entrar tendrá que elegir la suya. El rol marca los módulos; debajo ajustas las acciones sensibles.'}
        </p>
        <PermissionEditor value={form.permissions} locked={form.role === 'Administrador'} onChange={setPermissions} focus={focusModule} />
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

      {allows('negocio') ? (
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
      ) : null}
      </div>

      {allows('negocio') ? <SiteContent /> : null}

      {allows('respaldo') ? (
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
          <p className={backupNote.tone === 'error' ? 'banner error' : 'banner'} role="status">
            {backupNote.text}
          </p>
        ) : null}
      </section>
      ) : null}
    </section>
  )
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function PermissionEditor({
  value,
  locked,
  onChange,
  focus = '',
}: {
  value: Permission[]
  locked: boolean
  onChange: (next: Permission[]) => void
  focus?: string
}) {
  const [query, setQuery] = useState(focus)
  const words = plain(query.trim())
  const shown = locked ? PERMISSIONS.map((item) => item.id) : value
  const matches = (node: PermissionNode) =>
    !words || plain([node.label, node.detail, ...(node.actions ?? []).flatMap((action) => [action.label, action.detail])].join(' ')).includes(words)
  const allowed = NODES.filter((node) => shown.includes(node.id))
  const denied = NODES.filter((node) => !shown.includes(node.id))
  return (
    <div className="perm-editor" role="group" aria-label="Módulos y acciones">
      <div className="perm-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar módulo o acción…"
          aria-label="Buscar permiso"
        />
        <strong className="perm-count" aria-live="polite">
          {shown.length} de {PERMISSIONS.length} permisos
        </strong>
        <div className="perm-presets">
          <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => onChange(defaultsFor('Administrador'))}>
            Todo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => onChange(defaultsFor('Recepción'))}>
            Como recepción
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => onChange(defaultsFor('Trabajador'))}>
            Como trabajador
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => onChange([])}>
            Ninguno
          </button>
        </div>
      </div>
      {PERMISSION_GROUPS.map((group) => {
        const nodes = group.nodes.filter(matches)
        if (nodes.length === 0) return null
        const groupOn = group.nodes.filter((node) => shown.includes(node.id)).length
        return (
          <section key={group.id} className="perm-group">
            <header>
              <h3>{group.label}</h3>
              <span>
                {groupOn} de {group.nodes.length} módulos
              </span>
              {!locked ? (
                <span className="perm-group-actions">
                  <button type="button" className="text-btn" onClick={() => onChange(group.nodes.reduce((list, node) => grantModuleAll(list, node.id), value))}>
                    Marcar todo
                  </button>
                  <button type="button" className="text-btn" onClick={() => onChange(group.nodes.reduce((list, node) => revokeModuleAll(list, node.id), value))}>
                    Quitar todo
                  </button>
                </span>
              ) : null}
            </header>
            <ul className="perm-cards">
              {nodes.map((node) => {
                const on = shown.includes(node.id)
                const count = nodeCount(shown, node)
                return (
                  <li key={node.id} className={on ? 'perm-card is-on' : 'perm-card'} id={`perm-${node.id}`}>
                    <label className="perm-card-head">
                      <input type="checkbox" checked={on} disabled={locked} onChange={() => onChange(toggleModule(value, node.id, !on))} />
                      <span>
                        <strong>{node.label}</strong>
                        <small>{node.detail}</small>
                      </span>
                      {count.total > 1 ? (
                        <em>
                          {count.on}/{count.total}
                        </em>
                      ) : null}
                    </label>
                    {node.actions?.length ? (
                      <ul className="perm-actions">
                        {node.actions.map((action) => (
                          <li key={action.id}>
                            <label title={action.detail}>
                              <input
                                type="checkbox"
                                checked={shown.includes(action.id)}
                                disabled={locked}
                                onChange={() => onChange(toggleAction(value, action.id, !value.includes(action.id)))}
                              />
                              <span>
                                {action.label}
                                <small>{action.detail}</small>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {words && NODES.every((node) => !matches(node)) ? <p className="empty">Ningún permiso coincide con “{query.trim()}”.</p> : null}
      <div className="perm-preview" aria-live="polite">
        <p>
          <b>Podrá entrar a:</b> {allowed.length ? allowed.map((node) => node.label).join(', ') : 'ningún módulo'}.
        </p>
        {denied.length ? (
          <p>
            <b>No podrá entrar a:</b> {denied.map((node) => node.label).join(', ')}.
          </p>
        ) : null}
      </div>
      {locked ? <p className="hint">Administrador siempre tiene todos los permisos.</p> : null}
    </div>
  )
}
