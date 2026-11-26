import { formatName, parseAmount } from './format'
import { normalizeCategory, shelfOf } from './shop'
import type { CatalogItem, ProductUse, Purchase, PurchaseLine } from './types'

/** Fila lista para aplicar. La cantidad es la existencia que quedará. */
export type InventoryImportRow = {
  name: string
  qty: number
  use: ProductUse
  sku?: string
  unit?: string
  category?: string
  cost?: number
  price?: number
  expiresOn?: string
  minStock?: number
  /** Referencia interna u otra nota. No se usa para emparejar productos. */
  detail?: string
  image?: string
}

export type ParsedRow = {
  line: number
  name: string
  qty: number
  use?: ProductUse
  sku?: string
  unit?: string
  category?: string
  cost?: number
  price?: number
  expiresOn?: string
  minStock?: number
  detail?: string
  image?: string
  warning?: string
  error?: string
}

export type SkippedRow = { line: number; name: string; reason: string }

export type LoadStatus = 'coincide' | 'sobra' | 'falta' | 'ajeno' | 'sin-pedido'

export type LoadRow = Omit<ParsedRow, 'use'> & {
  use: ProductUse
  productId?: string
  catalogName?: string
  previousUse?: ProductUse
  currentStock: number | null
  orderQty: number | null
  status: LoadStatus
  fresh: boolean
  displayCategory: string
  displayUnit: string
}

export type OrderGap = { description: string; qty: number }

const NAME_ALIASES = ['producto', 'nombre', 'articulo', 'descripcion', 'item']
const QTY_ALIASES = ['cantidad a la mano', 'existencia', 'cantidad', 'stock', 'cant', 'qty']
const EXTRA_COLUMNS = {
  cost: ['costo', 'costo unitario'],
  price: ['precio de venta', 'precio venta', 'precio'],
  unit: ['unidad', 'um'],
  category: ['categoria del producto', 'categoria', 'rubro'],
  sku: ['codigo', 'sku', 'clave'],
  detail: ['referencia interna', 'referencia'],
  image: ['imagen 128', 'imagen'],
  use: ['uso', 'destino', 'tipo'],
  expiresOn: ['vence', 'vencimiento', 'fecha de vencimiento'],
  minStock: ['minimo', 'stock minimo', 'existencia minima'],
} as const

/** Categorías del Excel de Odoo que no son inventario. */
const SKIP_CATEGORY = new Set(['services', 'expenses', 'deliveries'])

const CATEGORY_CANON: Record<string, string> = {
  accesorios: 'Accesorios',
  alimento: 'Alimento',
  consumible: 'Consumible',
  insumos: 'Consumible',
  'bano medicado': 'Baño medicado',
  vacunas: 'Vacunas',
  vacuna: 'Vacunas',
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_ROWS = 2000
const EMPTY_CATEGORY = 'Sin categoría'

export function fold(value: string) {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ')
}

export function cellValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'sí' : 'no'
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    const record = value as { result?: unknown; text?: unknown; richText?: { text?: string }[] }
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text ?? '').join('').trim()
    if ('result' in record) return cellValue(record.result)
    if (typeof record.text === 'string') return record.text.trim()
  }
  return ''
}

/** Vacío si la celda está en blanco. `invalid` si trae un texto que no es ventas ni servicio. */
export function parseUse(value: string): ProductUse | 'invalid' | undefined {
  const key = fold(value)
  if (!key) return undefined
  if (['venta', 'ventas', 'tienda', 'para venta'].includes(key)) return 'venta'
  if (['servicio', 'servicios', 'insumo', 'insumos', 'uso en servicio', 'grooming'].includes(key)) return 'insumo'
  return 'invalid'
}

export function matchProduct(products: CatalogItem[], row: { name: string; sku?: string }) {
  const sku = row.sku?.trim().toLowerCase()
  if (sku) {
    const bySku = products.find((item) => item.sku?.trim().toLowerCase() === sku)
    if (bySku) return bySku
  }
  const name = fold(row.name)
  if (!name) return undefined
  return products.find((item) => fold(item.name) === name)
}

function columnIndex(header: string[], aliases: readonly string[]) {
  for (const alias of aliases) {
    const index = header.findIndex((cell) => fold(cell ?? '') === alias)
    if (index >= 0) return index
  }
  return -1
}

function whole(value: string): number | null {
  if (!value.trim()) return null
  const amount = parseAmount(value)
  if (!Number.isFinite(amount) || amount < 0) return null
  const qty = Math.round(amount)
  if (Math.abs(amount - qty) > 0.001) return null
  return qty
}

