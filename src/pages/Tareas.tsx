import { useState } from 'react'
import { Field, Flash, Tabs, Tag } from '../components/ui'
import { count, isoDate, longDate } from '../format'
import { useStore } from '../store'
import type { Task, TaskStatus } from '../types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Por hacer' },
  { id: 'en curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
]

const PRIORITY_TONE = { alta: 'bad', media: 'warn', baja: 'mute' } as const

type Draft = Omit<Task, 'createdAt'>

const blank = (): Draft => ({ id: '', title: '', detail: '', assigneeId: '', dueDate: '', priority: 'media', status: 'pendiente' })

export function Tareas() {
  const { state, currentUser, allows, saveTask, setTaskStatus, removeTask } = useStore()
  const tasks = state.tasks ?? []
  const people = state.users.filter((item) => item.active)
  const names = new Map(state.users.map((item) => [item.id, [item.name, item.lastName].filter(Boolean).join(' ')]))
  const [scope, setScope] = useState<'todas' | 'mias'>('todas')
  const [form, setForm] = useState<Draft>(blank)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [arm, setArm] = useState<string | null>(null)
  const today = isoDate()
  const mine = tasks.filter((item) => item.assigneeId === currentUser?.id && item.status !== 'hecha').length
  const visible = tasks.filter((item) => scope === 'todas' || item.assigneeId === currentUser?.id)
  const editing = tasks.some((item) => item.id === form.id)
  const order = { alta: 0, media: 1, baja: 2 }

  function report(result: { ok: true } | { ok: false; error: string }, message: string) {
    if (!result.ok) {
      setError(result.error)
      setNotice('')
      return false
    }
    setError('')
    setNotice(message)
    return true
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Operación</p>
          <h1>Tareas</h1>
          <p className="lede">Asigna pendientes al equipo con prioridad y fecha límite. Cada quien ve las suyas al entrar.</p>
        </div>
      </header>

      <div className="biz-split">
        <form
          className="ledger biz-form"
          onSubmit={(event) => {
            event.preventDefault()
            const result = saveTask(form)
            if (report(result, editing ? 'Tarea actualizada.' : 'Tarea asignada.')) setForm(blank())
          }}
        >
          <h2>{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
          <Field label="Tarea">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Reponer shampoo de galón" required />
          </Field>
          <Field label="Detalle">
            <textarea rows={3} value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} />
          </Field>
          <div className="form-trio">
            <Field label="Responsable">
              <select value={form.assigneeId ?? ''} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
                <option value="">Sin asignar</option>
                {people.map((item) => (
                  <option key={item.id} value={item.id}>
                    {names.get(item.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha límite">
              <input type="date" value={form.dueDate ?? ''} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            </Field>
            <Field label="Prioridad">
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Task['priority'] })}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </Field>
          </div>
          <Flash error={error} notice={notice} />
          <div className="overlay-actions">
            {editing ? (
              <button type="button" className="btn btn-ghost" onClick={() => setForm(blank())}>
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary">
              {editing ? 'Guardar cambios' : 'Asignar tarea'}
            </button>
          </div>
        </form>
        <div className="biz-stack">
          <Tabs
            label="Filtro de tareas"
            value={scope}
            onChange={setScope}
            tabs={[
              { id: 'todas', label: 'Todas' },
              { id: 'mias', label: 'Mis tareas', count: mine },
            ]}
          />
          <p className="hint" style={{ margin: 0 }}>
            {count(tasks.filter((item) => item.status !== 'hecha').length, 'abierta', 'abiertas')} · {count(tasks.filter((item) => item.status !== 'hecha' && item.dueDate && item.dueDate < today).length, 'vencida', 'vencidas')}
          </p>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map((column) => {
          const items = visible
            .filter((item) => item.status === column.id)
            .sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
          return (
            <section key={column.id} className="kanban-col" aria-label={column.label}>
              <header>
                <h2>{column.label}</h2>
                <Tag tone="mute">{items.length}</Tag>
              </header>
              {items.map((task) => {
                const late = task.status !== 'hecha' && task.dueDate && task.dueDate < today
                const canDelete = task.createdBy === currentUser?.id || allows('equipo')
                return (
                  <article key={task.id} className={`task-card ${late ? 'is-late' : ''}`}>
                    <strong>{task.title}</strong>
                    {task.detail ? <p>{task.detail}</p> : null}
                    <div className="task-meta">
                      <Tag tone={PRIORITY_TONE[task.priority]}>{task.priority}</Tag>
                      <span>{task.assigneeId ? names.get(task.assigneeId) ?? 'Usuario' : 'Sin asignar'}</span>
                      {task.dueDate ? <span className={late ? 'hot-text' : ''}>· {late ? 'venció' : 'para'} {longDate(task.dueDate)}</span> : null}
                    </div>
                    <div className="task-actions">
                      {COLUMNS.filter((target) => target.id !== task.status).map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => report(setTaskStatus(task.id, target.id), `“${task.title}” pasó a ${target.label.toLowerCase()}.`)}
                        >
                          {target.id === 'hecha' ? 'Marcar hecha' : target.label}
                        </button>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...task, assigneeId: task.assigneeId ?? '', dueDate: task.dueDate ?? '' })}>
                        Editar
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${arm === task.id ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => {
                            if (arm !== task.id) {
                              setArm(task.id)
                              return
                            }
                            setArm(null)
                            report(removeTask(task.id), 'Tarea borrada.')
                          }}
                        >
                          {arm === task.id ? 'Confirmar' : 'Borrar'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
              {items.length === 0 ? <p className="hint" style={{ margin: 4 }}>Nada aquí.</p> : null}
            </section>
          )
        })}
      </div>
    </section>
  )
}
