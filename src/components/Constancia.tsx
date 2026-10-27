import { useEffect, useMemo, useState } from 'react'
import { Field } from './ui'
import { SEXES } from '../catalog'
import { formatName, longDate, money } from '../format'
import { EGRESO_GROUPS, EGRESO_ITEMS, GROOMING_PACKAGES, INGRESO_ITEMS, packageLabel, PHOTO_LABELS, readReport } from '../grooming'
import { shrinkImage } from '../image'
import type { Appointment, CheckItem, GroomingPackage, GroomingReport, Mark } from '../types'
import { applyPlan, premiumGaps, priceFor, type PlanId } from '../visit'

type Draft = {
  clientName: string
  phone: string
  petName: string
  breed: string
  sex: string
  allergies: string
  report: GroomingReport
}

function fromAppointment(appointment: Appointment): Draft {
  const report = readReport(appointment.report)
  if (!report.photos[0] && appointment.beforePhoto) report.photos[0] = appointment.beforePhoto
  if (!report.photos[2] && appointment.afterPhoto) report.photos[2] = appointment.afterPhoto
  return {
    clientName: appointment.clientName,
    phone: appointment.phone,
    petName: appointment.petName,
    breed: appointment.breed,
    sex: appointment.sex || 'Macho',
    allergies: appointment.allergies,
    report,
  }
}

function markLabel(value: Mark) {
  if (value === 'si') return 'Sí'
  if (value === 'no') return 'No'
  return ''
}