function money(value: string): number | null | undefined {
  if (!value.trim()) return undefined
  const amount = parseAmount(value)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100) / 100
}

function dateValue(value: string): string | null | undefined {
  const text = value.trim()
  if (!text) return undefined
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text)
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : text
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return iso
}

function flag(row: ParsedRow, message: string) {
  if (!row.error) row.error = message
}

function productName(value: string) {
  const clean = value.trim()
  if (!clean) return ''
  const titled = formatName(clean)
  return titled === '—' ? clean : titled
}

function unitOf(value: string) {
  const key = fold(value)
  if (!key) return undefined
  if (['unidad', 'unidades', 'pza', 'pieza', 'piezas'].includes(key)) return 'pieza'
  return value.trim()
}

function categoryOf(value: string) {
  const key = fold(value)
  if (!key) return EMPTY_CATEGORY
  return CATEGORY_CANON[key] ?? value.trim()
}

function imageOf(value: string) {
  const text = value.trim()
  if (!text || text.length > 300_000) return undefined
  if (/^data:image\//i.test(text)) return text
  if (text.startsWith('/9j/')) return `data:image/jpeg;base64,${text}`
  if (text.startsWith('iVBOR')) return `data:image/png;base64,${text}`
  if (text.startsWith('UklGR')) return `data:image/webp;base64,${text}`
  if (text.startsWith('R0lGOD')) return `data:image/gif;base64,${text}`
  return undefined
}

/** Existencia negativa del Excel queda en cero: el inventario no guarda saldos bajo cero. */
function stockQty(value: string): { qty: number | null; negative?: string } {
  if (!value.trim()) return { qty: null }
  const amount = parseAmount(value)
  if (!Number.isFinite(amount)) return { qty: null }
  if (amount < 0) return { qty: 0, negative: value.trim() }
  const qty = Math.round(amount)
  if (Math.abs(amount - qty) > 0.001) return { qty: null }
  return { qty }
}

function separateRepeated(rows: ParsedRow[]) {
  const groups = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    if (!row.name || row.error) continue
    const key = fold(row.name)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const used = new Set<string>()
    list.forEach((row, index) => {
      const ref = row.detail?.trim()
      let name = row.name
      if (ref && fold(ref) !== fold(row.name)) name = `${row.name} · ${ref}`
      else if (index > 0) name = `${row.name} (${index + 1})`
      let unique = name
      let n = 2
      while (used.has(fold(unique))) {
        unique = `${name} (${n})`
        n += 1
      }
      used.add(fold(unique))
      if (fold(unique) === fold(row.name)) return
      const note = `Había otro «${row.name}». Se guarda como «${unique}».`
      row.warning = row.warning ? `${row.warning} ${note}` : note
      row.name = unique
    })
  }
}

