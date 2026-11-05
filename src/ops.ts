import { addDays, isoDate, money, newId, normalizePhone } from './format'
import { applyShopOrder, shelfOf, type ShopLine } from './shop'
import type {
  Appointment,
  AppState,
  CashClose,
  CatalogItem,
  FixedCost,
  Lead,
  Movement,
  Payable,
  PayrollLine,
  PayrollRun,
  Purchase,
  PurchaseLine,
  Sale,
  StockKind,
  StockMove,
  Supplier,
  Task,
  TaskStatus,
  User,
} from './types'

export type Op<T> = { ok: true; patch: Partial<AppState>; value: T } | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })

export const round2 = (value: number) => Math.round(value * 100) / 100

export const EXPENSE_CATEGORIES = [
  'Alquiler',
  'Luz',
  'Agua',
  'Teléfono e internet',
  'Insumos de grooming',
  'Mantenimiento',
  'Publicidad',
  'Impuestos',
  'Pago de impuestos SAT',
  'Transporte',
  'Anticipo a empleado',
  'Prestaciones laborales',
  'Pago de préstamo',
  'Otros gastos',
] as const

/** Ingresos que no son venta: no generan IVA ni impuesto del pequeño contribuyente. */
export const INCOME_CATEGORIES = ['Servicio', 'Aporte de capital', 'Préstamo recibido', 'Otro ingreso no gravado'] as const

export const PENDING_ORDER = 'Por cobrar al entregar.'
export const AUTO_CHARGE = 'Cobro al completar la cita.'
export const IVA_RATE = 0.12

/** Régimen vigente en una fecha. Sin historial, el régimen elegido aplica a todo. */
export function regimeOn(settings: AppState['settings'], date: string) {
  const history = settings.taxHistory ?? []
  if (history.length === 0) return settings.taxRegime
  let regime: AppState['settings']['taxRegime']
  for (const item of [...history].sort((a, b) => a.from.localeCompare(b.from))) if (item.from <= date) regime = item.regime
  return regime
}

/** Cambia el régimen desde hoy y guarda el anterior para el historial. */
export function changeRegime(settings: AppState['settings'], regime: AppState['settings']['taxRegime'], today = isoDate()): AppState['settings'] {
  const history = settings.taxHistory?.length ? [...settings.taxHistory] : settings.taxRegime ? [{ from: '0000-01-01', regime: settings.taxRegime }] : []
  const kept = history.filter((item) => item.from < today)
  return { ...settings, taxRegime: regime, taxHistory: [...kept, { from: today, regime }] }
}

const sequence = (value: string) => Number(value.replace(/\D/g, '')) || 0

/** Siguiente ING o EG. Con el estado completo respeta los números ya usados aunque el movimiento se haya borrado. */
export function nextDocument(source: AppState | Movement[], type: Movement['type']) {
  const movements = Array.isArray(source) ? source : source.movements
  const prefix = type === 'egreso' ? 'EG' : 'ING'
  const floor = Array.isArray(source) ? 0 : source.counters?.[prefix] ?? 0
  const seq = movements
    .filter((item) => item.type === type)
    .reduce((max, item) => Math.max(max, sequence(item.document)), Math.max(floor, type === 'egreso' ? 12 : 100))
  return `${prefix}-${String(seq + 1).padStart(3, '0')}`
}

function nextSerial(items: { number: string }[], prefix: string, floor = 0) {
  const seq = items.reduce((max, item) => Math.max(max, sequence(item.number)), floor)
  return `${prefix}-${String(seq + 1).padStart(4, '0')}`
}

/** Guarda el número más alto de cada serie para que un documento anulado o borrado no se repita. */
export function withCounters(state: AppState): AppState {
  const counters = { ...(state.counters ?? {}) }
  const keep = (prefix: string, value: number) => {
    if (value > (counters[prefix] ?? 0)) counters[prefix] = value
  }
  for (const item of state.movements) keep(item.type === 'egreso' ? 'EG' : 'ING', sequence(item.document))
  for (const item of state.sales ?? []) keep('VEN', sequence(item.number))
  for (const item of state.purchases ?? []) keep('COM', sequence(item.number))
  for (const item of state.payables ?? []) keep('CXP', sequence(item.number))
  for (const item of state.appointments) keep('FOLIO', item.folio)
  const changed = Object.keys(counters).some((key) => counters[key] !== state.counters?.[key])
  return changed ? { ...state, counters } : state
}

export function nextFolio(state: AppState) {
  return Math.max(state.counters?.FOLIO ?? 0, state.appointments.reduce((max, item) => Math.max(max, item.folio), 900)) + 1
}

export function closedOn(state: AppState, date: string) {
  return (state.cashCloses ?? []).some((item) => item.date === date)
}

export type ChargeNote = { document: string; amount: number; created: boolean; removed?: boolean }