export function Constancia({
  appointment,
  history,
  intent = 'form',
  embedded = false,
  onClose,
  onSave,
}: {
  appointment: Appointment
  history: Appointment[]
  intent?: 'form' | 'print'
  embedded?: boolean
  onClose: () => void
  onSave: (patch: Partial<Appointment>) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => fromAppointment(appointment))
  const [saved, setSaved] = useState(false)
  const [printError, setPrintError] = useState('')
  const report = draft.report
  const suggested = priceFor(report.plan, appointment.size)
  const missingPremium = report.plan === 'premium' ? premiumGaps(report) : []

  useEffect(() => {
    if (intent !== 'print') return
    const gaps = report.plan === 'premium' ? premiumGaps(report) : []
    if (gaps.length) {
      setPrintError(`Premium no se imprime todavía. Falta: ${gaps.join(', ')}.`)
      return
    }
    const timer = window.setTimeout(() => window.print(), 300)
    return () => window.clearTimeout(timer)
  }, [intent])

  const tutors = useMemo(() => {
    const byName = new Map<string, Appointment>()
    for (const item of history) {
      const key = item.clientName.trim().toLowerCase()
      if (!key || item.id === appointment.id) continue
      const previous = byName.get(key)
      if (!previous || item.date > previous.date) byName.set(key, item)
    }
    return [...byName.values()]
  }, [appointment.id, history])

  function patchReport(patch: Partial<GroomingReport>) {
    setSaved(false)
    setDraft((current) => ({ ...current, report: { ...current.report, ...patch } }))
  }

  function setCheck(group: 'ingreso' | 'egreso', key: string, patch: Partial<CheckItem>) {
    setSaved(false)
    setDraft((current) => ({
      ...current,
      report: {
        ...current.report,
        [group]: {
          ...current.report[group],
          [key]: { ...current.report[group][key], ...patch },
        },
      },
    }))
  }

  function setIngreso(key: string, patch: Partial<CheckItem>) {
    setSaved(false)
    setDraft((current) => {
      const next = { ...current.report.ingreso, [key]: { ...current.report.ingreso[key], ...patch } }
      if (patch.value === 'si') {
        if (key === 'unas-normales') next['unas-largas'] = { ...next['unas-largas'], value: 'no' }
        if (key === 'unas-largas') next['unas-normales'] = { ...next['unas-normales'], value: 'no' }
        if (key === 'nudos-piel') next.nudos = { ...next.nudos, value: 'si' }
        if (key === 'oidos-sucios') next['oidos-normales'] = { ...next['oidos-normales'], value: 'no' }
        if (key === 'oidos-normales') next['oidos-sucios'] = { ...next['oidos-sucios'], value: 'no' }
      }
      if (patch.value === 'no' && key === 'nudos') next['nudos-piel'] = { ...next['nudos-piel'], value: 'no' }
      return { ...current, report: { ...current.report, ingreso: next } }
    })
  }

  function save() {
    onSave({
      clientName: draft.clientName.trim(),
      phone: draft.phone.trim(),
      petName: draft.petName.trim(),
      breed: draft.breed.trim(),
      sex: draft.sex,
      allergies: draft.allergies.trim(),
      report: {
        ...report,
        address: report.address.trim(),
        age: report.age.trim(),
        weight: report.weight.trim(),
        recommendations: report.recommendations.trim(),
        savedAt: new Date().toISOString(),
      },
      beforePhoto: report.photos[0] ?? '',
      afterPhoto: report.photos[2] ?? '',
    })
    setSaved(true)
  }

  function printSheet() {
    const gaps = report.plan === 'premium' ? premiumGaps(report) : []
    if (gaps.length) {
      setPrintError(`Premium no se imprime todavía. Falta: ${gaps.join(', ')}.`)
      return
    }
    setPrintError('')
    save()
    window.setTimeout(() => window.print(), 60)
  }

  const pet = formatName(draft.petName) === '—' ? 'tu perrito' : formatName(draft.petName)
  const encargadoLines = [draft.clientName.trim() ? formatName(draft.clientName) : '', draft.phone.trim(), report.address.trim()].filter(
    (line) => line.trim() !== '' && line !== '—',
  )
  const petTitle = [draft.petName.trim() ? formatName(draft.petName) : '', draft.breed.trim() ? formatName(draft.breed) : '']
    .filter((line) => line.trim() !== '' && line !== '—')
    .join(' · ')
  const petMeta = [draft.sex.trim(), markLabel(report.castrated), report.age.trim(), report.weight.trim()].filter((line) => line.trim() !== '').join(' · ')
  const allergy = draft.allergies.trim()
  const ingresoPicked = pickedItems(INGRESO_ITEMS, report.ingreso)
  const egresoPicked = pickedItems(EGRESO_ITEMS, report.egreso)

  const sheet = (
    <div className={embedded ? 'constancia-page' : 'report-shell'}>
        <form
          className="report-form no-print"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <header className="constancia-mast">
            <img src="/logo.png" alt="" />
            <div>
              <p className="eyebrow">Visita #{appointment.folio}</p>
              <h2 id="constancia-title">Constancia de grooming</h2>
              <p className="hint">
                {longDate(appointment.date)} · {appointment.time}
              </p>
            </div>
            <div className="constancia-mast-side">
              <label className="grooming-pick">
                <span>Grooming</span>
                <select
                  aria-label="Tipo de grooming"
                  value={report.packageId}
                  onChange={(event) => {
                    const packageId = event.target.value as GroomingPackage
                    const plan: PlanId = packageId === 'premium' ? 'premium' : 'grooming'
                    setSaved(false)
                    setPrintError('')
                    setDraft((current) => ({
                      ...current,
                      report: { ...applyPlan(current.report, plan), packageId },
                    }))
                  }}
                >
                  {GROOMING_PACKAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={printSheet}>
                Imprimir
              </button>
              {embedded ? null : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Cerrar
                </button>
              )}
            </div>
          </header>
          <p className="hint">
            {report.plan === 'premium'
              ? 'Premium incluye baño, cepillado, uñas, oídos, deslanado, dientes y glándulas. La impresión pide foto de antes y de después.'
              : 'Grooming incluye baño, cepillado, uñas y oídos.'}{' '}
            {suggested != null
              ? `Tarifa de ${appointment.size}: ${money(suggested)}.`
              : 'Elige el tamaño en la cita para ver la tarifa.'}
          </p>
          {suggested != null && suggested !== appointment.cost ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSave({ cost: suggested })}>
              Aplicar tarifa {money(suggested)}
            </button>
          ) : null}

          <section className="report-block photo-block">
            <h3>Fotografías</h3>
            <div className="photo-grid">
              {PHOTO_LABELS.map((label, index) => (
                <div key={label} className="photo-slot">
                  <span>{label}</span>
                  {report.photos[index] ? <img src={report.photos[index]} alt="" /> : <span className="photo-empty">Sin foto</span>}
                  <label className="photo-shoot">
                    {report.photos[index] ? 'Cambiar foto' : 'Tomar foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={async (event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (!file) return
                        const data = await shrinkImage(file)
                        const photos = [...report.photos]
                        photos[index] = data
                        patchReport({ photos })
                      }}
                    />
                  </label>
                  {report.photos[index] ? (
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        const photos = [...report.photos]
                        photos[index] = ''
                        patchReport({ photos })
                      }}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="report-block">
            <h3>Datos de la encargada o el encargado</h3>
            <div className="drawer-grid tutor-grid">
              <Field label="Nombre">
                <input
                  list={`tutores-${appointment.id}`}
                  value={draft.clientName}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, clientName: event.target.value }))
                  }}
                  onBlur={() => {
                    const found = tutors.find((item) => item.clientName.trim().toLowerCase() === draft.clientName.trim().toLowerCase())
                    if (!found) return
                    setDraft((current) => ({
                      ...current,
                      phone: current.phone || found.phone,
                      report: { ...current.report, address: current.report.address || found.report?.address || '' },
                    }))
                  }}
                  placeholder="Escribe para buscar o anota uno nuevo"
                />
                <datalist id={`tutores-${appointment.id}`}>
                  {tutors.map((item) => (
                    <option key={item.id} value={item.clientName} />
                  ))}
                </datalist>
              </Field>
              <Field label="Teléfono">
                <input
                  value={draft.phone}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }}
                />
              </Field>
              <Field label="Dirección">
                <input value={report.address} onChange={(event) => patchReport({ address: event.target.value })} />
              </Field>
            </div>
          </section>

          <section className="report-block">
            <h3>Datos del perrito o la perrita</h3>
            <div className="drawer-grid pet-grid">
              <Field label="Nombre">
                <input
                  value={draft.petName}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, petName: event.target.value }))
                  }}
                />
              </Field>
              <Field label="Raza">
                <input
                  value={draft.breed}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, breed: event.target.value }))
                  }}
                />
              </Field>
              <Field label="Edad">
                <input value={report.age} onChange={(event) => patchReport({ age: event.target.value })} placeholder="3 años" />
              </Field>
              <Field label="Peso">
                <input value={report.weight} onChange={(event) => patchReport({ weight: event.target.value })} placeholder="6.4 kg" />
              </Field>
              <Field label="Sexo">
                <select
                  value={draft.sex}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, sex: event.target.value }))
                  }}
                >
                  {SEXES.map((sex) => (
                    <option key={sex}>{sex}</option>
                  ))}
                </select>
              </Field>
              <Field label="Castrado">
                <select value={report.castrated} onChange={(event) => patchReport({ castrated: event.target.value as Mark })}>
                  <option value="">Sin anotar</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Enfermedades / alergias">
                <input
                  value={draft.allergies}
                  onChange={(event) => {
                    setSaved(false)
                    setDraft((current) => ({ ...current, allergies: event.target.value }))
                  }}
                />
              </Field>
            </div>
          </section>

          <p className="sheet-voice">Hoy fui a grooming. Me llamo {pet} y me realizaron lo siguiente.</p>
          <section className="report-block">
            <h3>Ingreso</h3>
            <div className="check-sheet">
              <div className="check-head">
                <span>Característica</span>
                <span>Sí / No</span>
                <span>Otros / ubicación</span>
              </div>
              {INGRESO_ITEMS.map((item) => (
                <YesNo
                  key={item.key}
                  label={item.label}
                  item={report.ingreso[item.key]}
                  onChange={(patch) => setIngreso(item.key, patch)}
                />
              ))}
            </div>
          </section>

          <section className="report-block">
            <h3>Egreso</h3>
            {EGRESO_GROUPS.map((group) => (
              <div key={group.title} className="report-block">
                <p className="eyebrow">{group.title}</p>
                {group.items.map((item) => (
                  <YesNo
                    key={item.key}
                    label={item.label}
                    item={report.egreso[item.key]}
                    onChange={(patch) => setCheck('egreso', item.key, patch)}
                  />
                ))}
              </div>
            ))}
          </section>

          <section className="report-block">
            <h3>Recomendaciones</h3>
            <textarea
              rows={4}
              value={report.recommendations}
              onChange={(event) => patchReport({ recommendations: event.target.value })}
              placeholder="Qué debe cuidar en casa"
            />
          </section>

          {saved ? <p className="banner">Constancia guardada. Ya se puede ver en Constancias.</p> : null}
          {printError ? <p className="banner warn">{printError}</p> : null}
          {missingPremium.length ? <p className="hint">Para imprimir Premium falta: {missingPremium.join(', ')}.</p> : null}
          <div className="overlay-actions">
            <button type="submit" className="btn btn-ghost">
              Guardar
            </button>
            <button type="button" className="btn btn-primary" onClick={printSheet}>
              Imprimir
            </button>
          </div>
        </form>

        <article className="sheet constancia-sheet only-print">
          <header className="sheet-head">
            <img src="/logo.png" alt="" />
            <div className="sheet-brandblock">
              <strong>PUP'S</strong>
              <span>Pet Shop y Grooming</span>
            </div>
            <div className="sheet-docmeta">
              <h2>Constancia de grooming</h2>
              <p className="sheet-folio num">
                #{appointment.folio} · {longDate(appointment.date)} · {appointment.time}
              </p>
            </div>
            <span className={`plan-badge ${report.plan}`}>{packageLabel(report)}</span>
          </header>
          <div className="sheet-people">
            <section>
              <h3>Encargado</h3>
              {encargadoLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>
            <section>
              <h3>Perrito</h3>
              {petTitle ? <p>{petTitle}</p> : null}
              {petMeta ? <p>{petMeta}</p> : null}
              {allergy ? <p>{allergy}</p> : null}
            </section>
          </div>
          <div className="sheet-work">
            <p className="sheet-voice">Hoy fui a grooming. Me llamo {pet} y me realizaron lo siguiente.</p>
            <div className="sheet-columns">
              {ingresoPicked.length ? (
                <section>
                  <h3>Ingreso</h3>
                  <PickedList items={ingresoPicked} values={report.ingreso} />
                </section>
              ) : null}
              {egresoPicked.length ? (
                <section>
                  <h3>Egreso</h3>
                  <PickedList items={egresoPicked} values={report.egreso} />
                </section>
              ) : null}
            </div>
            {report.recommendations.trim() ? (
              <div className="sheet-reco">
                <h3>Recomendaciones</h3>
                <p className="sheet-note">{report.recommendations.trim()}</p>
              </div>
            ) : null}
          </div>
          {report.photos.some(Boolean) ? (
            <div className="sheet-photos">
              {PHOTO_LABELS.map((label, index) =>
                report.photos[index] ? (
                  <figure key={label}>
                    <img src={report.photos[index]} alt="" />
                    <figcaption>{label}</figcaption>
                  </figure>
                ) : null,
              )}
            </div>
          ) : null}
          <footer className="sheet-close">
            <div className="sheet-sign">
              <span>Revisé cómo llegó</span>
              <span>Recibí el egreso</span>
            </div>
            <p className="sheet-foot">PUP'S · Pet Shop y Grooming · Constancia #{appointment.folio}</p>
          </footer>
        </article>
      </div>
  )

  if (embedded) return sheet
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="constancia-title">
      {sheet}
    </div>
  )
}

