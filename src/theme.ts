import { useEffect } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'pups-theme'

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(choice: ThemeChoice) {
  const mode = resolveTheme(choice)
  document.documentElement.dataset.theme = mode
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#0a1322' : '#123376')
}

/** El sitio público siempre va en claro; el tema elegido aplica solo al panel y al acceso. */
export function usePanelTheme(panel: boolean) {
  useEffect(() => {
    applyTheme(panel ? readTheme() : 'light')
  }, [panel])
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* Sin almacenamiento, el tema solo dura esta visita. */
  }
  applyTheme(choice)
}