/**
 * Deja el ingreso de una cita al día con su estado: lo crea al completarla, lo ajusta si cambia el costo
 * y lo quita si deja de estar completada. Mover dinero pide permiso de caja y un día sin corte.
 */
export function chargeAppointment(state: AppState, appointment: Appointment, method: string | undefined, canCash: boolean): Op<ChargeNote | null> {
  const movements = state.movements
  const unchanged = { ok: true as const, value: null, patch: {} }
  if (method === 'Pedido') return fail('Elige cómo pagó el cliente.')
  const auto = movements.find((item) => item.type === 'ingreso' && item.folio === appointment.folio && item.notes === AUTO_CHARGE)
  const guard = (date: string) => {
    if (!canCash) return 'Cobrar o cambiar el cobro de una cita necesita permiso de caja.'
    if (closedOn(state, date)) return `La caja del ${date} ya se cerró. Ese cobro ya no se puede cambiar.`
    return null
  }
  if (appointment.status !== 'completada' || appointment.cost <= 0) {
    if (!auto) return unchanged
    const problem = guard(auto.date)
    if (problem) return fail(problem)
    return {
      ok: true,
      value: { document: auto.document, amount: auto.amount, created: false, removed: true },
      patch: { movements: movements.filter((item) => item.id !== auto.id) },
    }
  }
  const existing = movements.find((item) => item.type === 'ingreso' && item.folio === appointment.folio && !item.reverses)
  if (!existing) {
    const date = closedOn(state, appointment.date) ? isoDate() : appointment.date
    const problem = guard(date)
    if (problem) return fail(problem)
    const created: Movement = {
      id: newId(),
      type: 'ingreso',
      date,
      concept: `Servicio cita #${appointment.folio}`,
      amount: round2(appointment.cost),
      method: method ?? 'Efectivo',
      notes: AUTO_CHARGE,
      document: nextDocument(state, 'ingreso'),
      folio: appointment.folio,
    }
    return { ok: true, value: { document: created.document, amount: created.amount, created: true }, patch: { movements: [created, ...movements] } }
  }
  const nextMethod = method && existing.notes === AUTO_CHARGE ? method : existing.method
  if (existing.amount === appointment.cost && nextMethod === existing.method) return unchanged
  const problem = guard(existing.date)
  if (problem) return fail(problem)
  return {
    ok: true,
    value: { document: existing.document, amount: appointment.cost, created: false },
    patch: { movements: movements.map((item) => (item.id === existing.id ? { ...item, amount: round2(appointment.cost), method: nextMethod } : item)) },
  }
}

/** Mueve existencia sobre una copia del catálogo y devuelve el registro del kárdex. */
function shift(products: CatalogItem[], productId: string, qty: number, kind: StockKind, reference: string, note: string, date: string, unitCost?: number) {
  const item = products.find((product) => product.id === productId)
  if (!item) return null
  item.stock += qty
  const move: StockMove = {
    id: newId(),
    date,
    at: new Date().toISOString(),
    productId,
    qty,
    kind,
    reference,
    note,
    balance: item.stock,
    unitCost: unitCost ?? item.cost,
  }
  return move
}

function lineSummary(lines: { name: string; qty: number; price: number }[]) {
  return lines.map((line) => `· ${line.name} × ${line.qty} — ${money(line.price * line.qty)}`).join('\n')
}

export type SaleInput = {
  clientName: string
  phone: string
  lines: { productId?: string; name: string; qty: number; price: number }[]
  discount: number
  method: string
  date?: string
  userId?: string
}

