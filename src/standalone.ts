/** La app instalada no tiene la pestaña del navegador: la sesión tiene que quedar en el equipo. */
export function installedApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
}
