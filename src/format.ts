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

function rotr(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

/** SHA-256 sin depender de un contexto seguro. En el celular, por la red local, crypto.subtle no existe. */
function sha256(bytes: Uint8Array) {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const bitLength = bytes.length * 8
  const withOne = bytes.length + 1
  const zeroCount = (64 - ((withOne + 8) % 64)) % 64
  const padded = new Uint8Array(withOne + zeroCount + 8)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, bitLength, false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(w[index - 15], 7) ^ rotr(w[index - 15], 18) ^ (w[index - 15] >>> 3)
      const s1 = rotr(w[index - 2], 17) ^ rotr(w[index - 2], 19) ^ (w[index - 2] >>> 10)
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + k[index] + w[index]) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('')
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

export async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(`pups:${password.trim()}`)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', encoded)
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    } catch {
      /* Mismo caso: la red local del celular no es un contexto seguro. */
    }
  }
  return sha256(encoded)
}

export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
}