export function recordSale(state: AppState, input: SaleInput): Op<Sale> {
  if (!input.method || input.method === 'Pedido') return fail('Elige cómo pagó el cliente.')
  const date = input.date || isoDate()
  if (closedOn(state, date)) return fail('La caja de ese día ya se cerró.')
  const wanted = input.lines
    .map((line) => ({ ...line, name: line.name.trim(), qty: Math.floor(line.qty), price: round2(line.price) }))
    .filter((line) => line.qty > 0)
  if (wanted.length === 0) return fail('Agrega al menos un producto o servicio.')
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  const number = nextSerial(state.sales ?? [], 'VEN', state.counters?.VEN)
  const moves: StockMove[] = []
  const lines: Sale['lines'] = []
  for (const line of wanted) {
    if (!Number.isFinite(line.price) || line.price < 0) return fail(`El precio de ${line.name || 'una línea'} no es válido.`)
    if (line.productId) {
      const item = products.find((product) => product.id === line.productId)
      if (!item) return fail('Un producto ya no está en el catálogo.')
      if (item.kind === 'insumo') return fail(`${item.name} es un insumo y no se vende.`)
      if (line.qty > item.stock) return fail(`Solo quedan ${item.stock} de ${item.name}.`)
      const move = shift(products, item.id, -line.qty, 'venta', number, input.clientName.trim() || 'Mostrador', date)
      if (move) moves.push(move)
      lines.push({ productId: item.id, name: item.name, qty: line.qty, price: line.price, cost: item.cost })
    } else {
      if (!line.name) return fail('Cada servicio necesita un nombre.')
      lines.push({ name: line.name, qty: line.qty, price: line.price })
    }
  }
  const subtotal = round2(lines.reduce((sum, line) => sum + line.qty * line.price, 0))
  const discount = round2(Math.max(0, input.discount || 0))
  if (discount > subtotal) return fail('El descuento es mayor que la venta.')
  const total = round2(subtotal - discount)
  if (total <= 0) return fail('La venta debe ser mayor a cero.')
  const client = input.clientName.trim()
  const sale: Sale = {
    id: newId(),
    number,
    date,
    at: new Date().toISOString(),
    channel: 'mostrador',
    clientName: client,
    phone: input.phone.trim() ? normalizePhone(input.phone) : '',
    lines,
    discount,
    total,
    method: input.method,
    status: 'pagada',
    document: nextDocument(state, 'ingreso'),
    userId: input.userId,
  }
  const movement: Movement = {
    id: newId(),
    type: 'ingreso',
    date,
    concept: client ? `Venta ${number} · ${client}` : `Venta ${number}`,
    amount: total,
    method: input.method,
    notes: [lineSummary(lines), discount ? `Descuento ${money(discount)}` : ''].filter(Boolean).join('\n'),
    document: sale.document,
    category: 'Venta de mostrador',
    saleId: sale.id,
  }
  return {
    ok: true,
    value: sale,
    patch: {
      products,
      sales: [sale, ...(state.sales ?? [])],
      stockMoves: [...moves, ...(state.stockMoves ?? [])],
      movements: [movement, ...state.movements],
    },
  }
}

export function placeOrder(state: AppState, input: { name: string; phone: string; lines: ShopLine[] }): Op<{ document: string; total: number }> {
  const client = input.name.trim()
  const phone = normalizePhone(input.phone)
  if (!client || !phone) return fail('Nombre y teléfono son obligatorios.')
  const catalog = shelfOf(state.products)
  if (input.lines.some((line) => catalog.find((item) => item.id === line.id)?.kind === 'insumo')) return fail('Un producto ya no está en la tienda.')
  const applied = applyShopOrder(catalog, input.lines)
  if (!applied.ok) return applied
  const date = isoDate()
  const number = nextSerial(state.sales ?? [], 'VEN', state.counters?.VEN)
  const document = nextDocument(state, 'ingreso')
  const lines: Sale['lines'] = []
  const moves: StockMove[] = []
  for (const line of input.lines) {
    const qty = Math.floor(line.qty)
    if (qty <= 0) continue
    const item = applied.products.find((product) => product.id === line.id)
    if (!item) continue
    lines.push({ productId: item.id, name: item.name, qty, price: item.price, cost: item.cost })
    moves.push({
      id: newId(),
      date,
      at: new Date().toISOString(),
      productId: item.id,
      qty: -qty,
      kind: 'pedido',
      reference: number,
      note: client,
      balance: item.stock,
      unitCost: item.cost,
    })
  }
  const summary = applied.sold.map((item) => `· ${item.name} × ${item.qty} — ${money(item.amount)}`).join('\n')
  const sale: Sale = {
    id: newId(),
    number,
    date,
    at: new Date().toISOString(),
    channel: 'tienda',
    clientName: client,
    phone,
    lines,
    discount: 0,
    total: round2(applied.total),
    method: 'Pedido',
    status: 'por cobrar',
    document,
  }
  const lead: Lead = {
    id: newId(),
    createdAt: new Date().toISOString(),
    name: client,
    phone,
    message: ['Pedido de tienda', summary, `Total ${money(round2(applied.total))}`].join('\n'),
  }
  const movement: Movement = {
    id: newId(),
    type: 'ingreso',
    date,
    concept: `Tienda · ${client}`,
    amount: round2(applied.total),
    method: 'Pedido',
    notes: `${PENDING_ORDER}\n${phone}\n${summary}`,
    document,
    category: 'Tienda en línea',
    saleId: sale.id,
  }
  return {
    ok: true,
    value: { document, total: round2(applied.total) },
    patch: {
      products: applied.products,
      sales: [sale, ...(state.sales ?? [])],
      stockMoves: [...moves, ...(state.stockMoves ?? [])],
      leads: [lead, ...state.leads],
      movements: [movement, ...state.movements],
    },
  }
}

