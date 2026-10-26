import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Field, StatusPill } from '../components/ui'
import { digits, formatName, longDate, money, show } from '../format'
import { shrinkImage } from '../image'
import { useStore } from '../store'
import type { Appointment } from '../types'
import { ingresoLabels, petFiles, planOf, PLAN_MINUTES, visitPhoto, type PetFile } from '../visit'

const MARKS = ['teal', 'sand', 'rose', 'sky', 'lilac'] as const

function markOf(name: string) {
  const total = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return MARKS[total % MARKS.length]
}

function initials(name: string) {
  const parts = formatName(name).split(' ').filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')
  return letters.toUpperCase() || 'P'
}

function allergyOf(value: string) {
  const clean = value.trim()
  if (!clean || /^(ningun[oa]s?|no|sin|nada|n\/a|—|-)$/i.test(clean)) return ''
  return clean
}

function spent(visits: Appointment[]) {
  return visits.filter((item) => item.status === 'completada').reduce((sum, item) => sum + item.cost, 0)
}

function portrait(visits: Appointment[]) {
  for (const item of visits) {
    const photo = visitPhoto(item, 'antes') || visitPhoto(item, 'despues')
    if (photo) return photo
  }
  return ''
}

export function Fichas() {
  const { state } = useStore()
  const files = petFiles(state.appointments)
  const { petKey: rawKey } = useParams()
  const selected = rawKey ? files.find((file) => file.key === decodeURIComponent(rawKey)) : null

  if (rawKey) {
    if (!selected) {
      return (
        <section className="stack">
          <header className="page-head">
            <div>
              <p className="eyebrow">Ficha</p>
              <h1>Mascota no encontrada</h1>
            </div>
            <Link className="btn btn-ghost" to="/admin/fichas">
              Volver
            </Link>
          </header>
        </section>
      )
    }
    return <Dossier file={selected} />
  }

  return <Directory files={files} />
}

