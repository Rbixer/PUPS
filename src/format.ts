import type { Settings } from './types'

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

/** Iniciales de un nombre para los avatares: "Ana López" → "AL". */
export function initials(name: string | undefined, fallback = '·') {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('es') || fallback
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

/**
 * Lee un monto escrito a mano: "Q 1,500.50", "1500", "12,50" o "1.500,50".
 * Vacío vale 0; un texto que no es número da NaN para que el formulario avise.
 */
export function parseAmount(value: string) {
  let clean = value.replace(/[Q\s]/gi, '')
  if (!clean) return 0
  const comma = clean.lastIndexOf(',')
  const dot = clean.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) clean = comma > dot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '')
  else if (comma >= 0) clean = /^-?\d{1,3}(,\d{3})+$/.test(clean) ? clean.replace(/,/g, '') : clean.replace(',', '.')
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(clean)) return Number.NaN
  return Number(clean)
}

export function count(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`
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

export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      /* En http://192.168… el navegador del celular no deja usar randomUUID. */
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
}

export function mapUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`PUP'S ${address}`)}`
}

export const PROMO_MAX = 140
export const REVIEW_MAX = 400
export const SITE_LIST_MAX = 12

/** Solo rutas del sitio o direcciones https; cualquier otra cosa queda vacía. */
export function safeLink(value: string | undefined) {
  const link = (value ?? '').trim()
  if (/^\/(?!\/)\S*$/.test(link)) return link
  if (/^https:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return link
  return ''
}

export function socialLink(value: string | undefined) {
  const link = safeLink(value)
  return link.startsWith('https://') ? link : ''
}

/** Lo que el sitio público puede mostrar del contenido editable, ya recortado y validado. */
export function publicSiteContent(settings: Partial<Settings>) {
  const reviews = (Array.isArray(settings.reviews) ? settings.reviews : [])
    .map((item) => ({
      name: typeof item?.name === 'string' ? item.name.trim().slice(0, 60) : '',
      text: typeof item?.text === 'string' ? item.text.trim().slice(0, REVIEW_MAX) : '',
    }))
    .filter((item) => item.name && item.text)
    .slice(0, SITE_LIST_MAX)
  const gallery = (Array.isArray(settings.gallery) ? settings.gallery : [])
    .map((item) => ({
      src: typeof item?.src === 'string' && /^\/(?!\/)\S+$/.test(item.src) ? item.src : '',
      caption: typeof item?.caption === 'string' ? item.caption.trim().slice(0, 80) : '',
    }))
    .filter((item) => item.src)
    .slice(0, SITE_LIST_MAX)
  return {
    promoText: typeof settings.promoText === 'string' ? settings.promoText.trim().slice(0, PROMO_MAX) : '',
    promoLink: safeLink(typeof settings.promoLink === 'string' ? settings.promoLink : ''),
    facebook: socialLink(typeof settings.facebook === 'string' ? settings.facebook : ''),
    instagram: socialLink(typeof settings.instagram === 'string' ? settings.instagram : ''),
    reviews,
    gallery,
  }
}