/** Cobra un pedido de la tienda. El pedido entra a la contabilidad el día del cobro, nunca antes. */
export function settleOrder(state: AppState, movementId: string, method: string, date = isoDate()): Op<Movement> {
  const movement = state.movements.find((item) => item.id === movementId)
  if (!movement || movement.method !== 'Pedido' || movement.type !== 'ingreso') return fail('Ese pedido ya no está por cobrar.')
  if (!method || method === 'Pedido') return fail('Elige cómo pagó el cliente.')
  if (closedOn(state, date)) return fail('La caja de hoy ya se cerró.')
  const next: Movement = {
    ...movement,
    date,
    method,
    notes: movement.notes.replace(PENDING_ORDER, `Cobrado el ${date}.`),
  }
  return {
    ok: true,
    value: next,
    patch: {
      movements: state.movements.map((item) => (item.id === movementId ? next : item)),
      sales: (state.sales ?? []).map((item) => (item.id === movement.saleId ? { ...item, status: 'pagada' as const, method } : item)),
    },
  }
}

/**
 * Anula una venta. Si ya se cobró, deja un egreso de devolución con fecha de hoy y el mes original queda intacto.
 * Un pedido de la tienda que nunca se cobró simplemente se cancela.
 */
export function voidSale(state: AppState, saleId: string, reason: string, date = isoDate()): Op<Sale> {
  const sale = (state.sales ?? []).find((item) => item.id === saleId)
  if (!sale || sale.status === 'anulada') return fail('Esa venta ya no se puede anular.')
  if (!reason.trim()) return fail('Escribe el motivo de la anulación.')
  const movement = state.movements.find((item) => item.saleId === saleId && item.type === 'ingreso' && !item.reverses)
  const collected = Boolean(movement && movement.method !== 'Pedido')
  if (collected && closedOn(state, date)) return fail('La caja de hoy ya se cerró. La devolución se registra mañana.')
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  const moves: StockMove[] = []
  for (const line of sale.lines) {
    if (!line.productId) continue
    const move = shift(products, line.productId, line.qty, 'anulación', sale.number, reason.trim(), date)
    if (move) moves.push(move)
  }
  const next: Sale = { ...sale, status: 'anulada' }
  let movements = state.movements
  if (movement && !collected) movements = movements.filter((item) => item.id !== movement.id)
  if (movement && collected) {
    movements = [
      {
        id: newId(),
        type: 'egreso',
        date,
        concept: `Devolución ${sale.number}${sale.clientName ? ` · ${sale.clientName}` : ''}`,
        amount: movement.amount,
        method: movement.method,
        notes: reason.trim(),
        document: nextDocument(state, 'egreso'),
        category: 'Devolución de venta',
        saleId,
        reverses: movement.id,
      },
      ...movements,
    ]
  }
  return {
    ok: true,
    value: next,
    patch: {
      products,
      sales: (state.sales ?? []).map((item) => (item.id === saleId ? next : item)),
      stockMoves: [...moves, ...(state.stockMoves ?? [])],
      movements,
    },
  }
}

/** Alta o edición de un producto. La existencia solo se fija al darlo de alta; después se mueve con compras, ventas o ajustes. */
export function saveProduct(state: AppState, product: CatalogItem, canCost = true): Op<CatalogItem> {
  const name = product.name.trim()
  if (!name) return fail('El nombre es obligatorio.')
  if (!product.category) return fail('Elige una categoría.')
  if (!Number.isFinite(product.price) || product.price < 0) return fail('El precio no es válido.')
  if (!Number.isFinite(product.stock) || product.stock < 0) return fail('La existencia no es válida.')
  if (product.cost !== undefined && (!Number.isFinite(product.cost) || product.cost < 0)) return fail('El costo no es válido.')
  if (product.kind !== 'insumo' && !product.image.trim()) return fail('El producto necesita una foto.')
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  const previous = products.find((item) => item.id === product.id)
  if (previous && product.cost !== undefined && round2(product.cost) !== (previous.cost ?? undefined) && !canCost) {
    return fail('Cambiar el costo necesita permiso de compras.')
  }
  const next: CatalogItem = {
    ...product,
    id: product.id || newId(),
    name,
    detail: product.detail.trim(),
    unit: product.unit.trim() || 'pieza',
    price: round2(product.price),
    stock: previous ? previous.stock : 0,
    image: product.image.trim(),
    active: product.kind === 'insumo' ? false : product.active !== false,
    cost: product.cost !== undefined ? round2(product.cost) : previous?.cost,
    minStock: product.minStock !== undefined && Number.isFinite(product.minStock) ? Math.max(0, Math.floor(product.minStock)) : previous?.minStock,
    sku: product.sku?.trim() || undefined,
  }
  const index = products.findIndex((item) => item.id === next.id)
  if (index >= 0) products[index] = next
  else products.unshift(next)
  const moves: StockMove[] = []
  const initial = Math.floor(product.stock)
  if (!previous && initial > 0) {
    const move = shift(products, next.id, initial, 'inicial', 'Alta', 'Existencia inicial', isoDate())
    if (move) moves.push(move)
  }
  return {
    ok: true,
    value: products.find((item) => item.id === next.id) ?? next,
    patch: { products, stockMoves: [...moves, ...(state.stockMoves ?? [])] },
  }
}

