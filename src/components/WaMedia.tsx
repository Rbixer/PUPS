import { Fragment, useEffect, useRef, useState } from 'react'
import type { WaMedia } from '../types'
import { Dialog } from './ui'

type Loader = (id: string) => Promise<{ url: string; mime: string } | { error: string }>

const KIND_LABEL: Record<WaMedia['kind'], string> = {
  image: 'la foto',
  sticker: 'el sticker',
  audio: 'el audio',
  video: 'el video',
  document: 'el documento',
}

/** Texto con enlaces que se pueden abrir. Solo http y https. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>
        const trail = part.match(/[.,;:!?)\]]+$/)?.[0] ?? ''
        const url = trail ? part.slice(0, -trail.length) : part
        return (
          <Fragment key={index}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
            {trail}
          </Fragment>
        )
      })}
    </>
  )
}

/** Muestra el archivo de un mensaje: fotos y stickers con ampliación, audio y video con reproductor, documentos para abrir. */
export function MediaView({ media, load }: { media: WaMedia; load: Loader }) {
  const loader = useRef(load)
  loader.current = load
  const [file, setFile] = useState<{ url: string; mime: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const auto = media.kind !== 'document'

  async function fetchFile() {
    setBusy(true)
    setError('')
    const result = await loader.current(media.id)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return null
    }
    setFile(result)
    return result
  }

  useEffect(() => {
    if (!auto) return
    let alive = true
    setBusy(true)
    void loader.current(media.id).then((result) => {
      if (!alive) return
      setBusy(false)
      if ('error' in result) setError(result.error)
      else setFile(result)
    })
    return () => {
      alive = false
    }
  }, [auto, media.id])

  async function openDocument() {
    const ready = file ?? (await fetchFile())
    if (ready) window.open(ready.url, '_blank', 'noopener')
  }

  const retry = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void fetchFile()} disabled={busy}>
      Reintentar
    </button>
  )

  if (media.kind === 'document') {
    return (
      <div className="wa-media wa-doc">
        <span aria-hidden="true">📄</span>
        <span className="wa-doc-name">{media.name || 'Documento'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openDocument()} disabled={busy}>
          {busy ? 'Abriendo…' : 'Abrir'}
        </button>
        {error ? <small className="wa-media-error">{error}</small> : null}
      </div>
    )
  }

  if (error) {
    return (
      <div className="wa-media wa-media-missing" role="status">
        <small className="wa-media-error">{error}</small>
        {retry}
      </div>
    )
  }

  if (!file) {
    return (
      <div className="wa-media wa-media-loading" role="status">
        Cargando {KIND_LABEL[media.kind]}…
      </div>
    )
  }

  if (media.kind === 'audio') {
    return (
      <div className="wa-media">
        <audio controls preload="metadata" src={file.url} aria-label={media.voice ? 'Nota de voz' : 'Audio'} />
      </div>
    )
  }

  if (media.kind === 'video') {
    return (
      <div className="wa-media">
        <video controls preload="metadata" playsInline src={file.url} aria-label="Video" />
      </div>
    )
  }

  const label = media.kind === 'sticker' ? 'Sticker' : 'Foto'
  return (
    <div className={media.kind === 'sticker' ? 'wa-media wa-sticker' : 'wa-media'}>
      <button type="button" className="wa-zoom" onClick={() => setZoom(true)} aria-label={`Ampliar ${label.toLowerCase()}`}>
        <img src={file.url} alt={label} loading="lazy" />
      </button>
      {zoom ? (
        <Dialog labelledBy="wa-zoom-title" onClose={() => setZoom(false)} className="wa-lightbox" backdrop>
          <h2 id="wa-zoom-title" className="sr-only">
            {label} ampliada
          </h2>
          <img src={file.url} alt={label} />
          <div className="wa-lightbox-actions">
            <a className="btn btn-ghost" href={file.url} download={media.name || `${media.kind}-${media.id}`}>
              Descargar
            </a>
            <button type="button" className="btn btn-primary" onClick={() => setZoom(false)}>
              Cerrar
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
