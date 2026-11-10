import { isoDate, parseIso } from './format'
import { IVA_RATE, regimeOn, round2 } from './ops'
import { shelfOf } from './shop'
import type { AppState, Movement, Purchase, Settings } from './types'

export type AccountType = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto'

export const ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1101', name: 'Caja', type: 'activo' },
  { code: '1102', name: 'Bancos', type: 'activo' },
  { code: '1103', name: 'Cuentas por cobrar', type: 'activo' },
  { code: '1104', name: 'Inventario', type: 'activo' },
  { code: '1105', name: 'IVA crédito fiscal', type: 'activo' },
  { code: '1106', name: 'Anticipos a empleados', type: 'activo' },
  { code: '1107', name: 'Caja chica', type: 'activo' },
  { code: '2101', name: 'Cuentas por pagar', type: 'pasivo' },
  { code: '2102', name: 'IGSS por pagar', type: 'pasivo' },
  { code: '2103', name: 'Prestaciones laborales por pagar', type: 'pasivo' },
  { code: '2104', name: 'IVA débito fiscal', type: 'pasivo' },
  { code: '2105', name: 'Impuestos por pagar', type: 'pasivo' },
  { code: '2106', name: 'Préstamos por pagar', type: 'pasivo' },
  { code: '3101', name: 'Capital aportado', type: 'patrimonio' },
  { code: '4101', name: 'Ingresos por servicios', type: 'ingreso' },
  { code: '4102', name: 'Ventas de productos', type: 'ingreso' },
  { code: '4103', name: 'Otros ingresos', type: 'ingreso' },
  { code: '5101', name: 'Costo de ventas', type: 'costo' },
  { code: '6101', name: 'Sueldos y comisiones', type: 'gasto' },
  { code: '6102', name: 'Bonificación incentivo', type: 'gasto' },
  { code: '6103', name: 'Cuota patronal IGSS', type: 'gasto' },
  { code: '6104', name: 'Prestaciones laborales', type: 'gasto' },
  { code: '6201', name: 'Alquiler', type: 'gasto' },
  { code: '6202', name: 'Luz, agua y teléfono', type: 'gasto' },
  { code: '6203', name: 'Insumos de grooming', type: 'gasto' },
  { code: '6204', name: 'Mantenimiento', type: 'gasto' },
  { code: '6205', name: 'Publicidad', type: 'gasto' },
  { code: '6206', name: 'Impuestos y tasas', type: 'gasto' },
  { code: '6207', name: 'Transporte', type: 'gasto' },
  { code: '6208', name: 'Otros gastos', type: 'gasto' },
  { code: '6209', name: 'Ajustes de inventario', type: 'gasto' },
  { code: '6301', name: 'Impuesto pequeño contribuyente', type: 'gasto' },
]

export const PAYROLL_ACCOUNTS = ['6101', '6102', '6103', '6104']

const CATEGORY_ACCOUNT: Record<string, string> = {
  Alquiler: '6201',
  Luz: '6202',
  Agua: '6202',
  Internet: '6202',
  'Teléfono móvil': '6202',
  'Teléfono e internet': '6202',
  'Reposición de caja chica': '1107',
  'Insumos de grooming': '6203',
  Mantenimiento: '6204',
  Publicidad: '6205',
  Impuestos: '6206',
  'Pago de impuestos SAT': '2105',
  Transporte: '6207',
  'Anticipo a empleado': '1106',
  'Prestaciones laborales': '2103',
  'Pago de préstamo': '2106',
  'Otros gastos': '6208',
}

/** Ingresos que no son venta y la cuenta que los recibe. */
const INCOME_ACCOUNT: Record<string, string> = {
  'Aporte de capital': '3101',
  'Préstamo recibido': '2106',
  'Otro ingreso no gravado': '4103',
}

export function accountName(code: string) {
  return ACCOUNTS.find((item) => item.code === code)?.name ?? code
}

export function accountType(code: string): AccountType {
  return ACCOUNTS.find((item) => item.code === code)?.type ?? 'gasto'
}

export function categoryAccount(category?: string) {
  return (category && CATEGORY_ACCOUNT[category]) || '6208'
}

export function methodAccount(method: string) {
  if (method === 'Tarjeta' || method === 'Transferencia') return '1102'
  if (method === 'Pedido') return '1103'
  if (method === 'Caja chica') return '1107'
  if (method === 'Descuento en planilla') return '1106'
  return '1101'
}

export type JournalLine = { code: string; debit: number; credit: number }

