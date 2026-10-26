export function isoDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number) {
  const date = parseIso(iso)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

export function daysBetween(from: string, to: string) {
  const ms = parseIso(to).getTime() - parseIso(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function money(value: number) {
  const formatted = value.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `Q ${formatted}`
}

export function formatName(value: string) {
  const clean = value.trim()
  if (!clean) return '—'
  if (clean !== clean.toUpperCase()) return clean
  return clean
    .toLocaleLowerCase('es')
    .replace(/(^|[\s'-])(\p{L})/gu, (_all, sep: string, letter: string) => {
      return sep + letter.toLocaleUpperCase('es')
    })
}

export function show(value: string) {
  const clean = value.trim()
  return clean ? formatName(clean) : '—'
}

export function longDate(iso: string) {
  return parseIso(iso).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function weekday(iso: string) {
  return parseIso(iso).toLocaleDateString('es-GT', { weekday: 'short' })
}

export function monthStart(iso: string) {
  const date = parseIso(iso)
  return isoDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function shiftMonth(iso: string, count: number) {
  const date = parseIso(monthStart(iso))
  return isoDate(new Date(date.getFullYear(), date.getMonth() + count, 1))
}

export function monthTitle(iso: string) {
  const label = parseIso(monthStart(iso)).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' })
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1)
}

/** Seis semanas, de domingo a sábado, como la agenda del local. */
export function monthCells(iso: string) {
  const start = parseIso(monthStart(iso))
  const gridStart = addDays(isoDate(start), -start.getDay())
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

export function todayLabel() {
  return new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

export function normalizePhone(phone: string) {
  const value = digits(phone)
  if (value.length === 8) return `+502 ${value}`
  if (value.length === 11 && value.startsWith('502')) return `+502 ${value.slice(3)}`
  return phone.trim()
}

export async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(`pups:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
}