export function adjustStock(state: AppState, input: { productId: string; qty: number; kind: 'ajuste' | 'consumo'; note: string }): Op<StockMove> {
  const qty = Math.trunc(input.qty)
  if (!qty) return fail('Indica una cantidad distinta de cero.')
  if (!input.note.trim()) return fail('Anota el motivo del movimiento.')
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  const item = products.find((product) => product.id === input.productId)
  if (!item) return fail('Producto no encontrado.')
  const signed = input.kind === 'consumo' ? -Math.abs(qty) : qty
  if (item.stock + signed < 0) return fail(`Solo hay ${item.stock} de ${item.name}.`)
  const move = shift(products, item.id, signed, input.kind, input.kind === 'consumo' ? 'Consumo' : 'Ajuste', input.note.trim(), isoDate())
  if (!move) return fail('Producto no encontrado.')
  return { ok: true, value: move, patch: { products, stockMoves: [move, ...(state.stockMoves ?? [])] } }
}

export function saveSupplier(state: AppState, supplier: Supplier): Op<Supplier> {
  const name = supplier.name.trim()
  if (!name) return fail('El nombre del proveedor es obligatorio.')
  const list = state.suppliers ?? []
  if (list.some((item) => item.id !== supplier.id && item.name.toLowerCase() === name.toLowerCase())) return fail('Ese proveedor ya existe.')
  const next: Supplier = {
    id: supplier.id || newId(),
    name,
    nit: supplier.nit.trim().toUpperCase(),
    phone: supplier.phone.trim() ? normalizePhone(supplier.phone) : '',
    email: supplier.email.trim(),
    contact: supplier.contact.trim(),
    notes: supplier.notes.trim(),
  }
  const exists = list.some((item) => item.id === next.id)
  return {
    ok: true,
    value: next,
    patch: { suppliers: exists ? list.map((item) => (item.id === next.id ? next : item)) : [next, ...list] },
  }
}

export type PurchaseInput = {
  date: string
  supplierId?: string
  invoice: string
  withTax: boolean
  lines: PurchaseLine[]
  terms: 'contado' | 'credito'
  method?: string
  dueDate?: string
  notes: string
}

export function recordPurchase(state: AppState, input: PurchaseInput): Op<Purchase> {
  const supplier = (state.suppliers ?? []).find((item) => item.id === input.supplierId)
  if (!supplier) return fail('Elige el proveedor.')
  const lines = input.lines
    .map((line) => ({ ...line, description: line.description.trim(), qty: Math.floor(line.qty), cost: round2(line.cost) }))
    .filter((line) => line.qty > 0)
  if (lines.length === 0) return fail('Agrega al menos una línea a la compra.')
  if (lines.some((line) => !Number.isFinite(line.cost) || line.cost < 0)) return fail('Revisa los costos de la compra.')
  if (lines.some((line) => !line.productId && !line.description)) return fail('Cada línea necesita producto o descripción.')
  if (input.terms === 'contado' && (!input.method || input.method === 'Pedido')) return fail('Elige cómo se pagó.')
  if (input.terms === 'contado' && closedOn(state, input.date)) return fail('La caja de ese día ya se cerró.')
  const total = round2(lines.reduce((sum, line) => sum + line.qty * line.cost, 0))
  if (total <= 0) return fail('La compra debe ser mayor a cero.')
  const credit = regimeOn(state.settings, input.date) === 'general' && input.withTax
  const number = nextSerial(state.purchases ?? [], 'COM', state.counters?.COM)
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  const moves: StockMove[] = []
  for (const line of lines) {
    if (!line.productId) continue
    const item = products.find((product) => product.id === line.productId)
    if (!item) return fail('Un producto de la compra ya no existe.')
    const unit = credit ? line.cost / (1 + IVA_RATE) : line.cost
    const before = Math.max(item.stock, 0)
    item.cost = round2(before + line.qty > 0 ? (before * (item.cost ?? unit) + line.qty * unit) / (before + line.qty) : unit)
    const move = shift(products, item.id, line.qty, 'compra', number, supplier.name, input.date, round2(unit))
    if (move) moves.push(move)
  }
  const purchase: Purchase = {
    id: newId(),
    number,
    date: input.date,
    supplierId: supplier.id,
    supplierName: supplier.name,
    invoice: input.invoice.trim(),
    withTax: credit,
    lines,
    total,
    terms: input.terms,
    notes: input.notes.trim(),
  }
  const patch: Partial<AppState> = {
    products,
    stockMoves: [...moves, ...(state.stockMoves ?? [])],
  }
  if (input.terms === 'contado') {
    const document = nextDocument(state, 'egreso')
    purchase.method = input.method
    purchase.document = document
    patch.movements = [
      {
        id: newId(),
        type: 'egreso',
        date: input.date,
        concept: `Compra ${number} · ${supplier.name}`,
        amount: total,
        method: input.method ?? 'Efectivo',
        notes: [purchase.invoice ? `Factura ${purchase.invoice}` : '', ...lines.map((line) => `· ${line.description} × ${line.qty}`)].filter(Boolean).join('\n'),
        document,
        category: 'Compras',
        purchaseId: purchase.id,
      },
      ...state.movements,
    ]
  } else {
    const payable: Payable = {
      id: newId(),
      number: nextSerial(state.payables ?? [], 'CXP', state.counters?.CXP),
      date: input.date,
      dueDate: input.dueDate || addDays(input.date, 30),
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoice: purchase.invoice,
      concept: `Compra ${number}`,
      category: 'Compras',
      amount: total,
      payments: [],
      purchaseId: purchase.id,
    }
    purchase.dueDate = payable.dueDate
    purchase.payableId = payable.id
    patch.payables = [payable, ...(state.payables ?? [])]
  }
  patch.purchases = [purchase, ...(state.purchases ?? [])]
  return { ok: true, value: purchase, patch }
}

