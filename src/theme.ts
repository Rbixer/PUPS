import { useEffect } from 'react'

/** Preferencia de tema que dejó una versión anterior; ya no se usa. */
const LEGACY_KEY = 'pups-theme'

/** Todo el sitio y el panel van siempre en modo claro. */
export function applyLightTheme() {
  document.documentElement.dataset.theme = 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#123376')
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* Sin almacenamiento no hay nada que limpiar. */
  }
}

export function usePanelTheme() {
  useEffect(() => {
    applyLightTheme()
  }, [])
}
