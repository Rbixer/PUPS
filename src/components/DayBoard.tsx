import { useEffect, useState } from 'react'
import { formatName } from '../format'
import type { Appointment } from '../types'
import { visitMinutes } from '../visit'

const OPEN = 8 * 60
const CLOSE = 19 * 60
const HOUR = 56

function label(total: number) {
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function useMinute(active: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function DayBoard({
  items,
  showNow = false,
  onMove,
  onCreate,
}: {
  items: Appointment[]
  showNow?: boolean
  onMove: (id: string, time: string) => void
  onCreate: (time: string) => void
}) {
  const now = useMinute(showNow)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const height = ((CLOSE - OPEN) / 60) * HOUR
  const visible = items.filter((item) => item.status !== 'cancelada')

  return (
    <div
      className="day-board"
      style={{ height }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/pups-id')
        if (!id) return
        const rect = event.currentTarget.getBoundingClientRect()
        const offset = event.clientY - rect.top
        const snapped = OPEN + Math.round(((offset / HOUR) * 60) / 15) * 15
        const total = Math.min(CLOSE - 15, Math.max(OPEN, snapped))
        onMove(id, label(total))
      }}
    >
      {Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, index) => OPEN + index * 60).map((minute) => (
        <button key={minute} type="button" className="day-hour" style={{ top: ((minute - OPEN) / 60) * HOUR }} onClick={() => onCreate(label(minute))}>
          <span className="num">{label(minute)}</span>
        </button>
      ))}
      {showNow && nowMinutes >= OPEN && nowMinutes <= CLOSE ? (
        <div className="day-now" style={{ top: ((nowMinutes - OPEN) / 60) * HOUR }} aria-hidden="true" />
      ) : null}
      {visible.map((item) => {
        const start = minutesOf(item.time)
        const top = ((start - OPEN) / 60) * HOUR
        const block = Math.max(40, (visitMinutes(item) / 60) * HOUR - 6)
        const same = visible.filter((other) => other.time === item.time)
        const lane = same.findIndex((other) => other.id === item.id)
        const share = `calc((100% - 84px) / ${same.length} - 6px)`
        return (
          <article
            key={item.id}
            className={`day-block ${item.status}`}
            style={{
              top,
              height: block,
              width: share,
              left: `calc(68px + ${lane} * ((100% - 84px) / ${same.length}))`,
              zIndex: 1 + lane,
            }}
            aria-label={`${formatName(item.petName)} ${item.time}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/pups-id', item.id)
              event.dataTransfer.setData('text/pups-time', item.time)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <strong>{formatName(item.petName)}</strong>
            <span>
              {item.time} · {visitMinutes(item)} min
            </span>
          </article>
        )
      })}
    </div>
  )
}
