import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS = 'pups-install-dismissed'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean(navigator.standalone))
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [update, setUpdate] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [hidden, setHidden] = useState(true)

  const bannerVisible = update || (!hidden && !isStandalone() && (prompt !== null || iosHint))

  useEffect(() => {
    document.documentElement.classList.toggle('has-install', bannerVisible)
    return () => document.documentElement.classList.remove('has-install')
  }, [bannerVisible])

  useEffect(() => {
    setHidden(localStorage.getItem(DISMISS) === '1')
    setIosHint(isIos() && !isStandalone())
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setPrompt(null)
    const onUpdate = () => setUpdate(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('pups-update', onUpdate)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('pups-update', onUpdate)
    }
  }, [])

  if (update) {
    return (
      <div className="install-banner" role="status">
        <p>Hay una versión nueva de PUP'S lista para este dispositivo.</p>
        <div className="install-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent('pups-apply-update'))}>
            Actualizar
          </button>
        </div>
      </div>
    )
  }

  if (hidden || isStandalone()) return null

  if (prompt) {
    return (
      <div className="install-banner">
        <p>Instala PUP'S. La agenda, las fichas y las reservas abren como una app, también sin señal.</p>
        <div className="install-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await prompt.prompt()
              setPrompt(null)
            }}
          >
            Instalar
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              localStorage.setItem(DISMISS, '1')
              setHidden(true)
            }}
          >
            Ahora no
          </button>
        </div>
      </div>
    )
  }

  if (!iosHint) return null

  return (
    <div className="install-banner">
      <p>En iPhone: Compartir y luego Agregar a inicio. PUP'S queda en la pantalla como app.</p>
      <div className="install-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            localStorage.setItem(DISMISS, '1')
            setHidden(true)
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}

export function OfflineChip() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null
  return (
    <p className="offline-chip" role="status">
      Sin conexión. Este dispositivo conserva la agenda.
    </p>
  )
}
