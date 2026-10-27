import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0
const stack: symbol[] = []

export function Modal({
  onClose,
  labelledBy,
  dismissOnBackdrop = true,
  children,
}: {
  onClose: () => void
  labelledBy: string
  dismissOnBackdrop?: boolean
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const id = Symbol('modal')
    stack.push(id)
    const previous = document.activeElement as HTMLElement | null
    openCount += 1
    document.body.classList.add('scroll-lock')

    const frame = window.requestAnimationFrame(() => {
      const node = root.current
      if (!node || node.contains(document.activeElement)) return
      const auto = node.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      const first = auto ?? node.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea') ?? node.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus({ preventScroll: true })
    })

    function onKey(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !root.current) return
      const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey, true)
      stack.splice(stack.indexOf(id), 1)
      openCount -= 1
      if (openCount <= 0) {
        openCount = 0
        document.body.classList.remove('scroll-lock')
      }
      previous?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div
      ref={root}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) close.current()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