export function parseInventoryMatrix(matrix: string[][]): { rows: ParsedRow[]; skipped: SkippedRow[]; error?: string } {
  const skipped: SkippedRow[] = []
  let headerAt = -1
  let nameCol = -1
  let qtyCol = -1
  const scan = Math.min(matrix.length, 15)
  for (let index = 0; index < scan; index += 1) {
    const header = matrix[index] ?? []
    nameCol = columnIndex(header, NAME_ALIASES)
    qtyCol = columnIndex(header, QTY_ALIASES)
    if (nameCol >= 0 && qtyCol >= 0) {
      headerAt = index
      break
    }
  }
  if (headerAt < 0) return { rows: [], skipped, error: 'El Excel necesita las columnas Producto y Existencia, o Nombre y Cantidad a la mano.' }

  const header = matrix[headerAt] ?? []
  const cols = {
    name: nameCol,
    qty: qtyCol,
    cost: columnIndex(header, EXTRA_COLUMNS.cost),
    price: columnIndex(header, EXTRA_COLUMNS.price),
    unit: columnIndex(header, EXTRA_COLUMNS.unit),
    category: columnIndex(header, EXTRA_COLUMNS.category),
    sku: columnIndex(header, EXTRA_COLUMNS.sku),
    detail: columnIndex(header, EXTRA_COLUMNS.detail),
    image: columnIndex(header, EXTRA_COLUMNS.image),
    use: columnIndex(header, EXTRA_COLUMNS.use),
    expiresOn: columnIndex(header, EXTRA_COLUMNS.expiresOn),
    minStock: columnIndex(header, EXTRA_COLUMNS.minStock),
  }
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? '').trim() : '')
  const rows: ParsedRow[] = []
  for (let index = headerAt + 1; index < matrix.length; index += 1) {
    const source = matrix[index] ?? []
    if (source.every((item) => !String(item ?? '').trim())) continue
    const rawCategory = cell(source, cols.category)
    if (cols.category >= 0 && SKIP_CATEGORY.has(fold(rawCategory))) {
      skipped.push({ line: index + 1, name: productName(cell(source, cols.name)) || `Fila ${index + 1}`, reason: 'En el Excel es un servicio, un gasto o un envío.' })
      continue
    }
    const name = productName(cell(source, cols.name))
    const qtyText = cell(source, cols.qty)
    const parsedUse = parseUse(cell(source, cols.use))
    const cost = money(cell(source, cols.cost))
    const price = money(cell(source, cols.price))
    const expires = dateValue(cell(source, cols.expiresOn))
    const minText = cell(source, cols.minStock)
    const minStock = minText ? whole(minText) : undefined
    const stock = stockQty(qtyText)
    const detail = cell(source, cols.detail)
    const image = imageOf(cell(source, cols.image))
    const row: ParsedRow = {
      line: index + 1,
      name,
      qty: stock.qty ?? 0,
      ...(parsedUse && parsedUse !== 'invalid' ? { use: parsedUse } : {}),
      sku: cell(source, cols.sku) || undefined,
      unit: unitOf(cell(source, cols.unit)),
      ...(cols.category >= 0 ? { category: categoryOf(rawCategory) } : {}),
      ...(detail ? { detail } : {}),
      ...(image ? { image } : {}),
      ...(typeof cost === 'number' ? { cost } : {}),
      ...(typeof price === 'number' ? { price } : {}),
      ...(expires ? { expiresOn: expires } : {}),
      ...(typeof minStock === 'number' ? { minStock } : {}),
    }
    if (stock.negative) row.warning = `La existencia venía en ${stock.negative}. Queda en 0.`
    if (!name) flag(row, `La fila ${row.line} no tiene producto.`)
    else if (stock.qty === null) flag(row, `La existencia de ${name} tiene que ser un número entero.`)
    else if (parsedUse === 'invalid') flag(row, `El uso de ${name} tiene que ser Ventas o Servicio.`)
    else if (cost === null) flag(row, `El costo de ${name} no es válido.`)
    else if (price === null) flag(row, `El precio de ${name} no es válido.`)
    else if (expires === null) flag(row, `La fecha de vencimiento de ${name} no es válida.`)
    else if (minText && minStock === null) flag(row, `El mínimo de ${name} tiene que ser un número entero.`)
    rows.push(row)
    if (rows.length > MAX_ROWS) return { rows: [], skipped, error: 'El archivo trae más de 2000 productos. Divídelo para subirlo.' }
  }
  if (rows.length === 0) return { rows: [], skipped, error: skipped.length ? 'El archivo solo trae servicios, gastos o envíos.' : 'El archivo no tiene productos.' }

  const skus = new Set<string>()
  for (const row of rows) {
    const sku = row.sku?.trim().toLowerCase()
    if (!sku) continue
    if (skus.has(sku)) flag(row, `El código ${row.sku} está repetido en el archivo.`)
    skus.add(sku)
  }
  separateRepeated(rows)
  return { rows, skipped }
}

function lineMatches(line: PurchaseLine, products: CatalogItem[], row: { name: string; productId?: string }) {
  if (row.productId && line.productId === row.productId) return true
  const names = new Set([fold(row.name)])
  if (row.productId) {
    const product = products.find((item) => item.id === row.productId)
    if (product) names.add(fold(product.name))
  }
  return Boolean(line.description.trim()) && names.has(fold(line.description))
}

