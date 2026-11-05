import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY = 60 * 60 * 1000
/** Al abrir el sitio, si la versión nueva llega en estos segundos se aplica antes de que el cliente empiece a escribir. */
const FRESH_LOAD_MS = 8000

let waiting = false

/** Hay una versión nueva esperando; el aviso del panel la lee al montarse aunque el evento haya pasado antes. */
export function updateWaiting() {
  return waiting
}

const isPublic = () => !location.pathname.startsWith('/admin') && location.pathname !== '/login'

export function startPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true
      window.dispatchEvent(new CustomEvent('pups-update'))
      // El sitio de clientes no muestra aviso: se actualiza solo al abrir o cuando la pestaña queda en segundo plano.
      if (isPublic() && (document.hidden || performance.now() < FRESH_LOAD_MS)) apply()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Un panel que queda abierto todo el día igual se entera de la versión nueva.
      window.setInterval(() => void registration.update(), CHECK_EVERY)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void registration.update()
        else if (waiting && isPublic()) apply()
      })
    },
  })
  let applying = false
  function apply() {
    if (applying) return
    applying = true
    let reloaded = false
    const reload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
    // Si el service worker nuevo no toma el control (otra pestaña lo retiene, etc.), recargamos igual.
    void update(true).finally(() => window.setTimeout(reload, 1500))
  }
  window.addEventListener('pups-apply-update', apply)
}