export type Entry = { id: string; date: string; ref: string; concept: string; lines: JournalLine[] }

const debit = (code: string, amount: number): JournalLine => ({ code, debit: round2(amount), credit: 0 })
const credit = (code: string, amount: number): JournalLine => ({ code, debit: 0, credit: round2(amount) })

/** Cuadra centavos de redondeo contra la última línea para que cada partida sume igual. */
function balanced(entry: Entry): Entry | null {
  const lines = entry.lines.filter((line) => line.debit !== 0 || line.credit !== 0)
  if (lines.length === 0) return null
  const gap = round2(lines.reduce((sum, line) => sum + line.debit - line.credit, 0))
  if (gap !== 0) {
    const last = [...lines].reverse().find((line) => line.credit > 0)
    if (last) last.credit = round2(last.credit + gap)
  }
  return { ...entry, lines }
}

/** Reparte la compra entre inventario, insumos e IVA. Los insumos se calculan por diferencia para que el total cuadre al centavo. */
export function purchaseLines(purchase: Purchase) {
  let stock = 0
  let supplies = 0
  for (const line of purchase.lines) {
    const amount = line.qty * line.cost
    if (line.productId) stock += amount
    else supplies += amount
  }
  const total = round2(stock + supplies)
  const tax = purchase.withTax ? round2(total - total / (1 + IVA_RATE)) : 0
  const stockNet = total ? round2(stock - (tax * stock) / total) : 0
  const suppliesNet = supplies ? round2(total - tax - stockNet) : 0
  return [debit('1104', supplies ? stockNet : round2(total - tax)), debit('6203', suppliesNet), debit('1105', tax)]
}

/** Separa el IVA de un gasto con factura cuando ese día se estaba en el régimen general. */
function expenseLines(settings: Settings, date: string, account: string, amount: number, withTax?: boolean) {
  if (!withTax || regimeOn(settings, date) !== 'general' || !/^6/.test(account)) return [debit(account, amount)]
  const tax = round2(amount - amount / (1 + IVA_RATE))
  return [debit(account, round2(amount - tax)), debit('1105', tax)]
}

function monthEnd(month: string) {
  const [year, number] = month.split('-').map(Number)
  return isoDate(new Date(year, number, 0))
}

function lastDay(month: string) {
  const end = monthEnd(month)
  const today = isoDate()
  return end > today ? today : end
}

