import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const KEY = 'pups-theme'
const COLORS = { light: '#1d1c1f', dark: '#0f0e10' }

type ThemeApi = { mode: ThemeMode; resolved: 'light' | 'dark'; setMode: (mode: ThemeMode) => void; toggle: () => void }

const Ctx = createContext<ThemeApi | null>(null)

function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    /* Sin almacenamiento: se usa el tema del sistema. */
  }
  return 'system'
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)
  const resolved = mode === 'system' ? system : mode

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = COLORS[resolved]
    })
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* La preferencia solo dura esta sesión. */
    }
  }, [])

  const api = useMemo<ThemeApi>(
    () => ({ mode, resolved, setMode, toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark') }),
    [mode, resolved, setMode],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useTheme() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return value
}
