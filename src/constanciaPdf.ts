import { installedApp } from './standalone'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 42
const BOTTOM = 48
const CONTENT_W = PAGE_W - MARGIN * 2

export type ConstanciaPdfInput = {
  folio: number
  when: string
  packageLabel: string
  petName: string
  encargado: string[]
  pet: string[]
  voice: string
  ingreso: string[]
  egreso: string[]
  behavior: string[]
  recommendations: string
  photos: { label: string; jpeg: Uint8Array }[]
  conformeUrl: string
  ackedLabel: string
}

type ImageUse = { name: string; data: Uint8Array; width: number; height: number }
type Page = { commands: string[]; images: ImageUse[] }

/** Arma el PDF de la constancia. El celular lo guarda como archivo, sin el cuadro de imprimir. */
export function constanciaPdf(input: ConstanciaPdfInput) {
  const pages: Page[] = []
  let page: Page = { commands: [], images: [] }
  let cursor = PAGE_H - MARGIN

  const open = () => {
    page = { commands: [], images: [] }
    pages.push(page)
    cursor = PAGE_H - MARGIN
  }
  const need = (height: number) => {
    if (cursor - height < BOTTOM) open()
  }
  const gap = (amount: number) => {
    cursor -= amount
  }
  const write = (value: string, size: number, bold: boolean, color: string, x = MARGIN, width = CONTENT_W) => {
    for (const line of wrap(value, size, width)) {
      need(size + 3)
      cursor -= size
      text(page.commands, line, x, cursor, size, bold, color)
      gap(3)
    }
  }

  open()
  write("PUP'S · Pet Shop y Grooming", 9, true, '5C6168')
  write('Constancia de grooming', 18, true, '17191D')
  write(`#${input.folio} · ${input.when} · ${input.packageLabel}`, 10, false, '5C6168')
  gap(8)
  rule(page.commands, cursor)
  gap(14)

  write('Encargado', 8, true, '5C6168')
  for (const line of input.encargado.length ? input.encargado : ['—']) write(line, 11, false, '17191D')
  gap(6)
  write('Perrito', 8, true, '5C6168')
  for (const line of input.pet.length ? input.pet : [input.petName || '—']) write(line, 11, false, '17191D')
  gap(10)
  write(input.voice, 11, false, '17191D')
  gap(8)

  section('Ingreso', input.ingreso)
  section('Egreso', input.egreso)
  section('Cómo se portó', input.behavior)
  if (input.recommendations.trim()) {
    write('Observaciones o recomendaciones', 8, true, '5C6168')
    write(input.recommendations.trim(), 11, false, '17191D')
    gap(8)
  }

  const photos = input.photos.flatMap((item) => {
    const size = jpegSize(item.jpeg)
    return size ? [{ ...item, ...size }] : []
  })
  if (photos.length) {
    write('Fotos', 8, true, '5C6168')
    const slot = Math.min(150, (CONTENT_W - (photos.length - 1) * 8) / photos.length)
    const height = Math.min(160, Math.max(...photos.map((item) => (slot * item.height) / item.width)))
    need(height + 16)
    let x = MARGIN
    const bottom = cursor - height
    photos.forEach((item, index) => {
      const drawW = (height * item.width) / item.height
      const name = `Im${page.images.length + 1}`
      page.images.push({ name, data: item.jpeg, width: item.width, height: item.height })
      page.commands.push(`q ${num(drawW)} 0 0 ${num(height)} ${num(x)} ${num(bottom)} cm /${name} Do Q`)
      text(page.commands, item.label, x, bottom - 11, 8, false, '5C6168')
      x += drawW + 8
      if (index === photos.length - 1) cursor = bottom - 16
    })
  }

  if (input.ackedLabel) write(input.ackedLabel, 10, true, '17191D')
  else if (input.conformeUrl) {
    write('Conforme', 8, true, '5C6168')
    write(input.conformeUrl, 9, false, '17191D')
  }
  gap(8)
  write(`PUP'S · Pet Shop y Grooming · Constancia #${input.folio}`, 8, false, '5C6168')

  return build(pages, `Constancia #${input.folio} · ${input.petName}`)

  function section(title: string, lines: string[]) {
    if (!lines.length) return
    write(title, 8, true, '5C6168')
    for (const line of lines) write(line, 10, false, '17191D')
    gap(6)
  }
}

