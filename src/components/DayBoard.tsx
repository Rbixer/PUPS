import { formatName } from '../format'
import type { Appointment } from '../types'
import { visitMinutes } from '../visit'

const OPEN = 8 * 60
const CLOSE = 19 * 60
const HOUR = 48
const GUTTER = 58

function label(total: number) {
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

/** Reparte las citas que se cruzan en carriles lado a lado; cada grupo que se toca comparte el mismo ancho. */
function layout(items: Appointment[]) {
  const sorted = [...items].sort((a, b) => minutesOf(a.time) - minutesOf(b.time) || a.id.localeCompare(b.id))
  const placed = new Map<string, { lane: number; lanes: number }>()
  let group: { id: string; lane: number }[] = []
  let laneEnds: number[] = []
  let groupEnd = -1
  const flush = () => {
    for (const entry of group) placed.set(entry.id, { lane: entry.lane, lanes: laneEnds.length })
    group = []
    laneEnds = []
  }
  for (const item of sorted) {
    const start = minutesOf(item.time)
    const end = start + visitMinutes(item)
    if (start >= groupEnd) flush()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    group.push({ id: item.id, lane })
    groupEnd = Math.max(groupEnd, end)
  }
  flush()
  return placed
}

export function DayBoard({
  items,
  onMove,
  onCreate,
}: {
  items: Appointment[]
  onMove: (id: string, time: string) => void
  onCreate: (time: string) => void
}) {
  const rows = (CLOSE - OPEN) / 60
  const height = rows * HOUR
  const visible = items.filter((item) => item.status !== 'cancelada')
  const lanes = layout(visible)

  return (
    <div
      className="day-board"
      style={{ height: height + 28 }}
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
      {Array.from({ length: rows }, (_, index) => OPEN + index * 60).map((minute) => (
        <button key={minute} type="button" className="day-hour" style={{ top: ((minute - OPEN) / 60) * HOUR, height: HOUR }} onClick={() => onCreate(label(minute))}>
          <span className="num">{label(minute)}</span>
        </button>
      ))}
      <button type="button" className="day-hour day-hour-end" style={{ top: height, height: 28 }} onClick={() => onCreate(label(CLOSE))}>
        <span className="num">{label(CLOSE)}</span>
      </button>
      {visible.length === 0 ? <p className="day-empty">Toca una hora para agendar.</p> : null}
      {visible.map((item) => {
        const start = Math.min(CLOSE - 30, Math.max(OPEN, minutesOf(item.time)))
        const top = ((start - OPEN) / 60) * HOUR
        const block = Math.max(40, Math.min(visitMinutes(item), CLOSE - start) / 60 * HOUR - 6)
        const { lane, lanes: count } = lanes.get(item.id) ?? { lane: 0, lanes: 1 }
        const laneWidth = `(100% - ${GUTTER + 16}px) / ${count}`
        return (
          <article
            key={item.id}
            className={`day-block ${item.status}`}
            style={{
              top,
              height: block,
              width: `calc(${laneWidth} - 8px)`,
              left: `calc(${GUTTER + 8}px + ${lane} * (${laneWidth}))`,
              zIndex: 2 + lane,
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
            {item.service && visitMinutes(item) >= 60 ? <em>{item.service}</em> : null}
          </article>
        )
      })}
    </div>
  )
}
