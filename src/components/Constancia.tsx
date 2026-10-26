import { useEffect, useMemo, useState } from 'react'
import { Field } from './ui'
import { SEXES } from '../catalog'
import { formatName, longDate, money } from '../format'
import { EGRESO_GROUPS, EGRESO_ITEMS, INGRESO_ITEMS, PHOTO_LABELS, readReport } from '../grooming'
import { shrinkImage } from '../image'
import type { Appointment, CheckItem, GroomingReport, Mark } from '../types'
import { applyPlan, PLAN_MINUTES, premiumGaps, priceFor, type PlanId } from '../visit'

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
  onClose,
  onSave,
}: {
  appointment: Appointment
  history: Appointment[]
  intent?: 'form' | 'print'
  onClose: () => void
  onSave: (patch: Partial<Appointment>) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => fromAppointment(appointment))
  const [saved, setSaved] = useState(false)
  const [printError, setPrintError] = useState('')
  const [preview, setPreview] = useState(false)
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

  function setMarks(group: 'ingreso' | 'egreso', marks: Record<string, Mark>) {
    setSaved(false)
    setDraft((current) => {
      const next = { ...current.report[group] }
      for (const [key, value] of Object.entries(marks)) next[key] = { ...next[key], value }
      return { ...current, report: { ...current.report, [group]: next } }
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
      },
      beforePhoto: report.photos[0] ?? '',
      afterPhoto: report.photos[2] ?? '',
    })
    setSaved(true)
  }

  const nudos =
    report.ingreso['nudos-piel']?.value === 'si' ? 'piel' : report.ingreso.nudos?.value === 'si' ? 'nudos' : report.ingreso.nudos?.value === 'no' ? 'ninguno' : ''
  const oidos = report.ingreso['oidos-sucios']?.value === 'si' ? 'sucios' : report.ingreso['oidos-normales']?.value === 'si' ? 'normales' : ''
  const pet = formatName(draft.petName) === '—' ? 'tu perrito' : formatName(draft.petName)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="constancia-title">
      <div className="report-shell">
        <form
          className="report-form no-print"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <header className="page-head">
            <div>
              <p className="eyebrow">Visita #{appointment.folio}</p>
              <h2 id="constancia-title">Constancia de grooming</h2>
              <p className="hint">
                {longDate(appointment.date)} · {appointment.time}. El ingreso es cómo llegó. El egreso es el trabajo que sí se hizo.
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </header>

          <div className="choice" role="group" aria-label="Tipo de servicio">
            <div className="choice-row">
              {(['grooming', 'premium'] as PlanId[]).map((plan) => (
                <button
                  key={plan}
                  type="button"
                  aria-pressed={report.plan === plan}
                  onClick={() => {
                    setSaved(false)
                    setPrintError('')
                    setDraft((current) => ({ ...current, report: applyPlan(current.report, plan) }))
                  }}
                >
                  {plan === 'premium' ? 'Premium' : 'Grooming'} · {PLAN_MINUTES[plan]} min
                </button>
              ))}
            </div>
          </div>
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

          <section className="report-block">
            <h3>Datos de la encargada o el encargado</h3>
            <div className="drawer-grid">
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
            <div className="drawer-grid">
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

          <section className="report-block">
            <h3>Ingreso · cómo llegó</h3>
            <Choice
              label="Nudos"
              value={nudos}
              options={[
                { id: 'ninguno', label: 'Sin nudos' },
                { id: 'nudos', label: 'Nudos' },
                { id: 'piel', label: 'Pegados a la piel' },
              ]}
              onChange={(id) => setMarks('ingreso', id === 'ninguno' ? { nudos: 'no', 'nudos-piel': 'no' } : id === 'nudos' ? { nudos: 'si', 'nudos-piel': 'no' } : { nudos: 'si', 'nudos-piel': 'si' })}
            />
            <Field label="Ubicación de los nudos">
              <input
                value={report.ingreso[nudos === 'piel' ? 'nudos-piel' : 'nudos']?.note ?? ''}
                onChange={(event) => setCheck('ingreso', nudos === 'piel' ? 'nudos-piel' : 'nudos', { note: event.target.value })}
              />
            </Field>
            <p className="hint">Uñas. Normales y largas no se marcan juntas. Encarnadas puede sumarse.</p>
            <div className="choice-row">
              <Toggle
                pressed={report.ingreso['unas-normales']?.value === 'si'}
                onClick={() => setMarks('ingreso', { 'unas-normales': report.ingreso['unas-normales']?.value === 'si' ? 'no' : 'si', 'unas-largas': 'no' })}
              >
                Normales
              </Toggle>
              <Toggle
                pressed={report.ingreso['unas-largas']?.value === 'si'}
                onClick={() => setMarks('ingreso', { 'unas-largas': report.ingreso['unas-largas']?.value === 'si' ? 'no' : 'si', 'unas-normales': 'no' })}
              >
                Largas
              </Toggle>
              <Toggle
                pressed={report.ingreso['unas-encarnadas']?.value === 'si'}
                onClick={() => setCheck('ingreso', 'unas-encarnadas', { value: report.ingreso['unas-encarnadas']?.value === 'si' ? 'no' : 'si' })}
              >
                Encarnadas
              </Toggle>
            </div>
            <Field label="Nota de uñas">
              <input value={report.ingreso['unas-encarnadas']?.note ?? ''} onChange={(event) => setCheck('ingreso', 'unas-encarnadas', { note: event.target.value })} />
            </Field>
            <Choice
              label="Oídos"
              value={oidos}
              options={[
                { id: 'normales', label: 'Normales' },
                { id: 'sucios', label: 'Sucios' },
              ]}
              onChange={(id) => setMarks('ingreso', id === 'sucios' ? { 'oidos-sucios': 'si', 'oidos-normales': 'no' } : { 'oidos-normales': 'si', 'oidos-sucios': 'no' })}
            />
            <Field label="Nota de oídos">
              <input value={report.ingreso['oidos-sucios']?.note ?? ''} onChange={(event) => setCheck('ingreso', 'oidos-sucios', { note: event.target.value })} />
            </Field>
            <YesNo
              label="Bultos, hernias, verrugas, tumores o cicatrices"
              item={report.ingreso.bultos}
              onChange={(patch) => setCheck('ingreso', 'bultos', patch)}
            />
            <YesNo
              label="Pulgas o garrapatas"
              item={report.ingreso.parasitos}
              onChange={(patch) => setCheck('ingreso', 'parasitos', patch)}
            />
          </section>

          <section className="report-block">
            <h3>Egreso · qué se hizo</h3>
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

          <section className="report-block">
            <h3>Fotografías</h3>
            <div className="photo-grid">
              {PHOTO_LABELS.map((label, index) => (
                <label key={label} className="photo-slot">
                  <span>{label}</span>
                  {report.photos[index] ? <img src={report.photos[index]} alt="" /> : <span className="photo-empty">Agregar</span>}
                  <input
                    type="file"
                    accept="image/*"
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
                  {report.photos[index] ? (
                    <button
                      type="button"
                      className="text-btn"
                      onClick={(event) => {
                        event.preventDefault()
                        const photos = [...report.photos]
                        photos[index] = ''
                        patchReport({ photos })
                      }}
                    >
                      Quitar
                    </button>
                  ) : null}
                </label>
              ))}
            </div>
          </section>

          {saved ? <p className="banner">Constancia guardada en la cita #{appointment.folio}.</p> : null}
          {printError ? <p className="banner warn">{printError}</p> : null}
          {missingPremium.length ? <p className="hint">Para imprimir Premium falta: {missingPremium.join(', ')}.</p> : null}
          <div className="overlay-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPreview((value) => !value)}>
              {preview ? 'Ocultar hoja' : 'Vista previa'}
            </button>
            <button type="submit" className="btn btn-ghost">
              Guardar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const gaps = report.plan === 'premium' ? premiumGaps(report) : []
                if (gaps.length) {
                  setPrintError(`Premium no se imprime todavía. Falta: ${gaps.join(', ')}.`)
                  return
                }
                setPrintError('')
                save()
                window.setTimeout(() => window.print(), 60)
              }}
            >
              Imprimir
            </button>
          </div>
        </form>

        <article className={preview ? 'sheet' : 'sheet only-print'}>
          <header className="sheet-head">
            <img src="/logo.png" alt="" />
            <div>
              <p>PUP'S · Pet Shop y Grooming</p>
              <h2>Constancia de grooming</h2>
            </div>
            <span className={`plan-badge ${report.plan}`}>{report.plan === 'premium' ? 'Premium' : 'Grooming'}</span>
          </header>
          <p className="sheet-folio num">
            #{appointment.folio} · {longDate(appointment.date)} · {appointment.time}
          </p>
          <dl className="sheet-facts">
            <div>
              <dt>Encargado</dt>
              <dd>{formatName(draft.clientName)}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{draft.phone || '—'}</dd>
            </div>
            <div>
              <dt>Dirección</dt>
              <dd>{report.address || '—'}</dd>
            </div>
            <div>
              <dt>Perrito</dt>
              <dd>{formatName(draft.petName)}</dd>
            </div>
            <div>
              <dt>Raza</dt>
              <dd>{formatName(draft.breed)}</dd>
            </div>
            <div>
              <dt>Edad / peso</dt>
              <dd>
                {report.age || '—'} · {report.weight || '—'}
              </dd>
            </div>
            <div>
              <dt>Sexo / castrado</dt>
              <dd>
                {draft.sex || '—'} · {markLabel(report.castrated) || '—'}
              </dd>
            </div>
            <div>
              <dt>Alergias</dt>
              <dd>{draft.allergies.trim() || '—'}</dd>
            </div>
          </dl>
          <p className="sheet-voice">Hoy fui a grooming. Me llamo {pet} y me realizaron lo siguiente.</p>
          <h3>Ingreso</h3>
          <CheckTable items={INGRESO_ITEMS} values={report.ingreso} />
          <h3>Egreso</h3>
          <CheckTable items={EGRESO_ITEMS} values={report.egreso} />
          <h3>Recomendaciones</h3>
          <p className="sheet-note">{report.recommendations.trim() || '—'}</p>
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
          <div className="sheet-sign">
            <span>Revisé cómo llegó</span>
            <span>Recibí el egreso</span>
          </div>
        </article>
      </div>
    </div>
  )
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
}) {
  return (
    <div className="choice" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="choice-row">
        {options.map((option) => (
          <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
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
      {value === 'si' ? (
        <input
          value={item?.note ?? ''}
          placeholder="Ubicación u otro detalle"
          onChange={(event) => onChange({ note: event.target.value })}
        />
      ) : null}
    </div>
  )
}

function CheckTable({ items, values }: { items: readonly { key: string; label: string }[]; values: Record<string, CheckItem> }) {
  return (
    <table className="check-table">
      <thead>
        <tr>
          <th>Característica</th>
          <th>Marca</th>
          <th>Ubicación / otro</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const current = values[item.key]
          return (
            <tr key={item.key}>
              <td>{item.label}</td>
              <td>{markLabel(current?.value ?? '') || '☐'}</td>
              <td>{current?.note?.trim() || ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