/** Lista para el proveedor: productos y cantidades, sin costos ni precios de venta. */
export function supplierOrderPdf(input: { number: string; when: string; supplier: string; contact: string; lines: { name: string; qty: number }[] }) {
  const pages: Page[] = []
  let page: Page = { commands: [], images: [] }
  let cursor = PAGE_H - MARGIN
  const open = () => {
    page = { commands: [], images: [] }
    pages.push(page)
    cursor = PAGE_H - MARGIN
  }
  const need = (height: number) => {
    if (cursor - height < BOTTOM) open()
  }
  const write = (value: string, size: number, bold: boolean, color: string, x = MARGIN, width = CONTENT_W) => {
    for (const line of wrap(value, size, width)) {
      need(size + 3)
      cursor -= size
      text(page.commands, line, x, cursor, size, bold, color)
      cursor -= 3
    }
  }

  open()
  write("PUP'S · Pet Shop y Grooming", 9, true, '5C6168')
  write('Pedido al proveedor', 18, true, '17191D')
  write(`${input.number} · ${input.when}`, 10, false, '5C6168')
  cursor -= 8
  rule(page.commands, cursor)
  cursor -= 14
  write('Proveedor', 8, true, '5C6168')
  write(input.supplier || '—', 12, true, '17191D')
  if (input.contact.trim()) write(input.contact.trim(), 10, false, '5C6168')
  cursor -= 10
  need(14)
  cursor -= 11
  text(page.commands, 'Producto', MARGIN, cursor, 8, true, '5C6168')
  const qtyLabel = 'Cant.'
  text(page.commands, qtyLabel, PAGE_W - MARGIN - measure(qtyLabel, 8), cursor, 8, true, '5C6168')
  cursor -= 6
  rule(page.commands, cursor)
  cursor -= 12
  for (const line of input.lines) {
    const rows = wrap(line.name, 11, CONTENT_W - 56)
    rows.forEach((row, index) => {
      need(15)
      cursor -= 12
      text(page.commands, row, MARGIN, cursor, 11, false, '17191D')
      if (index === 0) {
        const qty = String(line.qty)
        text(page.commands, qty, PAGE_W - MARGIN - measure(qty, 11), cursor, 11, true, '17191D')
      }
      cursor -= 3
    })
  }
  cursor -= 10
  write('Este pedido no incluye precios.', 10, false, '5C6168')
  return build(pages, `Pedido ${input.number} · ${input.supplier}`)
}

export function jpegFromDataUrl(value: string) {
  const match = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim())
  if (!match) return null
  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return jpegSize(bytes) ? bytes : null
}

/** En el celular instalado abre el menú para guardar el archivo. Si no, lo descarga. */
export async function saveConstanciaPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy], { type: 'application/pdf' })
  const file = new File([copy], filename, { type: 'application/pdf' })
  const mobile = window.matchMedia('(max-width: 900px)').matches || installedApp()
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared' as const
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancel' as const
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return 'saved' as const
}

export function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) return null
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] }
    }
    offset += 2 + length
  }
  return null
}

function rule(commands: string[], y: number) {
  commands.push(`0.09 0.1 0.11 RG 1.2 w ${num(MARGIN)} ${num(y)} m ${num(PAGE_W - MARGIN)} ${num(y)} l S`)
}

function text(commands: string[], value: string, x: number, y: number, size: number, bold: boolean, hex: string) {
  const [r, g, b] = rgb(hex)
  commands.push(`${num(r)} ${num(g)} ${num(b)} rg`)
  commands.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm <${hexText(value)}> Tj ET`)
}

function wrap(value: string, size: number, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next, size) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function measure(value: string, size: number) {
  let units = 0
  for (const char of value) units += char === ' ' ? 280 : 500
  return (units * size) / 1000
}

function build(pages: Page[], title: string) {
  const objects: Uint8Array[] = []
  const pageIds: number[] = []
  const contentIds: number[] = []
  const imageIds = new Map<ImageUse, number>()
  let next = 3
  for (const item of pages) {
    pageIds.push(next)
    next += 1
    contentIds.push(next)
    next += 1
    for (const image of item.images) {
      imageIds.set(image, next)
      next += 1
    }
  }
  const fontRegular = next
  const fontBold = next + 1
  const info = next + 2
  objects.push(bytes(`<< /Type /Catalog /Pages 2 0 R >>`))
  objects.push(bytes(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`))
  pages.forEach((item, index) => {
    const xobjects = item.images.map((image) => `/${image.name} ${imageIds.get(image)} 0 R`).join(' ')
    objects.push(
      bytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << ${xobjects} >> >> >>`,
      ),
    )
    const stream = item.commands.join('\n')
    objects.push(bytes(`<< /Length ${asciiLength(stream)} >>\nstream\n${stream}\nendstream`))
    for (const image of item.images) {
      const header = bytes(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`,
      )
      const footer = bytes(`\nendstream`)
      objects.push(concat([header, image.data, footer]))
    }
  })
  objects.push(bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
  objects.push(bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'))
  objects.push(bytes(`<< /Title <${hexText(title)}> /Author <${hexText("PUP'S Pet Shop y Grooming")}> /Creator <${hexText("PUP'S")}> >>`))

  const header = bytes('%PDF-1.4\n')
  const chunks: Uint8Array[] = [header]
  let offset = header.length
  const offsets = [0]
  objects.forEach((body, index) => {
    const wrapped = concat([bytes(`${index + 1} 0 obj\n`), body, bytes('\nendobj\n')])
    offsets.push(offset)
    chunks.push(wrapped)
    offset += wrapped.length
  })
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF`
  chunks.push(bytes(xref))
  return concat(chunks)
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function num(value: number) {
  return Number(value.toFixed(2)).toString()
}

const WIN: Record<string, number> = {
  á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa, ñ: 0xf1, ü: 0xfc, '·': 0xb7,
  Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda, Ñ: 0xd1, Ü: 0xdc, '¿': 0xbf, '¡': 0xa1,
}

function hexText(value: string) {
  let hex = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const byte = code < 128 ? code : (WIN[char] ?? 0x3f)
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function asciiLength(value: string) {
  return bytes(value).length
}

function bytes(value: string) {
  const out = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) out[index] = value.charCodeAt(index) & 255
  return out
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}