function ordered(purchase: Purchase, products: CatalogItem[], row: { name: string; productId?: string }) {
  const lines = purchase.lines.filter((line) => lineMatches(line, products, row))
  if (lines.length === 0) return null
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

/** Cruza el archivo con el catálogo y, si hay pedido, con las líneas de esa compra. */
export function buildLoad(products: CatalogItem[], rows: ParsedRow[], purchase: Purchase | null): { rows: LoadRow[]; missing: OrderGap[] } {
  const catalog = shelfOf(products)
  const seen = new Map<string, string>()
  const load: LoadRow[] = rows.map((row) => {
    const product = row.name ? matchProduct(catalog, row) : undefined
    const fileCategory = row.category ? normalizeCategory(row.category) : undefined
    const identity = { name: row.name, productId: product?.id }
    const orderQty = purchase && row.name ? ordered(purchase, catalog, identity) : null
    let status: LoadStatus = 'sin-pedido'
    if (purchase) {
      if (orderQty === null) status = 'ajeno'
      else if (row.qty === orderQty) status = 'coincide'
      else status = row.qty > orderQty ? 'sobra' : 'falta'
    }
    const next: LoadRow = {
      ...row,
      use: row.use ?? product?.kind ?? 'venta',
      category: fileCategory,
      productId: product?.id,
      catalogName: product?.name,
      previousUse: product ? (product.kind ?? 'venta') : undefined,
      currentStock: product ? product.stock : null,
      orderQty,
      status,
      fresh: Boolean(row.name) && !product && !row.error,
      displayCategory: fileCategory ?? product?.category ?? '',
      displayUnit: row.unit || product?.unit || '',
    }
    if (next.productId && !next.error) {
      const previous = seen.get(next.productId)
      if (previous) flag(next, `${next.name} y ${previous} son el mismo producto.`)
      else seen.set(next.productId, next.catalogName ?? next.name)
    }
    return next
  })

  const missing: OrderGap[] = []
  if (purchase) {
    for (const line of purchase.lines) {
      const covered = load.some((row) => !row.error && lineMatches(line, catalog, { name: row.name, productId: row.productId }))
      if (!covered) missing.push({ description: line.description.trim() || 'Sin descripción', qty: line.qty })
    }
  }
  return { rows: load, missing }
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function columnLetters(letters: string) {
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function sharedStrings(xml: string) {
  const values: string[] = []
  for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const text = [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join('')
    values.push(text)
  }
  return values
}

function sheetMatrix(xml: string, strings: string[]) {
  const matrix: string[][] = []
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]
      const body = cell[2] ?? ''
      const letters = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const column = letters ? columnLetters(letters) : cells.length
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      let value = ''
      if (type === 's') {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
        value = strings[index] ?? ''
      } else if (type === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join('')
      } else if (type === 'b') {
        value = /<v>\s*1\s*<\/v>/.test(body) ? 'sí' : 'no'
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      }
      cells[column] = value
    }
    if (cells.some((item) => item?.trim())) matrix.push(cells.map((item) => item ?? ''))
  }
  return matrix
}

/** Lee la primera hoja sin pasar por el lector que se queda colgado con el Excel de Odoo en el navegador. */
export async function readInventorySheet(data: ArrayBuffer): Promise<{ rows: ParsedRow[]; skipped: SkippedRow[]; error?: string }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(data)
  const sheetName = Object.keys(zip.files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  const sheetFile = sheetName ? zip.file(sheetName) : null
  if (!sheetFile) return { rows: [], skipped: [], error: 'El archivo no tiene hojas.' }
  const sharedFile = zip.file('xl/sharedStrings.xml')
  const strings = sharedFile ? sharedStrings(await sharedFile.async('string')) : []
  return parseInventoryMatrix(sheetMatrix(await sheetFile.async('string'), strings))
}

export async function downloadInventoryTemplate() {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('Inventario')
  sheet.columns = [
    { header: 'Producto', width: 32 },
    { header: 'Existencia', width: 14 },
    { header: 'Costo', width: 12 },
    { header: 'Precio', width: 14 },
    { header: 'Unidad', width: 14 },
    { header: 'Categoría', width: 18 },
    { header: 'Código', width: 16 },
    { header: 'Uso', width: 14 },
    { header: 'Vence', width: 16 },
  ]
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123376' } }
  sheet.getColumn(2).numFmt = '0'
  sheet.getColumn(3).numFmt = '#,##0.00'
  sheet.getColumn(4).numFmt = '#,##0.00'
  sheet.getColumn(9).numFmt = 'yyyy-mm-dd'
  const withList = sheet as typeof sheet & { dataValidations?: { add: (range: string, rule: object) => void } }
  withList.dataValidations?.add('H2:H500', {
    type: 'list',
    allowBlank: true,
    formulae: ['"Ventas,Servicio"'],
    showErrorMessage: true,
    errorTitle: 'Uso',
    error: 'Elige Ventas o Servicio.',
  })
  const raw = await workbook.xlsx.writeBuffer()
  const blob = new Blob([raw], { type: MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'inventario-pups.xlsx'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
