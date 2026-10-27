import { useMemo, useState, type ReactNode } from 'react'
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

      <section className="module-panel">
      <header className="module-bar">
        <h2>Directorio</h2>
        <span>{visible.length === 1 ? '1 ficha' : `${visible.length} fichas`}</span>
      </header>
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
    </section>
  )
}

type GlyphName = 'back' | 'paw' | 'clock' | 'receipt' | 'sparkles' | 'calendar' | 'phone' | 'file' | 'camera' | 'alert' | 'check' | 'plus' | 'chat'

function Glyph({ name, className = 'size-5' }: { name: GlyphName; className?: string }) {
  const paths: Record<GlyphName, string> = {
    back: 'M19 12H5m7-7-7 7 7 7',
    paw: 'M11 5.5a2 2.5 0 1 0 0 .01M17.5 7.5a2 2.5 0 1 0 0 .01M5 11.5a2 2.5 0 1 0 0 .01M19.5 13a2 2.5 0 1 0 0 .01M12 11c-2.7 0-5.5 2.8-5.5 5.5 0 1.8 1.3 3 3 3 .9 0 1.6-.4 2.5-.4s1.6.4 2.5.4c1.7 0 3-1.2 3-3C17.5 13.8 14.7 11 12 11Z',
    clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 6h6M9 13h6',
    sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 11 .9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z',
    calendar: 'M8 3v3m8-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6m-6 4h6',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    alert: 'M12 9v4m0 4h.01M10.3 4.2 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
    check: 'm5 12 4 4L19 6',
    plus: 'M12 5v14m-7-7h14',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5A8 8 0 1 1 21 12Z',
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

const TILE = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
} as const

const CARD = 'rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_12px_32px_-18px_rgba(28,25,23,0.18)] dark:border-stone-800 dark:bg-stone-900'
const SUBCARD = 'rounded-xl border border-stone-200/80 bg-white p-4 dark:border-stone-800 dark:bg-stone-950/40'
const LABEL = 'text-[11px] font-semibold tracking-[0.1em] text-stone-500 uppercase dark:text-stone-400'
const ORANGE_LINK = 'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-caramel-bold hover:underline dark:text-caramel'

function daysBetween(iso: string, today = new Date()) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, (m || 1) - 1, d || 1)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - base.getTime()) / 86_400_000)
}

function relative(iso: string) {
  const diff = daysBetween(iso)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  if (diff > 0) return `En ${diff} días`
  if (diff > -30) return `Hace ${-diff} días`
  const months = Math.round(-diff / 30)
  return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`
}

function Tile({ tone, name }: { tone: keyof typeof TILE; name: GlyphName }) {
  return (
    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${TILE[tone]}`}>
      <Glyph name={name} />
    </span>
  )
}