export function payableBalance(payable: Payable) {
  return round2(payable.amount - payable.payments.reduce((sum, item) => sum + item.amount, 0))
}

export function savePayable(
  state: AppState,
  input: { date: string; dueDate: string; supplierId?: string; supplierName: string; invoice: string; concept: string; category: string; amount: number; withTax?: boolean },
): Op<Payable> {
  const amount = round2(input.amount)
  const supplier = (state.suppliers ?? []).find((item) => item.id === input.supplierId)
  const supplierName = supplier?.name ?? input.supplierName.trim()
  if (!supplierName) return fail('Indica a quién se le debe.')
  if (!input.concept.trim()) return fail('Escribe el concepto de la factura.')
  if (!Number.isFinite(amount) || amount <= 0) return fail('El monto debe ser mayor a cero.')
  if (!input.dueDate) return fail('Indica la fecha de vencimiento.')
  const payable: Payable = {
    id: newId(),
    number: nextSerial(state.payables ?? [], 'CXP', state.counters?.CXP),
    date: input.date,
    dueDate: input.dueDate,
    supplierId: supplier?.id,
    supplierName,
    invoice: input.invoice.trim(),
    concept: input.concept.trim(),
    category: input.category || 'Otros gastos',
    amount,
    payments: [],
    ...(input.withTax ? { withTax: true } : {}),
  }
  return { ok: true, value: payable, patch: { payables: [payable, ...(state.payables ?? [])] } }
}

export function payPayable(state: AppState, input: { payableId: string; amount: number; method: string; date: string }): Op<Movement> {
  const payable = (state.payables ?? []).find((item) => item.id === input.payableId)
  if (!payable) return fail('Factura no encontrada.')
  const balance = payableBalance(payable)
  const amount = round2(input.amount)
  if (balance <= 0) return fail('Esa factura ya está pagada.')
  if (!Number.isFinite(amount) || amount <= 0) return fail('El pago debe ser mayor a cero.')
  if (amount > balance) return fail(`El saldo es ${money(balance)}.`)
  if (!input.method || input.method === 'Pedido') return fail('Elige cómo se pagó.')
  if (closedOn(state, input.date)) return fail('La caja de ese día ya se cerró.')
  const document = nextDocument(state, 'egreso')
  const movement: Movement = {
    id: newId(),
    type: 'egreso',
    date: input.date,
    concept: `Pago ${payable.number} · ${payable.supplierName}`,
    amount,
    method: input.method,
    notes: [payable.concept, payable.invoice ? `Factura ${payable.invoice}` : '', amount < balance ? `Abono. Saldo ${money(balance - amount)}` : 'Liquida la factura.'].filter(Boolean).join('\n'),
    document,
    category: payable.category,
    payableId: payable.id,
  }
  const next: Payable = { ...payable, payments: [...payable.payments, { id: newId(), date: input.date, amount, method: input.method, document }] }
  return {
    ok: true,
    value: movement,
    patch: {
      movements: [movement, ...state.movements],
      payables: (state.payables ?? []).map((item) => (item.id === payable.id ? next : item)),
    },
  }
}