function YesNo({ label, item, onChange }: { label: string; item?: CheckItem; onChange: (patch: Partial<CheckItem>) => void }) {
  const value = item?.value ?? ''
  return (
    <div className="yesno">
      <span>{label}</span>
      <div className="choice-row">
        <button type="button" aria-pressed={value === 'si'} onClick={() => onChange({ value: value === 'si' ? '' : 'si' })}>
          Sí
        </button>
        <button type="button" aria-pressed={value === 'no'} onClick={() => onChange({ value: value === 'no' ? '' : 'no' })}>
          No
        </button>
      </div>
      <input
        value={item?.note ?? ''}
        placeholder="Ubicación u otro"
        onChange={(event) => onChange({ note: event.target.value })}
      />
    </div>
  )
}

function pickedItems(items: readonly { key: string; label: string }[], values: Record<string, CheckItem>) {
  return items.filter((item) => {
    const current = values[item.key]
    return current?.value === 'si' || current?.value === 'no' || Boolean(current?.note?.trim())
  })
}

function PickedList({ items, values }: { items: readonly { key: string; label: string }[]; values: Record<string, CheckItem> }) {
  return (
    <ul className="sheet-picks">
      {items.map((item) => {
        const note = values[item.key]?.note?.trim()
        const mark = markLabel(values[item.key]?.value ?? '')
        return (
          <li key={item.key} className={values[item.key]?.value === 'no' ? 'is-no' : undefined}>
            {mark ? <b>{mark}</b> : null} {item.label}
            {note ? <em> · {note}</em> : null}
          </li>
        )
      })}
    </ul>
  )
}
