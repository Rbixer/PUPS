import { useEffect, useState } from 'react'
import { REVIEW_MAX, SITE_LIST_MAX, socialLink } from '../format'
import { shrinkImage } from '../image'
import { useStore } from '../store'
import type { Settings, SitePhoto, SiteReview } from '../types'
import { Field } from './ui'

type Draft = { facebook: string; instagram: string; reviews: SiteReview[]; gallery: SitePhoto[] }

const draftOf = (settings: Settings): Draft => ({
  facebook: settings.facebook ?? '',
  instagram: settings.instagram ?? '',
  reviews: settings.reviews ?? [],
  gallery: settings.gallery ?? [],
})

export function SiteContent() {
  const { state, updateSettings } = useStore()
  const [draft, setDraft] = useState<Draft>(() => draftOf(state.settings))
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!touched) setDraft(draftOf(state.settings))
  }, [state.settings, touched])

  function edit(patch: Partial<Draft>) {
    setTouched(true)
    setSaved(false)
    setError('')
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function addPhotos(files: FileList | null) {
    const room = SITE_LIST_MAX - draft.gallery.length
    const picked = [...(files ?? [])].slice(0, Math.max(0, room))
    if (picked.length === 0) {
      if (room <= 0) setError(`La galería admite hasta ${SITE_LIST_MAX} fotos.`)
      return
    }
    try {
      const photos = await Promise.all(picked.map(async (file) => ({ src: await shrinkImage(file), caption: '' })))
      edit({ gallery: [...draft.gallery, ...photos] })
    } catch {
      setError('No se pudo leer alguna foto. Prueba con otra en formato JPG o PNG.')
    }
  }

  return (
    <form
      className="panel team-shop site-content"
      onSubmit={(event) => {
        event.preventDefault()
        const facebook = draft.facebook.trim()
        const instagram = draft.instagram.trim()
        if ((facebook && !socialLink(facebook)) || (instagram && !socialLink(instagram))) {
          setError('Los enlaces de Facebook e Instagram deben empezar con https://.')
          return
        }
        updateSettings({
          facebook,
          instagram,
          reviews: draft.reviews.map((item) => ({ name: item.name.trim(), text: item.text.trim() })).filter((item) => item.name && item.text),
          gallery: draft.gallery.map((item) => ({ src: item.src, caption: item.caption.trim() })),
        })
        setTouched(false)
        setSaved(true)
      }}
    >
      <h2>Contenido del sitio</h2>
      <p className="hint">Cada sección aparece en la página de inicio solo cuando tiene algo. Usa reseñas y fotos reales, con permiso de los dueños de las mascotas.</p>

      <div className="site-content-grid">
        <Field label="Página de Facebook">
          <input value={draft.facebook} onChange={(event) => edit({ facebook: event.target.value })} placeholder="https://facebook.com/…" />
        </Field>
        <Field label="Instagram">
          <input value={draft.instagram} onChange={(event) => edit({ instagram: event.target.value })} placeholder="https://instagram.com/…" />
        </Field>
      </div>

      <fieldset className="site-content-block">
        <legend>Reseñas de clientes</legend>
        {draft.reviews.map((review, index) => (
          <div key={index} className="site-review-row">
            <Field label="Nombre">
              <input
                value={review.name}
                maxLength={60}
                onChange={(event) => edit({ reviews: draft.reviews.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)) })}
              />
            </Field>
            <Field label="Lo que dijo">
              <textarea
                value={review.text}
                maxLength={REVIEW_MAX}
                rows={2}
                onChange={(event) => edit({ reviews: draft.reviews.map((item, at) => (at === index ? { ...item, text: event.target.value } : item)) })}
              />
            </Field>
            <button type="button" className="text-btn" onClick={() => edit({ reviews: draft.reviews.filter((_, at) => at !== index) })}>
              Quitar
            </button>
          </div>
        ))}
        {draft.reviews.length < SITE_LIST_MAX ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit({ reviews: [...draft.reviews, { name: '', text: '' }] })}>
            Agregar reseña
          </button>
        ) : null}
      </fieldset>

      <fieldset className="site-content-block">
        <legend>Galería de resultados</legend>
        {draft.gallery.length > 0 ? (
          <ul className="site-gallery-edit">
            {draft.gallery.map((photo, index) => (
              <li key={`${photo.src.slice(-24)}-${index}`}>
                <img src={photo.src} alt="" />
                <input
                  value={photo.caption}
                  maxLength={80}
                  aria-label={`Texto de la foto ${index + 1}`}
                  placeholder="Ej. Max después de su baño"
                  onChange={(event) => edit({ gallery: draft.gallery.map((item, at) => (at === index ? { ...item, caption: event.target.value } : item)) })}
                />
                <button type="button" className="text-btn" onClick={() => edit({ gallery: draft.gallery.filter((_, at) => at !== index) })}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {draft.gallery.length < SITE_LIST_MAX ? (
          <Field label={`Agregar fotos (hasta ${SITE_LIST_MAX})`}>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                void addPhotos(event.target.files)
                event.target.value = ''
              }}
            />
          </Field>
        ) : null}
      </fieldset>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="banner">Contenido publicado en el sitio.</p> : null}
      <div className="team-actions">
        <button type="submit" className="btn btn-primary">
          Guardar contenido
        </button>
      </div>
    </form>
  )
}