export function saveFixedCost(state: AppState, item: FixedCost): Op<FixedCost> {
  const name = item.name.trim()
  const amount = round2(item.amount)
  if (!name) return fail('Escribe el nombre del gasto fijo.')
  if (!Number.isFinite(amount) || amount <= 0) return fail('El monto debe ser mayor a cero.')
  const day = Math.min(28, Math.max(1, Math.floor(item.day) || 1))
  const next: FixedCost = { ...item, id: item.id || newId(), name, amount, day, category: item.category || 'Otros gastos' }
  const list = state.fixedCosts ?? []
  const exists = list.some((entry) => entry.id === next.id)
  return { ok: true, value: next, patch: { fixedCosts: exists ? list.map((entry) => (entry.id === next.id ? next : entry)) : [...list, next] } }
}

export function payFixedCost(state: AppState, input: { fixedId: string; period: string; amount: number; method: string; date: string; withTax?: boolean }): Op<Movement> {
  const fixed = (state.fixedCosts ?? []).find((item) => item.id === input.fixedId)
  if (!fixed) return fail('Gasto fijo no encontrado.')
  if (state.movements.some((item) => item.fixedId === fixed.id && item.period === input.period)) return fail(`${fixed.name} ya se pagó ese mes.`)
  const amount = round2(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('El monto debe ser mayor a cero.')
  if (!input.method || input.method === 'Pedido') return fail('Elige cómo se pagó.')
  if (closedOn(state, input.date)) return fail('La caja de ese día ya se cerró.')
  const movement: Movement = {
    id: newId(),
    type: 'egreso',
    date: input.date,
    concept: `${fixed.name} · ${input.period}`,
    amount,
    method: input.method,
    notes: 'Gasto fijo del mes.',
    document: nextDocument(state, 'egreso'),
    category: fixed.category,
    fixedId: fixed.id,
    period: input.period,
    ...(input.withTax ?? fixed.withTax ? { withTax: true } : {}),
  }
  return { ok: true, value: movement, patch: { movements: [movement, ...state.movements] } }
}

export function updateWorker(state: AppState, id: string, patch: Pick<User, 'commissionRate' | 'bonus' | 'hiredAt' | 'salary'>): Op<User> {
  const target = state.users.find((item) => item.id === id)
  if (!target) return fail('Trabajador no encontrado.')
  for (const value of [patch.commissionRate, patch.bonus, patch.salary]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return fail('Revisa los montos del trabajador.')
  }
  if (patch.commissionRate !== undefined && patch.commissionRate > 100) return fail('La comisión no puede pasar de 100 %.')
  const next: User = { ...target, ...patch, hiredAt: patch.hiredAt || undefined }
  return { ok: true, value: next, patch: { users: state.users.map((item) => (item.id === id ? next : item)) } }
}

export function payPayroll(state: AppState, input: { period: string; lines: PayrollLine[]; method: string; date: string }): Op<PayrollRun> {
  if ((state.payrolls ?? []).some((item) => item.period === input.period)) return fail('La planilla de ese mes ya se pagó.')
  const lines = input.lines.filter((line) => line.net > 0 || line.salary > 0)
  if (lines.length === 0) return fail('No hay trabajadores con salario para este mes.')
  const negative = lines.find((line) => line.net < 0)
  if (negative) return fail(`El líquido de ${negative.name} queda negativo. Revisa sus descuentos.`)
  if (!input.method || input.method === 'Pedido') return fail('Elige cómo se pagó.')
  if (closedOn(state, input.date)) return fail('La caja de ese día ya se cerró.')
  const net = round2(lines.reduce((sum, line) => sum + line.net, 0))
  const igss = round2(lines.reduce((sum, line) => sum + line.igss + line.employerIgss, 0))
  const run: PayrollRun = {
    id: newId(),
    period: input.period,
    paidAt: input.date,
    method: input.method,
    document: nextDocument(state, 'egreso'),
    lines,
  }
  const movement: Movement = {
    id: newId(),
    type: 'egreso',
    date: input.date,
    concept: `Planilla ${input.period}`,
    amount: net,
    method: input.method,
    notes: lines.map((line) => `· ${line.name}: ${money(line.net)}`).join('\n'),
    document: run.document,
    category: 'Planilla',
    payrollId: run.id,
  }
  const patch: Partial<AppState> = { movements: [movement, ...state.movements] }
  if (igss > 0) {
    const [year, month] = input.period.split('-').map(Number)
    const due = isoDate(new Date(year, month, 20))
    const payable: Payable = {
      id: newId(),
      number: nextSerial(state.payables ?? [], 'CXP', state.counters?.CXP),
      date: input.date,
      dueDate: due,
      supplierName: 'IGSS',
      invoice: '',
      concept: `Cuotas IGSS laboral y patronal · ${input.period}`,
      category: 'IGSS',
      amount: igss,
      payments: [],
      payrollId: run.id,
    }
    run.payableId = payable.id
    patch.payables = [payable, ...(state.payables ?? [])]
  }
  patch.payrolls = [run, ...(state.payrolls ?? [])]
  return { ok: true, value: run, patch }
}

export function voidPayroll(state: AppState, id: string): Op<null> {
  const run = (state.payrolls ?? []).find((item) => item.id === id)
  if (!run) return fail('Planilla no encontrada.')
  const payable = (state.payables ?? []).find((item) => item.id === run.payableId)
  if (payable && payable.payments.length > 0) return fail('Las cuotas del IGSS de esa planilla ya tienen pagos.')
  const movement = state.movements.find((item) => item.payrollId === id)
  if (movement && closedOn(state, movement.date)) return fail('La caja de ese día ya se cerró.')
  return {
    ok: true,
    value: null,
    patch: {
      payrolls: (state.payrolls ?? []).filter((item) => item.id !== id),
      movements: state.movements.filter((item) => item.payrollId !== id),
      payables: (state.payables ?? []).filter((item) => item.id !== run.payableId),
    },
  }
}

export function saveTask(state: AppState, task: Omit<Task, 'createdAt'> & { createdAt?: string }, userId?: string): Op<Task> {
  const title = task.title.trim()
  if (!title) return fail('Escribe la tarea.')
  const list = state.tasks ?? []
  const previous = list.find((item) => item.id === task.id)
  const next: Task = {
    ...task,
    id: task.id || newId(),
    title,
    detail: task.detail.trim(),
    assigneeId: task.assigneeId || undefined,
    dueDate: task.dueDate || undefined,
    createdBy: previous?.createdBy ?? userId,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  }
  return { ok: true, value: next, patch: { tasks: previous ? list.map((item) => (item.id === next.id ? next : item)) : [next, ...list] } }
}

export function setTaskStatus(state: AppState, id: string, status: TaskStatus): Op<Task> {
  const task = (state.tasks ?? []).find((item) => item.id === id)
  if (!task) return fail('Tarea no encontrada.')
  const next: Task = { ...task, status, doneAt: status === 'hecha' ? new Date().toISOString() : undefined }
  return { ok: true, value: next, patch: { tasks: (state.tasks ?? []).map((item) => (item.id === id ? next : item)) } }
}

export function removeTask(state: AppState, id: string): Op<null> {
  if (!(state.tasks ?? []).some((item) => item.id === id)) return fail('Tarea no encontrada.')
  return { ok: true, value: null, patch: { tasks: (state.tasks ?? []).filter((item) => item.id !== id) } }
}

export type CashSummary = {
  date: string
  opening: number
  byMethod: Record<string, number>
  income: number
  expense: number
  cashIn: number
  cashOut: number
  expected: number
  pending: number
  movements: Movement[]
}

export function cashSummary(movements: Movement[], date: string, opening: number): CashSummary {
  const today = movements.filter((item) => item.date === date)
  const byMethod: Record<string, number> = {}
  let income = 0
  let expense = 0
  let cashIn = 0
  let cashOut = 0
  let pending = 0
  for (const item of today) {
    if (item.method === 'Pedido') {
      if (item.type === 'ingreso') pending += item.amount
      continue
    }
    const signed = item.type === 'ingreso' ? item.amount : -item.amount
    byMethod[item.method] = round2((byMethod[item.method] ?? 0) + signed)
    if (item.type === 'ingreso') income += item.amount
    else expense += item.amount
    if (item.method === 'Efectivo') {
      if (item.type === 'ingreso') cashIn += item.amount
      else cashOut += item.amount
    }
  }
  return {
    date,
    opening: round2(opening),
    byMethod,
    income: round2(income),
    expense: round2(expense),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    expected: round2(opening + cashIn - cashOut),
    pending: round2(pending),
    movements: today,
  }
}

export function closeCash(state: AppState, input: { date: string; opening: number; counted: number; note: string; userId?: string }): Op<CashClose> {
  if (closedOn(state, input.date)) return fail('Ese día ya tiene corte.')
  if (!Number.isFinite(input.opening) || input.opening < 0) return fail('El fondo de caja no es válido.')
  if (!Number.isFinite(input.counted) || input.counted < 0) return fail('Escribe el efectivo contado.')
  const summary = cashSummary(state.movements, input.date, input.opening)
  const difference = round2(input.counted - summary.expected)
  if (difference !== 0 && !input.note.trim()) return fail('Hay diferencia: anota el motivo antes de cerrar.')
  const close: CashClose = {
    id: newId(),
    date: input.date,
    opening: summary.opening,
    cashIn: summary.cashIn,
    cashOut: summary.cashOut,
    expected: summary.expected,
    counted: round2(input.counted),
    difference,
    byMethod: summary.byMethod,
    closedBy: input.userId,
    closedAt: new Date().toISOString(),
    note: input.note.trim(),
  }
  return {
    ok: true,
    value: close,
    patch: {
      cashCloses: [close, ...(state.cashCloses ?? [])],
      settings: { ...state.settings, cashFloat: summary.opening },
    },
  }
}
