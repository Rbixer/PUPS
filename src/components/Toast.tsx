import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Tone = 'info' | 'success' | 'error'

export type ToastInput = {
  title: string
  text?: string
  tone?: Tone
  duration?: number
  action?: { label: string; run: () => void }
}

type Item = ToastInput & { id: number; leaving?: boolean }

type ToastApi = { push: (toast: ToastInput) => number; dismiss: (id: number) => void }

const Ctx = createContext<ToastApi | null>(null)

const ICONS: Record<Tone, IconName> = { info: 'sparkle', success: 'check', error: 'alert' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const counter = useRef(0)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const pending = timers.current.get(id)
    if (pending) window.clearTimeout(pending)
    timers.current.delete(id)
    setItems((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)))
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 220)
  }, [])

  const push = useCallback(
    (toast: ToastInput) => {
      counter.current += 1
      const id = counter.current
      const duration = toast.duration ?? 4800
      setItems((current) => [...current.slice(-3), { ...toast, id }])
      if (duration > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const active = timers.current
    return () => active.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Avisos" aria-live="polite">
        {items.map((item) => {
          const tone = item.tone ?? 'info'
          const duration = item.duration ?? 4800
          return (
            <div key={item.id} className={`toast ${tone}${item.leaving ? ' out' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
              <span className="toast-icon">
                <Icon name={ICONS[tone]} size={18} />
              </span>
              <div>
                <strong>{item.title}</strong>
                {item.text ? <span>{item.text}</span> : null}
              </div>
              {item.action ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    item.action?.run()
                    dismiss(item.id)
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
              {duration > 0 ? <i className="toast-bar" style={{ animationDuration: `${duration}ms` }} /> : null}
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider')
  return value
}
