import { addDays, isoDate, money, newId, normalizePhone } from './format'
import { applyShopOrder, shelfOf, type ShopLine } from './shop'
import type {
  Appointment,
  AppState,
  Attendance,
  CashClose,
  CashDeposit,
  CashSplit,
  CatalogItem,
  ExpenseArea,
  FixedCost,
  Lead,
  Movement,
  Payable,
  PayrollLine,
  PayrollRun,
  ProductUse,
  Purchase,
  PurchaseLine,
  Sale,
  ShopCategoryName,
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

/** Servicios básicos que se pagan cada mes. */
export const UTILITIES = ['Internet', 'Agua', 'Luz', 'Teléfono móvil'] as const

export const EXPENSE_CATEGORIES = [
  'Alquiler',
  ...UTILITIES,
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

export const PETTY_CASH = 'Caja chica'
/** Pasa dinero de la caja o del banco a la caja chica. No es gasto: el gasto se registra cuando sale de la caja chica. */
export const PETTY_REFILL = 'Reposición de caja chica'

export const EXPENSE_AREAS: { id: ExpenseArea; label: string }[] = [
  { id: 'administrativo', label: 'Administrativos' },
  { id: 'venta', label: 'Venta' },
  { id: 'servicio', label: 'Servicio' },
]

/** Rubro sugerido para una categoría; quien registra el gasto puede cambiarlo. */
export function defaultArea(category: string): ExpenseArea {
  if (category === 'Insumos de grooming') return 'servicio'
  if (category === 'Publicidad' || category === 'Transporte') return 'venta'
  return 'administrativo'
}

export function areaLabel(area?: ExpenseArea) {
  return EXPENSE_AREAS.find((item) => item.id === area)?.label ?? 'Sin rubro'
}

/** Lo que queda en la caja chica: reposiciones menos lo que se pagó con ella. */
export function pettyBalance(movements: Movement[]) {
  let balance = 0
  for (const item of movements) {
    if (item.type !== 'egreso') continue
    if (item.category === PETTY_REFILL) balance += item.amount
    else if (item.method === PETTY_CASH) balance -= item.amount
  }
  return round2(balance)
}

/** Un gasto con caja chica no puede pasar de lo que hay en ella. */
export function pettyShort(movements: Movement[], method: string, amount: number) {
  if (method !== PETTY_CASH) return null
  const balance = pettyBalance(movements)
  return amount > balance ? `La caja chica solo tiene ${money(balance)}. Repónla antes de registrar este gasto.` : null
}

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

/**
 * Cambia el régimen desde el primer día del mes en curso, porque el impuesto se liquida por mes completo.
 * El primer régimen que se elige aplica a todo lo anterior.
 */
export function changeRegime(settings: AppState['settings'], regime: AppState['settings']['taxRegime'], today = isoDate()): AppState['settings'] {
  const history = settings.taxHistory?.length ? [...settings.taxHistory] : settings.taxRegime ? [{ from: '0000-01-01', regime: settings.taxRegime }] : []
  const start = history.some((item) => item.regime) ? `${today.slice(0, 7)}-01` : '0000-01-01'
  const kept = history.filter((item) => item.from < start)
  return { ...settings, taxRegime: regime, taxHistory: [...kept, { from: start, regime }] }
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

export function closedOn(state: Pick<AppState, 'cashCloses'>, date: string) {
  return (state.cashCloses ?? []).some((item) => (item.from ?? item.date) <= date && date <= item.date)
}

export type ChargeNote = { document: string; amount: number; created: boolean; removed?: boolean }

/**
 * Deja el ingreso de una cita al día con su estado: lo crea al completarla, lo ajusta si cambia el costo
 * y lo quita si deja de estar completada. Mover dinero pide permiso de caja y un día sin corte.
 */
export function chargeAppointment(
  state: AppState,
  appointment: Appointment,
  method: string | undefined,
  canCash: boolean,
  invoiced = false,
): Op<ChargeNote | null> {
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
      invoiced,
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
  const costBefore = item.cost
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
    ...(costBefore !== undefined ? { costBefore } : {}),
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
  invoiced?: boolean
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
    invoiced: Boolean(input.invoiced),
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
    invoiced: sale.invoiced,
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
export function settleOrder(state: AppState, movementId: string, method: string, date = isoDate(), invoiced = false): Op<Movement> {
  const movement = state.movements.find((item) => item.id === movementId)
  if (!movement || movement.method !== 'Pedido' || movement.type !== 'ingreso') return fail('Ese pedido ya no está por cobrar.')
  if (!method || method === 'Pedido') return fail('Elige cómo pagó el cliente.')
  if (closedOn(state, date)) return fail('La caja de hoy ya se cerró.')
  const next: Movement = {
    ...movement,
    date,
    method,
    notes: movement.notes.replace(PENDING_ORDER, `Cobrado el ${date}.`),
    invoiced,
  }
  return {
    ok: true,
    value: next,
    patch: {
      movements: state.movements.map((item) => (item.id === movementId ? next : item)),
      sales: (state.sales ?? []).map((item) => (item.id === movement.saleId ? { ...item, status: 'pagada' as const, method, invoiced } : item)),
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
    const item = products.find((product) => product.id === line.productId)
    const before = Math.max(item?.stock ?? 0, 0)
    const move = shift(products, line.productId, line.qty, 'anulación', sale.number, reason.trim(), date, line.cost)
    if (item && line.cost !== undefined) {
      const cost = line.cost
      item.cost = round2(before + line.qty > 0 ? (before * (item.cost ?? cost) + line.qty * cost) / (before + line.qty) : cost)
    }
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
        invoiced: movement.invoiced,
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

/** Producto que se da de alta desde la compra. */
export type NewProduct = { kind: ProductUse; unit: string; price: number; category: ShopCategoryName }

export type PurchaseInput = {
  date: string
  supplierId?: string
  invoice: string
  withTax: boolean
  lines: (PurchaseLine & { create?: NewProduct })[]
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
  const short = input.terms === 'contado' ? pettyShort(state.movements, input.method ?? '', total) : null
  if (short) return fail(short)
  const credit = regimeOn(state.settings, input.date) === 'general' && input.withTax
  const number = nextSerial(state.purchases ?? [], 'COM', state.counters?.COM)
  const products = shelfOf(state.products).map((item) => ({ ...item }))
  for (const line of lines) {
    if (!line.create) continue
    const name = line.description
    if (products.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) return fail(`${name} ya existe: elígelo de la lista.`)
    const price = round2(line.create.price)
    if (line.create.kind === 'venta' && (!Number.isFinite(price) || price < 0)) return fail(`Revisa el precio de venta de ${name}.`)
    const item: CatalogItem = {
      id: newId(),
      name,
      detail: '',
      category: line.create.kind === 'insumo' ? 'Insumos' : line.create.category,
      price: line.create.kind === 'insumo' ? 0 : price,
      unit: line.create.unit.trim() || 'pieza',
      stock: 0,
      image: '',
      // Sin foto no se publica; se muestra en la tienda cuando le pongan foto.
      active: false,
      kind: line.create.kind,
    }
    products.unshift(item)
    line.productId = item.id
  }
  for (const line of lines) {
    delete line.create
    if (line.productId) line.use = products.find((item) => item.id === line.productId)?.kind ?? 'venta'
  }
  const moves: StockMove[] = []
  for (const line of lines) {
    if (!line.productId) continue
    const item = products.find((product) => product.id === line.productId)
    if (!item) return fail('Un producto de la compra ya no existe.')
    const unit = credit ? line.cost / (1 + IVA_RATE) : line.cost
    const before = Math.max(item.stock, 0)
    const cost = round2(before + line.qty > 0 ? (before * (item.cost ?? unit) + line.qty * unit) / (before + line.qty) : unit)
    const move = shift(products, item.id, line.qty, 'compra', number, supplier.name, input.date, round2(unit))
    item.cost = cost
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

export type PurchaseSplit = { venta: number; insumo: number; gasto: number }

/** Lo comprado para vender, lo que se usa en los servicios y lo que no entra a inventario. Compras viejas toman el tipo actual del producto. */
export function purchaseSplit(purchases: Purchase[], products?: CatalogItem[]): PurchaseSplit {
  const kinds = new Map(shelfOf(products).map((item) => [item.id, item.kind ?? 'venta']))
  const split: PurchaseSplit = { venta: 0, insumo: 0, gasto: 0 }
  for (const purchase of purchases) {
    for (const line of purchase.lines) {
      const use = line.productId ? (line.use ?? kinds.get(line.productId) ?? 'venta') : 'gasto'
      split[use] = round2(split[use] + line.qty * line.cost)
    }
  }
  return split
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
  const short = pettyShort(state.movements, input.method, amount)
  if (short) return fail(short)
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
  const short = pettyShort(state.movements, input.method, amount)
  if (short) return fail(short)
  const movement: Movement = {
    id: newId(),
    type: 'egreso',
    date: input.date,
    concept: `${fixed.name} · ${input.period}`,
    area: fixed.area ?? defaultArea(fixed.category),
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

export type WorkerPatch = Pick<User, 'commissionRate' | 'bonus' | 'hiredAt' | 'salary' | 'salesGoal' | 'servicesGoal'>

export function updateWorker(state: AppState, id: string, patch: WorkerPatch): Op<User> {
  const target = state.users.find((item) => item.id === id)
  if (!target) return fail('Trabajador no encontrado.')
  for (const value of [patch.commissionRate, patch.bonus, patch.salary, patch.salesGoal, patch.servicesGoal]) {
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
  from: string
  opening: number
  byMethod: Record<string, number>
  income: number
  expense: number
  cashIn: number
  cashOut: number
  deposited: number
  expected: number
  pending: number
  split: CashSplit
  movements: Movement[]
}

/** Cobros de venta o de servicio, separados por factura. Las devoluciones restan; aportes y préstamos no entran. */
export function cashSplit(movements: Movement[]): CashSplit {
  const split: CashSplit = { facturado: { ventas: 0, servicios: 0 }, sinFactura: { ventas: 0, servicios: 0 } }
  for (const item of movements) {
    if (item.method === 'Pedido') continue
    const refund = item.type === 'egreso' && Boolean(item.reverses && item.saleId)
    if (item.type === 'egreso' && !refund) continue
    const kind = item.saleId ? 'ventas' : item.folio != null || !item.category || item.category === 'Servicio' ? 'servicios' : null
    if (!kind) continue
    const bucket = split[item.invoiced ? 'facturado' : 'sinFactura']
    bucket[kind] = round2(bucket[kind] + (refund ? -item.amount : item.amount))
  }
  return split
}

/** Corte anterior al día, el primer día que cubre el siguiente y con cuánto efectivo arranca. */
export function cashPeriod(state: Pick<AppState, 'cashCloses' | 'settings'>, date: string) {
  const previous = (state.cashCloses ?? []).filter((item) => item.date < date).sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    previous,
    from: previous ? addDays(previous.date, 1) : date,
    opening: previous ? previous.counted : (state.settings.cashFloat ?? 0),
  }
}

/**
 * Resumen de caja de `from` a `date`. El efectivo se acumula de un corte al siguiente
 * y solo baja con gastos en efectivo o depósitos al banco.
 */
export function cashSummary(
  movements: Movement[],
  date: string,
  opening: number,
  options: { from?: string; deposits?: CashDeposit[] } = {},
): CashSummary {
  const from = options.from && options.from < date ? options.from : date
  const inRange = (day: string) => from <= day && day <= date
  const today = movements.filter((item) => inRange(item.date))
  const deposited = round2((options.deposits ?? []).filter((item) => inRange(item.date)).reduce((sum, item) => sum + item.amount, 0))
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
    if (item.method === PETTY_CASH) continue
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
    from,
    opening: round2(opening),
    byMethod,
    income: round2(income),
    expense: round2(expense),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    deposited,
    expected: round2(opening + cashIn - cashOut - deposited),
    pending: round2(pending),
    split: cashSplit(today),
    movements: today,
  }
}

/** Cierra de un golpe todos los días desde el corte anterior; arranca con el efectivo que ese corte contó. */
export function closeCash(state: AppState, input: { date: string; opening: number; counted: number; note: string; userId?: string }): Op<CashClose> {
  if (closedOn(state, input.date)) return fail('Ese día ya tiene corte.')
  if (input.date > isoDate()) return fail('No se puede cerrar un día que todavía no llega.')
  const period = cashPeriod(state, input.date)
  const opening = period.previous ? period.opening : input.opening
  if (!Number.isFinite(opening) || opening < 0) return fail('El fondo de caja no es válido.')
  if (!Number.isFinite(input.counted) || input.counted < 0) return fail('Escribe el efectivo contado.')
  const summary = cashSummary(state.movements, input.date, opening, { from: period.from, deposits: state.deposits })
  const difference = round2(input.counted - summary.expected)
  if (difference !== 0 && !input.note.trim()) return fail('Hay diferencia: anota el motivo antes de cerrar.')
  const close: CashClose = {
    id: newId(),
    date: input.date,
    ...(summary.from !== input.date ? { from: summary.from } : {}),
    opening: summary.opening,
    cashIn: summary.cashIn,
    cashOut: summary.cashOut,
    deposited: summary.deposited,
    expected: summary.expected,
    counted: round2(input.counted),
    difference,
    byMethod: summary.byMethod,
    split: summary.split,
    closedBy: input.userId,
    closedAt: new Date().toISOString(),
    note: input.note.trim(),
  }
  return {
    ok: true,
    value: close,
    patch: {
      cashCloses: [close, ...(state.cashCloses ?? [])],
      ...(period.previous ? {} : { settings: { ...state.settings, cashFloat: summary.opening } }),
    },
  }
}

/** Efectivo en caja hoy: lo que contó el último corte más lo que entró y salió después. */
export function cashOnHand(state: AppState, today = isoDate()) {
  const period = cashPeriod(state, addDays(today, 1))
  if (period.previous?.date === today) return period.previous.counted
  return cashSummary(state.movements, today, period.opening, { from: period.from, deposits: state.deposits }).expected
}

/** Cobrado desde el día siguiente al último depósito, para saber qué cubre el próximo. */
export function sinceDeposit(state: AppState, today = isoDate()) {
  const last = [...(state.deposits ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]
  const first = state.movements.reduce((min, item) => (item.date < min ? item.date : min), today)
  const from = last ? addDays(last.date, 1) : first
  const movements = state.movements.filter((item) => from <= item.date && item.date <= today)
  return { last, from, split: cashSplit(movements) }
}

export function recordDeposit(state: AppState, input: { date: string; amount: number; bank: string; reference: string; note: string; userId?: string }): Op<CashDeposit> {
  const amount = round2(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('Escribe el monto depositado.')
  if (!input.date || input.date > isoDate()) return fail('Elige la fecha del depósito.')
  if (closedOn(state, input.date)) return fail('La caja de ese día ya se cerró. Registra el depósito con la fecha de hoy.')
  if (!input.reference.trim()) return fail('Anota el número de boleta para ubicar el depósito.')
  const deposit: CashDeposit = {
    id: newId(),
    date: input.date,
    amount,
    bank: input.bank.trim(),
    reference: input.reference.trim(),
    note: input.note.trim(),
    userId: input.userId,
    at: new Date().toISOString(),
  }
  return { ok: true, value: deposit, patch: { deposits: [deposit, ...(state.deposits ?? [])] } }
}

export function removeDeposit(state: AppState, id: string): Op<null> {
  const deposit = (state.deposits ?? []).find((item) => item.id === id)
  if (!deposit) return fail('Ese depósito ya no existe.')
  if (closedOn(state, deposit.date)) return fail('Ese depósito ya entró en un corte y no se puede quitar.')
  return { ok: true, value: null, patch: { deposits: (state.deposits ?? []).filter((item) => item.id !== id) } }
}

/** Forma de pago de una compra de trabajador que se cobra en la siguiente planilla. */
export const PAYROLL_DEDUCTION = 'Descuento en planilla'

export function fullName(user: Pick<User, 'name' | 'lastName'>) {
  return [user.name, user.lastName].filter(Boolean).join(' ')
}

/** Compras con descuento en planilla que todavía no se han descontado. */
export function employeeOwed(state: Pick<AppState, 'sales' | 'payrolls'>, userId: string) {
  const bought = (state.sales ?? [])
    .filter((item) => item.employeeId === userId && item.method === PAYROLL_DEDUCTION && item.status !== 'anulada')
    .reduce((sum, item) => sum + item.total, 0)
  const paid = (state.payrolls ?? []).flatMap((run) => run.lines).filter((line) => line.userId === userId).reduce((sum, line) => sum + (line.purchases ?? 0), 0)
  return round2(Math.max(0, bought - paid))
}

export function recordEmployeePurchase(state: AppState, input: Omit<SaleInput, 'clientName' | 'phone' | 'invoiced'> & { employeeId: string }): Op<Sale> {
  const worker = state.users.find((item) => item.id === input.employeeId && item.active)
  if (!worker) return fail('Elige al trabajador.')
  if (input.lines.some((line) => !line.productId)) return fail('Las compras de trabajadores son solo de productos de la tienda.')
  const result = recordSale(state, { ...input, clientName: fullName(worker), phone: worker.phone ?? '', invoiced: false })
  if (!result.ok) return result
  const sale: Sale = { ...result.value, employeeId: worker.id }
  return {
    ok: true,
    value: sale,
    patch: {
      ...result.patch,
      sales: (result.patch.sales ?? []).map((item) => (item.id === sale.id ? sale : item)),
      movements: (result.patch.movements ?? []).map((item) => (item.saleId === sale.id ? { ...item, concept: `Compra de trabajador ${sale.number} · ${sale.clientName}` } : item)),
    },
  }
}

/** Registro abierto de hoy: marcó entrada y todavía no la salida. */
export function openShift(records: Attendance[] | undefined, userId: string, date = isoDate()) {
  return (records ?? []).find((item) => item.userId === userId && item.date === date && !item.outAt)
}

export function clockIn(state: AppState, userId: string, now = new Date()): Op<Attendance> {
  if (!state.users.some((item) => item.id === userId && item.active)) return fail('Tu usuario no está activo.')
  const date = isoDate(now)
  if (openShift(state.attendance, userId, date)) return fail('Ya marcaste tu entrada. Marca la salida cuando termines.')
  const record: Attendance = { id: newId(), userId, date, inAt: now.toISOString() }
  return { ok: true, value: record, patch: { attendance: [record, ...(state.attendance ?? [])] } }
}

export function clockOut(state: AppState, userId: string, now = new Date()): Op<Attendance> {
  const open = openShift(state.attendance, userId, isoDate(now))
  if (!open) return fail('Primero marca tu entrada.')
  const record: Attendance = { ...open, outAt: now.toISOString() }
  return { ok: true, value: record, patch: { attendance: (state.attendance ?? []).map((item) => (item.id === open.id ? record : item)) } }
}

/** Corrección de un registro por quien lleva la planilla. */
export function saveAttendance(state: AppState, record: Attendance): Op<Attendance> {
  if (!state.users.some((item) => item.id === record.userId)) return fail('Elige al trabajador.')
  if (!record.date || Number.isNaN(Date.parse(record.inAt))) return fail('Escribe la hora de entrada.')
  if (record.outAt && Number.isNaN(Date.parse(record.outAt))) return fail('La hora de salida no es válida.')
  if (record.outAt && record.outAt <= record.inAt) return fail('La salida debe ser después de la entrada.')
  const next: Attendance = { ...record, outAt: record.outAt || undefined, note: record.note?.trim() || undefined }
  const list = state.attendance ?? []
  const exists = list.some((item) => item.id === next.id)
  return { ok: true, value: next, patch: { attendance: exists ? list.map((item) => (item.id === next.id ? next : item)) : [next, ...list] } }
}

export function shiftHours(record: Attendance) {
  if (!record.outAt) return 0
  return round2(Math.max(0, new Date(record.outAt).getTime() - new Date(record.inAt).getTime()) / 3_600_000)
}

/** Días con asistencia y horas trabajadas de un mes (AAAA-MM). `open` son días pasados que quedaron sin salida. */
export function attendanceOf(records: Attendance[] | undefined, userId: string, period: string, today = isoDate()) {
  const mine = (records ?? []).filter((item) => item.userId === userId && item.date.startsWith(period))
  return {
    days: new Set(mine.map((item) => item.date)).size,
    hours: round2(mine.reduce((sum, item) => sum + shiftHours(item), 0)),
    open: mine.filter((item) => !item.outAt && item.date < today).length,
    records: mine.sort((a, b) => b.inAt.localeCompare(a.inAt)),
  }
}