export function buildJournal(state: AppState): Entry[] {
  const settings = state.settings
  const entries: Entry[] = []
  const sales = new Map((state.sales ?? []).map((item) => [item.id, item]))
  const purchases = new Map((state.purchases ?? []).map((item) => [item.id, item]))
  const payables = new Map((state.payables ?? []).map((item) => [item.id, item]))
  const movements = new Map(state.movements.map((item) => [item.id, item]))
  const push = (entry: Entry) => {
    const ready = balanced(entry)
    if (ready) entries.push(ready)
  }

  const products = shelfOf(state.products)
  const moves = state.stockMoves ?? []
  const firstDate = [...state.movements.map((item) => item.date), ...moves.map((item) => item.date)].sort()[0] ?? isoDate()
  /**
   * La apertura se valora con el costo que tenía cada producto antes de su primer movimiento, así no cambia con las compras de después.
   * Una compra registra el precio de compra y no el costo anterior, por eso no sirve para valorar la apertura.
   */
  const opening = products.reduce((sum, item) => {
    const own = moves.filter((move) => move.productId === item.id)
    const tracked = own.reduce((total, move) => total + move.qty, 0)
    const first = [...own].reverse().sort((a, b) => a.at.localeCompare(b.at))[0]
    const cost = first?.costBefore ?? (first && first.kind !== 'compra' ? first.unitCost : undefined) ?? item.cost ?? 0
    return sum + Math.max(0, item.stock - tracked) * cost
  }, 0)
  push({ id: 'apertura', date: firstDate, ref: 'APERTURA', concept: 'Inventario inicial', lines: [debit('1104', opening), credit('3101', opening)] })

  for (const move of moves) {
    if (move.kind !== 'inicial') continue
    const value = round2(move.qty * (move.unitCost ?? 0))
    push({ id: `alta-${move.id}`, date: move.date, ref: move.reference, concept: 'Existencia inicial de un producto nuevo', lines: [debit('1104', value), credit('3101', value)] })
  }

  for (const movement of state.movements) {
    entries.push(...movementEntries(movement, { settings, sales, purchases, payables, movements }).flatMap((entry) => balanced(entry) ?? []))
  }

  for (const purchase of state.purchases ?? []) {
    if (purchase.terms !== 'credito') continue
    push({
      id: `compra-${purchase.id}`,
      date: purchase.date,
      ref: purchase.number,
      concept: `Compra al crédito · ${purchase.supplierName}`,
      lines: [...purchaseLines(purchase), credit('2101', purchase.total)],
    })
  }

  for (const payable of state.payables ?? []) {
    if (payable.purchaseId || payable.payrollId) continue
    push({
      id: `cxp-${payable.id}`,
      date: payable.date,
      ref: payable.number,
      concept: `${payable.concept} · ${payable.supplierName}`,
      lines: [...expenseLines(settings, payable.date, categoryAccount(payable.category), payable.amount, payable.withTax), credit('2101', payable.amount)],
    })
  }

  for (const run of state.payrolls ?? []) {
    const sum = (pick: (line: (typeof run.lines)[number]) => number) => run.lines.reduce((total, line) => total + pick(line), 0)
    const igss = sum((line) => line.igss + line.employerIgss)
    const provisions = sum((line) => line.aguinaldo + line.bono14 + line.vacaciones + line.indemnizacion)
    push({
      id: `planilla-${run.id}`,
      date: run.paidAt,
      ref: run.document,
      concept: `Planilla ${run.period}`,
      lines: [
        debit('6101', sum((line) => line.salary + line.commission + line.extra)),
        debit('6102', sum((line) => line.bonus)),
        debit('6103', sum((line) => line.employerIgss)),
        debit('6104', provisions),
        credit(methodAccount(run.method), sum((line) => line.net)),
        credit('2102', igss),
        credit('2103', provisions),
        credit('1106', sum((line) => line.deductions)),
      ],
    })
  }

  const costOf = (productId: string) => products.find((item) => item.id === productId)?.cost ?? 0
  for (const move of moves) {
    if (move.kind !== 'ajuste' && move.kind !== 'consumo') continue
    const value = round2(Math.abs(move.qty) * (move.unitCost ?? costOf(move.productId)))
    const expense = move.kind === 'consumo' ? '6203' : '6209'
    push({
      id: `kardex-${move.id}`,
      date: move.date,
      ref: move.reference,
      concept: `${move.kind === 'consumo' ? 'Consumo' : 'Ajuste'} de inventario · ${move.note}`,
      lines: move.qty < 0 ? [debit(expense, value), credit('1104', value)] : [debit('1104', value), credit('6209', value)],
    })
  }

  if (settings.taxRegime || (settings.taxHistory ?? []).some((item) => item.regime)) {
    const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort()
    let available = 0
    for (const month of months) {
      const regime = regimeOn(settings, monthEnd(month))
      const inMonth = entries.filter((entry) => entry.date.startsWith(month))
      const total = (code: string, side: 'debit' | 'credit') =>
        round2(inMonth.reduce((sum, entry) => sum + entry.lines.filter((line) => line.code === code).reduce((acc, line) => acc + line[side], 0), 0))
      const creditTax = round2(total('1105', 'debit') - total('1105', 'credit'))
      if (!regime) {
        available = round2(available + creditTax)
        continue
      }
      if (regime === 'pequeno') {
        const revenue = total('4101', 'credit') + total('4102', 'credit') - total('4101', 'debit') - total('4102', 'debit')
        const tax = round2(Math.max(0, revenue) * 0.05)
        push({ id: `isr-${month}`, date: lastDay(month), ref: `IMP-${month}`, concept: `Impuesto 5 % del mes ${month}`, lines: [debit('6301', tax), credit('2105', tax)] })
        available = round2(available + creditTax)
      } else {
        const pool = round2(available + creditTax)
        const owed = round2(total('2104', 'credit') - total('2104', 'debit'))
        const used = Math.min(pool, Math.max(0, owed))
        available = round2(pool - used - Math.min(0, owed))
        push({
          id: `iva-${month}`,
          date: lastDay(month),
          ref: `IVA-${month}`,
          concept: `Liquidación de IVA ${month}`,
          lines:
            owed >= 0
              ? [debit('2104', owed), credit('1105', used), credit('2105', owed - used)]
              : [debit('1105', -owed), credit('2104', -owed)],
        })
      }
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref))
}

type Context = {
  settings: Settings
  sales: Map<string, NonNullable<AppState['sales']>[number]>
  purchases: Map<string, Purchase>
  payables: Map<string, NonNullable<AppState['payables']>[number]>
  movements: Map<string, Movement>
}

