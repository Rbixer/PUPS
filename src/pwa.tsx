import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from './components/Toast'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PwaApi = {
  online: boolean
  standalone: boolean
  ios: boolean
  canInstall: boolean
  needRefresh: boolean
  install: () => Promise<void>
  update: () => void
}

const Ctx = createContext<PwaApi | null>(null)

const UPDATE_EVERY = 60 * 60 * 1000

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos() {
  const platform = navigator.platform || ''
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [standalone, setStandalone] = useState(isStandalone)
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null)
  const announcedOffline = useRef(false)

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      window.setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => undefined)
      }, UPDATE_EVERY)
    },
  })

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!online) {
      announcedOffline.current = true
      return
    }
    if (announcedOffline.current) {
      announcedOffline.current = false
      toast.push({ title: 'Conexión recuperada', text: 'Todo está sincronizado de nuevo.', tone: 'success', duration: 3200 })
    }
  }, [online, toast])

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallEvent)
    }
    const onInstalled = () => {
      setPromptEvent(null)
      setStandalone(true)
      toast.push({ title: 'PUP\u2019S instalada', text: 'Ya puedes abrirla desde tu pantalla de inicio.', tone: 'success' })
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const media = window.matchMedia('(display-mode: standalone)')
    const onMode = () => setStandalone(isStandalone())
    media.addEventListener('change', onMode)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onMode)
    }
  }, [toast])

  useEffect(() => {
    if (!offlineReady) return
    toast.push({ title: 'Lista para usar sin conexión', text: 'El panel se abre aunque no haya internet.', tone: 'success' })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady, toast])

  const update = useCallback(() => {
    void updateServiceWorker(true)
  }, [updateServiceWorker])

  useEffect(() => {
    if (!needRefresh) return
    toast.push({
      title: 'Hay una versión nueva',
      text: 'Actualiza para ver las mejoras.',
      duration: 0,
      action: { label: 'Actualizar', run: update },
    })
  }, [needRefresh, toast, update])

  const install = useCallback(async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    await promptEvent.userChoice.catch(() => undefined)
    setPromptEvent(null)
  }, [promptEvent])

  const api = useMemo<PwaApi>(
    () => ({ online, standalone, ios: isIos(), canInstall: promptEvent !== null && !standalone, needRefresh, install, update }),
    [online, standalone, promptEvent, needRefresh, install, update],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function usePwa() {
  const value = useContext(Ctx)
  if (!value) throw new Error('usePwa debe usarse dentro de PwaProvider')
  return value
}
