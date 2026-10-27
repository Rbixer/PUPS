import { useEffect, useRef, useState } from 'react'

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function CountUp({ value, format = (n: number) => String(Math.round(n)), duration = 900 }: { value: number; format?: (value: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const first = useRef(true)

  useEffect(() => {
    if (reduce()) {
      from.current = value
      setShown(value)
      return
    }
    const start = first.current ? 0 : from.current
    first.current = false
    const begin = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration)
      const eased = 1 - Math.pow(1 - progress, 4)
      const next = start + (value - start) * eased
      from.current = next
      setShown(next)
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [value, duration])

  return <>{format(shown)}</>
}