function movementEntries(movement: Movement, context: Context): Entry[] {
  const base = { id: movement.id, date: movement.date, ref: movement.document, concept: movement.concept }
  const cash = methodAccount(movement.method)
  if (movement.reverses) {
    const original = context.movements.get(movement.reverses)
    if (!original) return [{ ...base, lines: [debit('6208', movement.amount), credit(cash, movement.amount)] }]
    return movementEntries(original, context).map((entry, index) => ({
      id: `${movement.id}-${index}`,
      date: movement.date,
      ref: movement.document,
      concept: `Reversa · ${entry.concept}`,
      lines: entry.lines.map((line) => ({ code: line.code, debit: line.credit, credit: line.debit })),
    }))
  }
  if (movement.type === 'ingreso') {
    if (movement.method === 'Pedido') return []
    const special = !movement.saleId && !movement.folio && movement.category ? INCOME_ACCOUNT[movement.category] : undefined
    if (special) return [{ ...base, lines: [debit(cash, movement.amount), credit(special, movement.amount)] }]
    const sale = movement.saleId ? context.sales.get(movement.saleId) : undefined
    let goods = 0
    let services = movement.amount
    if (sale) {
      const gross = sale.lines.reduce((sum, line) => sum + line.qty * line.price, 0)
      const productGross = sale.lines.filter((line) => line.productId).reduce((sum, line) => sum + line.qty * line.price, 0)
      goods = gross ? round2((movement.amount * productGross) / gross) : 0
      services = round2(movement.amount - goods)
    }
    const tax = regimeOn(context.settings, movement.date) === 'general' ? round2(movement.amount - movement.amount / (1 + IVA_RATE)) : 0
    const goodsTax = movement.amount ? round2((tax * goods) / movement.amount) : 0
    const result: Entry[] = [
      {
        ...base,
        lines: [debit(cash, movement.amount), credit('4102', goods - goodsTax), credit('4101', services - (tax - goodsTax)), credit('2104', tax)],
      },
    ]
    if (sale) {
      const cost = round2(sale.lines.reduce((sum, line) => sum + (line.productId ? line.qty * (line.cost ?? 0) : 0), 0))
      result.push({ id: `${movement.id}-costo`, date: movement.date, ref: movement.document, concept: `Costo de ${sale.number}`, lines: [debit('5101', cost), credit('1104', cost)] })
    }
    return result
  }
  if (movement.payrollId) return []
  if (movement.purchaseId) {
    const purchase = context.purchases.get(movement.purchaseId)
    const lines = purchase ? purchaseLines(purchase) : [debit('6203', movement.amount)]
    return [{ ...base, lines: [...lines, credit(cash, movement.amount)] }]
  }
  if (movement.payableId) {
    const payable = context.payables.get(movement.payableId)
    const account = payable?.category === 'IGSS' ? '2102' : '2101'
    return [{ ...base, lines: [debit(account, movement.amount), credit(cash, movement.amount)] }]
  }
  return [{ ...base, lines: [...expenseLines(context.settings, movement.date, categoryAccount(movement.category), movement.amount, movement.withTax), credit(cash, movement.amount)] }]
}

export type Balance = { code: string; name: string; type: AccountType; debit: number; credit: number; balance: number }

/** Saldo por cuenta. Activo, costo y gasto crecen al debe; el resto al haber. */
export function balances(entries: Entry[], from = '0000-01-01', to = '9999-12-31'): Balance[] {
  const totals = new Map<string, { debit: number; credit: number }>()
  for (const entry of entries) {
    if (entry.date < from || entry.date > to) continue
    for (const line of entry.lines) {
      const current = totals.get(line.code) ?? { debit: 0, credit: 0 }
      current.debit += line.debit
      current.credit += line.credit
      totals.set(line.code, current)
    }
  }
  return ACCOUNTS.filter((account) => totals.has(account.code)).map((account) => {
    const { debit: d, credit: c } = totals.get(account.code)!
    const natural = account.type === 'activo' || account.type === 'costo' || account.type === 'gasto'
    return { ...account, debit: round2(d), credit: round2(c), balance: round2(natural ? d - c : c - d) }
  })
}

export type IncomeStatement = {
  revenue: Balance[]
  totalRevenue: number
  cost: number
  gross: number
  payroll: Balance[]
  totalPayroll: number
  expenses: Balance[]
  totalExpenses: number
  taxes: number
  net: number
  margin: number
}

