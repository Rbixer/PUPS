import { useEffect, useState } from 'react'
import { updateWaiting } from '../pwa'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS = 'pups-install-dismissed'

function isIos() {
  const iPadAsMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || iPadAsMac
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean(navigator.standalone))
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [update, setUpdate] = useState(updateWaiting)
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
        <p>Instala PUP'S en este equipo. La agenda sigue aquí si se va la señal y se envía al volver la conexión.</p>
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

/** El aviso solo sale si el servidor no contesta. navigator.onLine se queda en falso en el celular aunque haya señal. */
async function serverAnswers() {
  const controller = new AbortController()
  const limit = window.setTimeout(() => controller.abort(), 5000)
  try {
    await fetch('/api/state', { cache: 'no-store', signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(limit)
  }
}

export function OfflineChip() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let gone = false
    const probe = () => {
      void serverAnswers().then((up) => {
        if (!gone) setOffline(!up)
      })
    }
    const onVisible = () => {
      if (!document.hidden) probe()
    }
    probe()
    window.addEventListener('online', probe)
    window.addEventListener('offline', probe)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(probe, 20_000)
    return () => {
      gone = true
      window.clearInterval(timer)
      window.removeEventListener('online', probe)
      window.removeEventListener('offline', probe)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!offline) return null
  return (
    <p className="offline-chip" role="status">
      Sin conexión. Este dispositivo conserva la agenda.
    </p>
  )
}
