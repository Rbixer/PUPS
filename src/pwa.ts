import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY = 60 * 60 * 1000

export function startPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pups-update'))
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Un panel que queda abierto todo el día igual se entera de la versión nueva.
      window.setInterval(() => void registration.update(), CHECK_EVERY)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void registration.update()
      })
    },
  })
  window.addEventListener('pups-apply-update', () => {
    let reloaded = false
    const reload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
    // Si el service worker nuevo no toma el control (otra pestaña lo retiene, etc.), recargamos igual.
    void update(true).finally(() => window.setTimeout(reload, 1500))
  })
}