export function incomeStatement(entries: Entry[], from: string, to: string): IncomeStatement {
  const rows = balances(entries, from, to)
  const revenue = rows.filter((row) => row.type === 'ingreso')
  const totalRevenue = round2(revenue.reduce((sum, row) => sum + row.balance, 0))
  const cost = round2(rows.filter((row) => row.type === 'costo').reduce((sum, row) => sum + row.balance, 0))
  const payroll = rows.filter((row) => PAYROLL_ACCOUNTS.includes(row.code))
  const totalPayroll = round2(payroll.reduce((sum, row) => sum + row.balance, 0))
  const expenses = rows.filter((row) => row.type === 'gasto' && !PAYROLL_ACCOUNTS.includes(row.code) && row.code !== '6301')
  const totalExpenses = round2(expenses.reduce((sum, row) => sum + row.balance, 0))
  const taxes = round2(rows.find((row) => row.code === '6301')?.balance ?? 0)
  const gross = round2(totalRevenue - cost)
  const net = round2(gross - totalPayroll - totalExpenses - taxes)
  return { revenue, totalRevenue, cost, gross, payroll, totalPayroll, expenses, totalExpenses, taxes, net, margin: totalRevenue ? round2((net / totalRevenue) * 100) : 0 }
}

export type BalanceSheet = {
  assets: Balance[]
  totalAssets: number
  liabilities: Balance[]
  totalLiabilities: number
  capital: number
  result: number
  totalEquity: number
}

export function balanceSheet(entries: Entry[], to: string): BalanceSheet {
  const rows = balances(entries, '0000-01-01', to)
  const assets = rows.filter((row) => row.type === 'activo')
  const liabilities = rows.filter((row) => row.type === 'pasivo')
  const capital = round2(rows.filter((row) => row.type === 'patrimonio').reduce((sum, row) => sum + row.balance, 0))
  const statement = incomeStatement(entries, '0000-01-01', to)
  const totalAssets = round2(assets.reduce((sum, row) => sum + row.balance, 0))
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.balance, 0))
  return { assets, totalAssets, liabilities, totalLiabilities, capital, result: statement.net, totalEquity: round2(capital + statement.net) }
}

export type TaxMonth = {
  month: string
  label: string
  regime?: 'general' | 'pequeno'
  base: number
  debitTax: number
  creditTax: number
  /** Crédito fiscal que venía de meses anteriores. */
  carried: number
  payable: number
}

/** Impuesto de cada mes del año, con el régimen vigente ese mes y el crédito de IVA que se arrastra, igual que el libro diario. */
export function taxMonths(entries: Entry[], settings: Settings, year: number): TaxMonth[] {
  const own = entries.filter((entry) => !entry.id.startsWith('iva-') && !entry.id.startsWith('isr-'))
  const first = own.map((entry) => entry.date.slice(0, 7)).sort()[0] ?? `${year}-01`
  const months: string[] = []
  for (let cursor = first < `${year}-01` ? first : `${year}-01`; cursor <= `${year}-12`; ) {
    months.push(cursor)
    const [y, m] = cursor.split('-').map(Number)
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  let available = 0
  const result: TaxMonth[] = []
  for (const month of months) {
    const inMonth = own.filter((entry) => entry.date.startsWith(month))
    const sum = (code: string, side: 'debit' | 'credit') =>
      round2(inMonth.reduce((total, entry) => total + entry.lines.filter((line) => line.code === code).reduce((acc, line) => acc + line[side], 0), 0))
    const regime = regimeOn(settings, monthEnd(month))
    const base = round2(sum('4101', 'credit') + sum('4102', 'credit') - sum('4101', 'debit') - sum('4102', 'debit'))
    const debitTax = regime === 'general' ? round2(sum('2104', 'credit') - sum('2104', 'debit')) : 0
    const creditTax = round2(sum('1105', 'debit') - sum('1105', 'credit'))
    const carried = available
    let payable = 0
    if (regime === 'pequeno') {
      payable = round2(Math.max(0, base) * 0.05)
      available = round2(available + creditTax)
    } else if (regime === 'general') {
      const pool = round2(available + creditTax)
      const used = Math.min(pool, Math.max(0, debitTax))
      payable = round2(Math.max(0, debitTax) - used)
      available = round2(pool - used - Math.min(0, debitTax))
    } else {
      available = round2(available + creditTax)
    }
    if (month.startsWith(`${year}-`)) {
      const label = parseIso(`${month}-01`).toLocaleDateString('es-GT', { month: 'long' })
      result.push({ month, label, regime, base, debitTax, creditTax, carried, payable })
    }
  }
  return result
}