function Badge({ children, tone = 'emerald' }: { children: string; tone?: 'emerald' | 'amber' | 'stone' | 'rose' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    stone: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

function Stat({
  tone,
  icon,
  label,
  value,
  badge,
  badgeTone,
}: {
  tone: keyof typeof TILE
  icon: GlyphName
  label: string
  value: string
  badge?: string
  badgeTone?: 'emerald' | 'amber' | 'stone' | 'rose'
}) {
  return (
    <article className={`${CARD} min-w-0 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <Tile tone={tone} name={icon} />
        {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
      </div>
      <p className={`${LABEL} mt-5`}>{label}</p>
      <p className="num mt-1 truncate text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{value}</p>
    </article>
  )
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-100 py-2.5 last:border-0 dark:border-stone-800">
      <dt className="text-sm text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className={`m-0 text-right text-sm font-semibold ${warn ? 'text-rose-700 dark:text-rose-300' : 'text-stone-900 dark:text-stone-100'}`}>{value}</dd>
    </div>
  )
}

function SectionHead({
  tone,
  icon,
  title,
  text,
  children,
}: {
  tone: keyof typeof TILE
  icon: GlyphName
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Tile tone={tone} name={icon} />
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-100">{title}</h2>
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">{text}</p>
        </div>
      </div>
      {children}
    </header>
  )
}

function Dossier({ file }: { file: PetFile }) {
  const last = file.visits[0]
  const arrival = ingresoLabels(file.visits.find((item) => item.report))
  const photo = portrait(file.visits)
  const phone = digits(file.phone)
  const plan = planOf(last)
  const allergy = allergyOf(file.allergies)
  const pending = file.visits.filter((item) => item.status === 'pendiente')
  const done = file.visits.filter((item) => item.status === 'completada')
  const reports = file.visits.filter((item) => item.report)
  const photos = file.visits.reduce((sum, item) => sum + (visitPhoto(item, 'antes') ? 1 : 0) + (visitPhoto(item, 'despues') ? 1 : 0), 0)
  const total = spent(file.visits)
  const thisYear = file.visits.filter((item) => item.date.startsWith(String(new Date().getFullYear()))).length
  const nextVisit = [...pending].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).find((item) => daysBetween(item.date) >= 0)
  const bookUrl = `/admin/reservar?mascota=${encodeURIComponent(file.petName)}&tutor=${encodeURIComponent(file.clientName)}&tel=${phone}`

  const status =
    last.status === 'pendiente'
      ? { tone: 'amber' as const, text: 'Cita pendiente' }
      : last.status === 'completada'
        ? { tone: 'emerald' as const, text: 'Al día' }
        : { tone: 'stone' as const, text: 'Última cita cancelada' }

  return (
    <section className="stack">
      <header className="page-head max-side:static !gap-4 py-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            className="grid size-10 shrink-0 place-items-center rounded-full text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            to="/admin/fichas"
            aria-label="Volver a todas las fichas"
          >
            <Glyph name="back" />
          </Link>
          {photo ? (
            <img className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200 sm:size-16 dark:ring-stone-700" src={photo} alt="" />
          ) : (
            <span className={`file-mark lg !m-0 size-14 shrink-0 sm:size-16 ${markOf(file.petName)}`}>{initials(file.petName)}</span>
          )}
          <div className="min-w-0">
            <h1 className="truncate !text-2xl !font-extrabold sm:!text-3xl">{formatName(file.petName)}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-stone-600 dark:text-stone-400">
              <span className="truncate">
                Tutor: <b className="font-semibold text-stone-800 dark:text-stone-200">{formatName(file.clientName)}</b>
              </span>
              <Badge tone={status.tone}>{status.text}</Badge>
              {allergy ? <Badge tone="rose">Alergia</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone.length >= 8 ? (
            <Link className="btn btn-ghost" to={`/admin/whatsapp?tel=${phone}`}>
              <Glyph name="chat" className="size-4" />
              WhatsApp
            </Link>
          ) : null}
          <Link className="btn btn-primary" to={bookUrl}>
            <Glyph name="plus" className="size-4" />
            Nueva cita
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="amber" icon="paw" label="Visitas" value={String(file.visits.length)} badge={thisYear ? `+${thisYear} este año` : undefined} />
        <Stat
          tone="sky"
          icon="clock"
          label={nextVisit ? 'Próxima cita' : 'Última visita'}
          value={longDate((nextVisit ?? last).date)}
          badge={relative((nextVisit ?? last).date)}
          badgeTone={nextVisit ? 'amber' : 'stone'}
        />
        <Stat tone="orange" icon="receipt" label="Total pagado" value={money(total)} badge={done.length ? `Promedio ${money(Math.round(total / done.length))}` : undefined} badgeTone="stone" />
        <Stat tone="emerald" icon="sparkles" label="Plan habitual" value={plan === 'premium' ? 'Premium' : 'Grooming'} badge={`${PLAN_MINUTES[plan]} min`} badgeTone="stone" />
      </div>

      <section className={`${CARD} p-5`}>
        <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-100">Resumen de la mascota</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className={SUBCARD}>
            <p className="text-xs text-stone-500 dark:text-stone-400">Citas pendientes</p>
            <p className="num mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{pending.length}</p>
            <Link className={ORANGE_LINK} to="/admin">
              Ver agenda
            </Link>
          </article>
          <article className={SUBCARD}>
            <p className="text-xs text-stone-500 dark:text-stone-400">Visitas completadas</p>
            <p className="num mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{done.length}</p>
          </article>
          <article className={SUBCARD}>
            <p className="text-xs text-stone-500 dark:text-stone-400">Constancias</p>
            <p className="num mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{reports.length}</p>
            {reports[0] ? (
              <Link className={ORANGE_LINK} to={`/admin?constancia=${reports[0].id}`}>
                Abrir la última
              </Link>
            ) : null}
          </article>
          <article className={SUBCARD}>
            <p className="text-xs text-stone-500 dark:text-stone-400">Fotos guardadas</p>
            <p className="num mt-1 text-2xl font-bold text-stone-900 dark:text-stone-100">{photos}</p>
            <a className={ORANGE_LINK} href="#fotos">
              Antes y después
            </a>
          </article>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${CARD} p-5`}>
          <SectionHead tone="emerald" icon="paw" title="Datos de la mascota" text="Raza, tamaño, pelaje y salud" />
          <dl className="mt-4 rounded-xl border border-stone-200/80 px-4 py-1 dark:border-stone-800">
            <Row label="Raza" value={show(file.breed)} />
            <Row label="Sexo" value={show(file.sex)} />
            <Row label="Tamaño" value={show(file.size)} />
            <Row label="Pelaje" value={show(file.coat)} />
            <Row label="Edad" value={show(file.age)} />
            <Row label="Peso" value={file.weight ? `${file.weight} kg` : 'Sin anotar'} />
          </dl>
          {allergy ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <Glyph name="alert" className="mt-0.5 size-4 shrink-0" />
              <p>
                <b className="font-semibold">Alergias:</b> {allergy}. Revisar antes de cada baño.
              </p>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Glyph name="check" className="size-4 text-emerald-600" />
              Sin alergias anotadas.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/80 px-4 py-3 dark:border-stone-800">
            <div className="min-w-0">
              <p className={LABEL}>Tutor</p>
              <p className="mt-0.5 truncate font-semibold text-stone-900 dark:text-stone-100">{formatName(file.clientName)}</p>
              <p className="num text-sm text-stone-500 dark:text-stone-400">{file.phone || 'Sin teléfono'}</p>
            </div>
            {phone.length >= 8 ? (
              <a className="btn btn-ghost btn-sm" href={`tel:+${phone.length === 8 ? `502${phone}` : phone}`}>
                <Glyph name="phone" className="size-4" />
                Llamar
              </a>
            ) : null}
          </div>
        </section>

        <section className={`${CARD} p-5`}>
          <SectionHead tone="orange" icon="file" title={`Última cita · #${last.folio}`} text={`${longDate(last.date)} · ${last.time} · ${show(last.service)}`}>
            {last.report ? (
              <Link className="btn btn-primary btn-sm" to={`/admin?constancia=${last.id}`}>
                <Glyph name="file" className="size-4" />
                Constancia PDF
              </Link>
            ) : null}
          </SectionHead>

          {arrival.length ? (
            <div className="mt-4">
              <p className={LABEL}>Cómo llegó</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {arrival.map((item) => (
                  <li key={item} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <Glyph name="alert" className="mt-0.5 size-4 shrink-0" />
              <p>La última constancia todavía no marca cómo llegó la mascota. Se completa desde Citas al cerrar la visita.</p>
            </div>
          )}

          {last.report?.recommendations ? (
            <div className="mt-4">
              <p className={LABEL}>Recomendaciones</p>
              <p className="mt-1.5 text-sm text-stone-700 dark:text-stone-300">{last.report.recommendations}</p>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className={SUBCARD}>
              <p className={LABEL}>Estado</p>
              <div className="mt-2">
                <StatusPill status={last.status} />
              </div>
            </article>
            <article className="rounded-xl border border-caramel/30 bg-orange-50 p-4 dark:border-caramel/30 dark:bg-caramel/10">
              <p className={`${LABEL} !text-caramel-bold dark:!text-caramel`}>Costo de la cita</p>
              <p className="num mt-1 text-2xl font-bold text-caramel-bold dark:text-caramel">{money(last.cost)}</p>
            </article>
          </div>
        </section>
      </div>

      <section id="fotos" className={`${CARD} scroll-mt-24 p-5`}>
        <SectionHead tone="sky" icon="camera" title="Antes y después" text={`Cita #${last.folio} · ${longDate(last.date)} · también salen en la constancia`} />
        <div className="mt-4">
          <VisitPhotos appointment={last} />
        </div>
      </section>

      <section className={`${CARD} p-5`}>
        <SectionHead tone="amber" icon="calendar" title="Historial" text={file.visits.length === 1 ? '1 visita registrada' : `${file.visits.length} visitas registradas`} />
        <ol className="m-0 mt-4 grid list-none gap-3 p-0">
          {file.visits.map((item) => {
            const itemPlan = planOf(item)
            const hasPhotos = Boolean(visitPhoto(item, 'antes') || visitPhoto(item, 'despues'))
            return (
              <li key={item.id} className={SUBCARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-center leading-none dark:bg-stone-800">
                      <span className="num text-base font-bold text-stone-900 dark:text-stone-100">{item.date.slice(8, 10)}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 dark:text-stone-100">
                        #{item.folio} · {longDate(item.date)}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {item.time} · {show(item.service)} · {itemPlan === 'premium' ? 'Premium' : 'Grooming'} · {PLAN_MINUTES[itemPlan]} min
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={item.status} />
                    <b className="num text-sm font-bold text-stone-900 dark:text-stone-100">{money(item.cost)}</b>
                    {item.report ? (
                      <Link className="btn btn-ghost btn-sm" to={`/admin?constancia=${item.id}`}>
                        Constancia
                      </Link>
                    ) : null}
                  </div>
                </div>
                {item.report?.recommendations ? <p className="mt-3 text-sm text-stone-700 dark:text-stone-300">{item.report.recommendations}</p> : null}
                {item.id !== last.id && hasPhotos ? (
                  <div className="mt-3">
                    <VisitPhotos appointment={item} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>
    </section>
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
