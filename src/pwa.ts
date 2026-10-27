import { registerSW } from 'virtual:pwa-register'

export function startPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pups-update'))
    },
  })
  window.addEventListener('pups-apply-update', () => {
    void update(true)
  })
}