function Directory({ files }: { files: PetFile[] }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      files.filter((file) => {
        if (!needle) return true
        return [file.petName, file.clientName, file.phone, file.breed, allergyOf(file.allergies), file.size]
          .join(' ')
          .toLowerCase()
          .includes(needle) ||
          (needle.startsWith('alerg') && Boolean(allergyOf(file.allergies)))
      }),
    [files, needle],
  )
  const allergic = files.filter((file) => allergyOf(file.allergies)).length
  const visits = files.reduce((sum, file) => sum + file.visits.length, 0)

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Historial clínico</p>
          <h1>Fichas</h1>
          <p className="lede">La mascota, su tutor y cada constancia, en una sola carpeta.</p>
        </div>
      </header>

      <div className="kpis">
        <article className="kpi">
          <span>Mascotas</span>
          <strong className="num">{files.length}</strong>
        </article>
        <article className="kpi">
          <span>Con alergias</span>
          <strong className="num hot">{allergic}</strong>
        </article>
        <article className="kpi">
          <span>Visitas</span>
          <strong className="num ok">{visits}</strong>
        </article>
        <article className="kpi">
          <span>En esta lista</span>
          <strong className="num cyan">{visible.length}</strong>
        </article>
      </div>

      <form className="filters filters-search" onSubmit={(event) => event.preventDefault()}>
        <Field label="Buscar ficha">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mascota, tutor, teléfono, raza o alergia"
          />
        </Field>
      </form>

      {files.length === 0 ? <p className="empty">Todavía no hay mascotas.</p> : null}
      {files.length > 0 && visible.length === 0 ? <p className="empty">Ninguna ficha coincide con la búsqueda.</p> : null}

      <div className="file-grid">
        {visible.map((file) => {
          const last = file.visits[0]
          const plan = planOf(last)
          const photo = portrait(file.visits)
          return (
            <Link key={file.key} className="file-card" to={`/admin/fichas/${encodeURIComponent(file.key)}`}>
              {photo ? (
                <img className="file-thumb" src={photo} alt="" />
              ) : (
                <span className={`file-mark ${markOf(file.petName)}`}>{initials(file.petName)}</span>
              )}
              <div className="file-id">
                <strong>{formatName(file.petName)}</strong>
                <span>
                  {show(file.breed)} · {formatName(file.clientName)}
                </span>
              </div>
              <div className="file-tags">
                <span>{show(file.size)}</span>
                <span>{show(file.sex)}</span>
                <span>{plan === 'premium' ? 'Premium' : 'Grooming'}</span>
                {allergyOf(file.allergies) ? <span className="alert">Alergia</span> : null}
              </div>
              <footer>
                <StatusPill status={last.status} />
                <b className="num">{longDate(last.date)}</b>
              </footer>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Dossier({ file }: { file: PetFile }) {
  const last = file.visits[0]
  const arrival = ingresoLabels(file.visits.find((item) => item.report))
  const photo = portrait(file.visits)
  const phone = digits(file.phone)
  const plan = planOf(last)

  return (
    <section className="stack">
      <article className="file-hero">
        {photo ? (
          <img className="file-photo" src={photo} alt="" />
        ) : (
          <span className={`file-mark lg ${markOf(file.petName)}`}>{initials(file.petName)}</span>
        )}
        <div>
          <p className="eyebrow">Ficha</p>
          <h1>{formatName(file.petName)}</h1>
          <p className="lede">
            {show(file.breed)} · {formatName(file.clientName)}
            {file.phone ? ` · ${file.phone}` : ''}
          </p>
        </div>
        <div className="file-hero-actions">
          {phone.length >= 8 ? (
            <Link className="btn btn-wa" to={`/admin/whatsapp?tel=${phone}`}>
              WhatsApp
            </Link>
          ) : null}
          <Link className="btn btn-ghost" to="/admin/fichas">
            Todas las fichas
          </Link>
        </div>
      </article>

      <div className="kpis">
        <article className="kpi">
          <span>Visitas</span>
          <strong className="num">{file.visits.length}</strong>
        </article>
        <article className="kpi">
          <span>Cobrado</span>
          <strong className="num cyan">{money(spent(file.visits))}</strong>
        </article>
        <article className="kpi">
          <span>Última visita</span>
          <strong>{longDate(last.date)}</strong>
        </article>
        <article className="kpi">
          <span>Plan</span>
          <strong>{plan === 'premium' ? 'Premium' : 'Grooming'}</strong>
        </article>
      </div>

      <div className="file-facts">
        <Fact label="Raza" value={show(file.breed)} />
        <Fact label="Sexo" value={show(file.sex)} />
        <Fact label="Tamaño" value={show(file.size)} />
        <Fact label="Pelaje" value={show(file.coat)} />
        <Fact label="Alergias" value={allergyOf(file.allergies) || 'Sin anotar'} warn={Boolean(allergyOf(file.allergies))} />
        <Fact label="Peso" value={file.weight ? `${file.weight} kg` : 'Sin anotar'} />
        <Fact label="Edad" value={show(file.age)} />
        <Fact label="Teléfono" value={file.phone || 'Sin teléfono'} />
      </div>

      <article className="file-panel">
        <header>
          <h2>Antes y después</h2>
          <p>
            Cita #{last.folio} · {longDate(last.date)}
          </p>
        </header>
        <p className="hint">Una foto de cómo llegó y otra de cómo salió. También salen en la constancia.</p>
        <VisitPhotos appointment={last} />
      </article>

      <article className="file-panel">
        <header>
          <h2>Cómo llegó la última vez</h2>
          <p>
            Cita #{last.folio} · {longDate(last.date)} · {last.time}
          </p>
        </header>
        {arrival.length ? (
          <ul className="chips">
            {arrival.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="empty">La última constancia todavía no marca el ingreso.</p>
        )}
      </article>

      <section className="file-panel">
        <header>
          <h2>Historial</h2>
          <p>{file.visits.length === 1 ? '1 visita' : `${file.visits.length} visitas`}</p>
        </header>
        <ol className="file-line">
          {file.visits.map((item) => {
            const itemPlan = planOf(item)
            return (
              <li key={item.id}>
                <article>
                  <header>
                    <div>
                      <strong>
                        #{item.folio} · {longDate(item.date)}
                      </strong>
                      <span>
                        {item.time} · {show(item.service)} · {itemPlan === 'premium' ? 'Premium' : 'Grooming'} ·{' '}
                        {PLAN_MINUTES[itemPlan]} min
                      </span>
                    </div>
                    <div className="file-line-meta">
                      <StatusPill status={item.status} />
                      <b className="num">{money(item.cost)}</b>
                    </div>
                  </header>
                  {item.report?.recommendations ? <p>{item.report.recommendations}</p> : null}
                  {item.id === last.id ? null : <VisitPhotos appointment={item} />}
                  <Link className="btn btn-ghost btn-sm" to={`/admin?constancia=${item.id}`}>
                    Abrir constancia
                  </Link>
                </article>
              </li>
            )
          })}
        </ol>
      </section>
    </section>
  )
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <article className={warn ? 'file-fact warn' : 'file-fact'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function VisitPhotos({ appointment }: { appointment: Appointment }) {
  const { setVisitPhoto } = useStore()
  const [error, setError] = useState('')

  async function onFile(slot: 'antes' | 'despues', file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elige una imagen.')
      return
    }
    const data = await shrinkImage(file)
    if (!data) {
      setError('No se pudo leer la foto.')
      return
    }
    setError(setVisitPhoto(appointment.id, slot, data) ? '' : 'No se pudo guardar la foto.')
  }

  return (
    <div>
      <div className="compare">
        <PhotoSlot
          label="Antes"
          src={visitPhoto(appointment, 'antes')}
          onFile={(file) => void onFile('antes', file)}
          onClear={() => setVisitPhoto(appointment.id, 'antes', '')}
        />
        <PhotoSlot
          label="Después"
          src={visitPhoto(appointment, 'despues')}
          onFile={(file) => void onFile('despues', file)}
          onClear={() => setVisitPhoto(appointment.id, 'despues', '')}
        />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

function PhotoSlot({
  label,
  src,
  onFile,
  onClear,
}: {
  label: string
  src: string
  onFile: (file?: File) => void
  onClear: () => void
}) {
  return (
    <div className="compare-slot">
      <span>{label}</span>
      {src ? <img src={src} alt={label} /> : <span className="photo-empty">Sin foto</span>}
      <div className="compare-actions">
        <label className="btn btn-ghost btn-sm">
          {src ? 'Cambiar' : 'Subir'}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              onFile(file)
            }}
          />
        </label>
        {src ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Quitar
          </button>
        ) : null}
      </div>
    </div>
  )
}
