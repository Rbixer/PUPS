import { describe, expect, it } from 'vitest'
import { defaultsFor } from '../src/access'
import { alertBadges, buildAlerts, openCashDays } from '../src/alerts'
import { clientProfiles } from '../src/clients'
import { addDays, isoDate } from '../src/format'
import { balanceSheet, balances, buildJournal, incomeStatement } from '../src/ledger'
import * as ops from '../src/ops'
import type { Op } from '../src/ops'
import { behindGoal, goalProgress, laborLiability, payrollLine } from '../src/payroll'
import { createSeed } from '../src/seed'
import type { AppState, Movement, Sale } from '../src/types'

function apply<T>(state: AppState, result: Op<T>) {
  if (!result.ok) throw new Error(result.error)
  return { state: { ...state, ...result.patch }, value: result.value }
}

function stockOf(state: AppState, id: string) {
  return state.products?.find((item) => item.id === id)?.stock
}

function withSupplier(state: AppState) {
  return apply(state, ops.saveSupplier(state, { id: '', name: 'Distribuidora', nit: 'cf', phone: '55550001', email: '', contact: '', notes: '' }))
}

function balancedJournal(state: AppState) {
  const entries = buildJournal(state)
  for (const entry of entries) {
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0)
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0)
    expect(Math.round(debit * 100)).toBe(Math.round(credit * 100))
  }
  return entries
}

describe('ventas de mostrador', () => {
  it('descuenta existencia, crea el ingreso y deja el kárdex', () => {
    const seed = createSeed()
    const { state, value: sale } = apply(
      seed,
      ops.recordSale(seed, {
        clientName: 'Ana',
        phone: '5555 2222',
        lines: [
          { productId: 'collar', name: 'Collar', qty: 2, price: 45 },
          { name: 'Corte de uñas', qty: 1, price: 30 },
        ],
        discount: 10,
        method: 'Efectivo',
      }),
    )
    expect(sale.total).toBe(110)
    expect(sale.number).toBe('VEN-0001')
    expect(stockOf(state, 'collar')).toBe(16)
    expect(state.movements[0]).toMatchObject({ type: 'ingreso', amount: 110, saleId: sale.id, method: 'Efectivo' })
    expect(state.stockMoves?.[0]).toMatchObject({ productId: 'collar', qty: -2, kind: 'venta', balance: 16 })
  })

  it('no vende más de lo que hay ni insumos', () => {
    const seed = createSeed()
    expect(ops.recordSale(seed, { clientName: '', phone: '', lines: [{ productId: 'collar', name: 'Collar', qty: 99, price: 45 }], discount: 0, method: 'Efectivo' }).ok).toBe(false)
    const insumo = apply(seed, ops.saveProduct(seed, { id: 'gel', name: 'Gel', detail: '', category: 'Insumos', price: 0, unit: 'galón', stock: 3, image: '', kind: 'insumo' })).state
    expect(ops.recordSale(insumo, { clientName: '', phone: '', lines: [{ productId: 'gel', name: 'Gel', qty: 1, price: 10 }], discount: 0, method: 'Efectivo' }).ok).toBe(false)
  })

  it('anular devuelve la existencia y deja una devolución sin tocar el ingreso original', () => {
    const seed = createSeed()
    const sold = apply(seed, ops.recordSale(seed, { clientName: '', phone: '', lines: [{ productId: 'peine', name: 'Peine', qty: 3, price: 38 }], discount: 0, method: 'Tarjeta' }))
    const original = sold.state.movements.find((item) => item.saleId === sold.value.id)!
    const voided = apply(sold.state, ops.voidSale(sold.state, sold.value.id, 'Cliente devolvió'))
    expect(stockOf(voided.state, 'peine')).toBe(20)
    expect(voided.state.movements).toContainEqual(original)
    expect(voided.state.movements[0]).toMatchObject({ type: 'egreso', amount: 114, reverses: original.id, category: 'Devolución de venta', date: isoDate() })
    expect(voided.value.status).toBe('anulada')
    const statement = incomeStatement(balancedJournal(voided.state), '0000-01-01', '9999-12-31')
    expect(statement.revenue.find((row) => row.code === '4101')?.balance ?? 0).toBe(incomeStatement(buildJournal(seed), '0000-01-01', '9999-12-31').revenue.find((row) => row.code === '4101')?.balance ?? 0)
  })

  it('cancelar un pedido sin cobrar solo lo quita', () => {
    const seed = createSeed()
    const placed = apply(seed, ops.placeOrder(seed, { name: 'Luis', phone: '55553333', lines: [{ id: 'snack', qty: 2 }] }))
    const saleId = placed.state.sales![0].id
    const voided = apply(placed.state, ops.voidSale(placed.state, saleId, 'No llegó'))
    expect(voided.state.movements.some((item) => item.saleId === saleId)).toBe(false)
    expect(stockOf(voided.state, 'snack')).toBe(stockOf(seed, 'snack'))
  })

  it('un pedido de la tienda queda por cobrar y se cobra después', () => {
    const seed = createSeed()
    const placed = apply(seed, ops.placeOrder(seed, { name: 'Luis', phone: '55553333', lines: [{ id: 'snack', qty: 2 }] }))
    const movement = placed.state.movements[0]
    expect(movement.method).toBe('Pedido')
    expect(placed.state.sales?.[0].status).toBe('por cobrar')
    const settled = apply(placed.state, ops.settleOrder(placed.state, movement.id, 'Efectivo'))
    expect(settled.value.method).toBe('Efectivo')
    expect(settled.value.notes).not.toContain(ops.PENDING_ORDER)
    expect(settled.state.sales?.[0].status).toBe('pagada')
  })
})

describe('compras y cuentas por pagar', () => {
  it('la compra al contado sube existencia, promedia el costo y crea el egreso', () => {
    const seed = withSupplier(createSeed()).state
    const supplierId = seed.suppliers![0].id
    const { state, value } = apply(
      seed,
      ops.recordPurchase(seed, { date: isoDate(), supplierId, invoice: 'A-1', withTax: false, lines: [{ productId: 'collar', description: 'Collar', qty: 2, cost: 20 }], terms: 'contado', method: 'Efectivo', notes: '' }),
    )
    expect(stockOf(state, 'collar')).toBe(20)
    expect(state.products?.find((item) => item.id === 'collar')?.cost).toBe(21.8)
    expect(state.movements[0]).toMatchObject({ type: 'egreso', amount: 40, purchaseId: value.id })
  })

  it('da de alta productos nuevos desde la compra, separados en venta y uso en servicio', () => {
    const seed = withSupplier(createSeed()).state
    const supplierId = seed.suppliers![0].id
    const create = (kind: 'venta' | 'insumo') => ({ kind, unit: 'galón', price: kind === 'venta' ? 95 : 0, category: 'Shampoo' as const })
    const { state, value } = apply(
      seed,
      ops.recordPurchase(seed, {
        date: isoDate(),
        supplierId,
        invoice: 'B-7',
        withTax: false,
        lines: [
          { description: 'Shampoo avena 1 L', qty: 6, cost: 40, create: create('venta') },
          { description: 'Shampoo profesional galón', qty: 2, cost: 150, create: create('insumo') },
          { productId: 'collar', description: 'Collar', qty: 1, cost: 20 },
          { description: 'Flete', qty: 1, cost: 25 },
        ],
        terms: 'contado',
        method: 'Efectivo',
        notes: '',
      }),
    )
    const retail = state.products!.find((item) => item.name === 'Shampoo avena 1 L')!
    const supply = state.products!.find((item) => item.name === 'Shampoo profesional galón')!
    expect(retail).toMatchObject({ kind: 'venta', stock: 6, price: 95, cost: 40, active: false })
    expect(supply).toMatchObject({ kind: 'insumo', stock: 2, category: 'Insumos', price: 0 })
    expect(value.lines.map((line) => line.use)).toEqual(['venta', 'insumo', 'venta', undefined])
    expect(ops.purchaseSplit([value], state.products)).toEqual({ venta: 260, insumo: 300, gasto: 25 })
    expect(state.stockMoves?.filter((move) => move.reference === value.number)).toHaveLength(3)
    balancedJournal(state)

    const again = ops.recordPurchase(state, {
      date: isoDate(),
      supplierId,
      invoice: 'B-8',
      withTax: false,
      lines: [{ description: 'shampoo avena 1 l', qty: 1, cost: 40, create: create('venta') }],
      terms: 'contado',
      method: 'Efectivo',
      notes: '',
    })
    expect(again.ok).toBe(false)
  })

  it('al crédito crea la factura por pagar y los abonos bajan el saldo', () => {
    const seed = withSupplier(createSeed()).state
    const supplierId = seed.suppliers![0].id
    const bought = apply(
      seed,
      ops.recordPurchase(seed, { date: isoDate(), supplierId, invoice: 'B-7', withTax: false, lines: [{ productId: 'plato', description: 'Plato', qty: 10, cost: 25 }], terms: 'credito', notes: '' }),
    )
    const payable = bought.state.payables![0]
    expect(payable.amount).toBe(250)
    const partial = apply(bought.state, ops.payPayable(bought.state, { payableId: payable.id, amount: 100, method: 'Transferencia', date: isoDate() }))
    expect(ops.payableBalance(partial.state.payables![0])).toBe(150)
    expect(ops.payPayable(partial.state, { payableId: payable.id, amount: 151, method: 'Efectivo', date: isoDate() }).ok).toBe(false)
  })

  it('un gasto fijo se paga una sola vez por mes', () => {
    const seed = createSeed()
    const fixed = apply(seed, ops.saveFixedCost(seed, { id: '', name: 'Alquiler del local', category: 'Alquiler', amount: 3500, day: 5, active: true }))
    const period = isoDate().slice(0, 7)
    const paid = apply(fixed.state, ops.payFixedCost(fixed.state, { fixedId: fixed.value.id, period, amount: 3500, method: 'Transferencia', date: isoDate() }))
    expect(paid.value.category).toBe('Alquiler')
    expect(ops.payFixedCost(paid.state, { fixedId: fixed.value.id, period, amount: 3500, method: 'Transferencia', date: isoDate() }).ok).toBe(false)
  })

  it('los gastos salen de la caja chica sin pasar de su saldo y llevan rubro', () => {
    const seed = createSeed()
    const today = isoDate()
    const refill: Movement = { id: 'cc1', type: 'egreso', date: today, concept: 'Reposición de caja chica', amount: 500, method: 'Efectivo', notes: '', document: 'EG-9001', category: ops.PETTY_REFILL }
    const state: AppState = { ...seed, movements: [refill, ...seed.movements] }
    expect(ops.pettyBalance(state.movements)).toBe(500)
    const fixed = apply(state, ops.saveFixedCost(state, { id: '', name: 'Luz', category: 'Luz', amount: 600, day: 10, active: true }))
    const period = today.slice(0, 7)
    expect(ops.payFixedCost(fixed.state, { fixedId: fixed.value.id, period, amount: 600, method: 'Caja chica', date: today }).ok).toBe(false)
    const paid = apply(fixed.state, ops.payFixedCost(fixed.state, { fixedId: fixed.value.id, period, amount: 320, method: 'Caja chica', date: today }))
    expect(paid.value.area).toBe('administrativo')
    expect(ops.pettyBalance(paid.state.movements)).toBe(180)

    const entries = balancedJournal(paid.state)
    expect(balances(entries).find((item) => item.code === '1107')?.balance).toBe(180)

    const before = ops.cashSummary(state.movements, today, 0)
    const after = ops.cashSummary(paid.state.movements, today, 0)
    expect(after.cashOut).toBe(before.cashOut)
    expect(after.expense).toBe(before.expense)
    expect(ops.defaultArea('Insumos de grooming')).toBe('servicio')
    expect(ops.defaultArea('Publicidad')).toBe('venta')
  })
})

describe('planilla', () => {
  const worker = { id: 'w1', name: 'Rosa', username: 'rosa', password: '', role: 'Recepción' as const, active: true, employeeCode: '1001', salary: 3600, commissionRate: 10 }

  it('calcula comisión, IGSS, bonificación y provisiones', () => {
    const seed = createSeed()
    const period = seed.appointments[0].date.slice(0, 7)
    const appointments = seed.appointments.map((item) => (item.status === 'completada' && item.date.startsWith(period) ? { ...item, employeeCode: '1001' } : item))
    const base = appointments.filter((item) => item.status === 'completada' && item.date.startsWith(period)).reduce((sum, item) => sum + item.cost, 0)
    const line = payrollLine(worker, appointments, period, { extra: 0, deductions: 100 })
    expect(line.commission).toBe(Math.round(base * 10) / 100)
    expect(line.bonus).toBe(250)
    expect(line.igss).toBe(Math.round((3600 + line.commission) * 4.83) / 100)
    expect(line.net).toBe(Math.round((3600 + line.commission + 250 - line.igss - 100) * 100) / 100)
    expect(line.aguinaldo).toBe(Math.round(((3600 + line.commission) / 12) * 100) / 100)
  })

  it('pagar planilla crea el egreso, las cuotas del IGSS por pagar y no se repite', () => {
    const seed = { ...createSeed(), users: [...createSeed().users, worker] }
    const period = isoDate().slice(0, 7)
    const line = payrollLine(worker, seed.appointments, period)
    const paid = apply(seed, ops.payPayroll(seed, { period, lines: [line], method: 'Transferencia', date: isoDate() }))
    expect(paid.state.movements[0]).toMatchObject({ type: 'egreso', amount: line.net, category: 'Planilla' })
    expect(paid.state.payables![0].amount).toBe(Math.round((line.igss + line.employerIgss) * 100) / 100)
    expect(ops.payPayroll(paid.state, { period, lines: [line], method: 'Efectivo', date: isoDate() }).ok).toBe(false)
    balancedJournal(paid.state)
  })

  it('el pasivo laboral crece con la antigüedad', () => {
    const short = laborLiability({ ...worker, hiredAt: '2026-01-01' }, '2026-07-01')
    const long = laborLiability({ ...worker, hiredAt: '2022-01-01' }, '2026-07-01')
    expect(long.indemnizacion).toBeGreaterThan(short.indemnizacion)
    expect(short.bono14).toBe(0)
    expect(laborLiability({ ...worker, hiredAt: undefined }).total).toBe(0)
  })

  it('las compras con descuento en planilla bajan existencia y se descuentan una sola vez', () => {
    const seed = { ...createSeed(), users: [...createSeed().users, worker] }
    const product = seed.products!.find((item) => item.kind !== 'insumo' && item.stock > 2)!
    const today = isoDate()
    const lines = [{ productId: product.id, name: product.name, qty: 2, price: 50 }]
    expect(ops.recordEmployeePurchase(seed, { employeeId: 'nadie', lines, discount: 0, method: ops.PAYROLL_DEDUCTION }).ok).toBe(false)
    const bought = apply(seed, ops.recordEmployeePurchase(seed, { employeeId: worker.id, lines, discount: 10, method: ops.PAYROLL_DEDUCTION, date: today }))
    expect(bought.value).toMatchObject({ employeeId: worker.id, total: 90, invoiced: false, clientName: 'Rosa' })
    expect(stockOf(bought.state, product.id)).toBe(product.stock - 2)
    expect(ops.employeeOwed(bought.state, worker.id)).toBe(90)
    expect(ops.cashSummary(bought.state.movements, today, 0).expected).toBe(ops.cashSummary(seed.movements, today, 0).expected)
    const journal = balancedJournal(bought.state)
    expect(balances(journal).find((item) => item.code === '1106')?.balance).toBe(90)

    const period = today.slice(0, 7)
    const line = payrollLine(worker, bought.state.appointments, period, { extra: 0, deductions: 90, purchases: 90 })
    expect(line.purchases).toBe(90)
    const paid = apply(bought.state, ops.payPayroll(bought.state, { period, lines: [line], method: 'Transferencia', date: today }))
    expect(ops.employeeOwed(paid.state, worker.id)).toBe(0)
    expect(balances(balancedJournal(paid.state)).find((item) => item.code === '1106')?.balance ?? 0).toBe(0)
  })

  it('cada quien marca una entrada abierta por día y las metas cuentan ventas y servicios', () => {
    const seed = { ...createSeed(), users: [...createSeed().users, { ...worker, salesGoal: 1000, servicesGoal: 10 }] }
    const morning = new Date(2026, 10, 9, 8, 0)
    const first = apply(seed, ops.clockIn(seed, worker.id, morning))
    expect(ops.clockIn(first.state, worker.id, new Date(2026, 10, 9, 9, 0)).ok).toBe(false)
    const out = apply(first.state, ops.clockOut(first.state, worker.id, new Date(2026, 10, 9, 16, 30)))
    expect(ops.shiftHours(out.value)).toBe(8.5)
    expect(ops.clockOut(out.state, worker.id, new Date(2026, 10, 9, 17, 0)).ok).toBe(false)
    const summary = ops.attendanceOf(out.state.attendance, worker.id, '2026-11')
    expect(summary).toMatchObject({ days: 1, hours: 8.5, open: 0 })

    const user = seed.users.find((item) => item.id === worker.id)!
    const sale: Sale = {
      id: 's-meta',
      number: 'VEN-0001',
      date: '2026-11-03',
      at: '',
      channel: 'mostrador',
      clientName: '',
      phone: '',
      lines: [],
      discount: 0,
      total: 400,
      method: 'Efectivo',
      status: 'pagada',
      document: 'ING-1',
      userId: worker.id,
    }
    const progress = goalProgress(user, { appointments: seed.appointments, sales: [sale] }, '2026-11')
    expect(progress).toMatchObject({ sales: 400, salesGoal: 1000, servicesGoal: 10 })
    expect(behindGoal(progress, '2026-11', '2026-11-30')).toContain('ventas')
    expect(behindGoal({ ...progress, sales: 1000, services: 10 }, '2026-11', '2026-11-30')).toEqual([])
    expect(behindGoal(progress, '2026-11', '2026-11-03')).not.toContain('ventas')
  })
})

describe('corte de caja', () => {
  it('cuenta el efectivo esperado y bloquea movimientos después del corte', () => {
    const seed = createSeed()
    const date = seed.movements[0].date
    const summary = ops.cashSummary(seed.movements, date, 500)
    const efectivo = seed.movements.filter((item) => item.date === date && item.method === 'Efectivo')
    const expected = 500 + efectivo.reduce((sum, item) => sum + (item.type === 'ingreso' ? item.amount : -item.amount), 0)
    expect(summary.expected).toBe(expected)
    expect(ops.closeCash(seed, { date, opening: 500, counted: expected - 5, note: '' }).ok).toBe(false)
    const closed = apply(seed, ops.closeCash(seed, { date, opening: 500, counted: expected, note: '' }))
    expect(closed.value.difference).toBe(0)
    expect(ops.closeCash(closed.state, { date, opening: 500, counted: expected, note: '' }).ok).toBe(false)
    expect(ops.recordSale(closed.state, { clientName: '', phone: '', date, lines: [{ name: 'Baño', qty: 1, price: 100 }], discount: 0, method: 'Efectivo' }).ok).toBe(false)
  })

  const cash = (date: string, amount: number, extra: Partial<Movement> = {}): Movement => ({
    id: `m-${date}-${amount}-${extra.saleId ?? ''}`,
    type: 'ingreso',
    date,
    concept: 'Cobro',
    amount,
    method: 'Efectivo',
    notes: '',
    document: '',
    ...extra,
  })
  const quiet = (): AppState => ({ ...createSeed(), movements: [], cashCloses: [], deposits: [], settings: { ...createSeed().settings, cashFloat: 200 } })

  it('acumula el efectivo de un corte al siguiente e incluye los días sin corte', () => {
    let state: AppState = { ...quiet(), movements: [cash('2026-01-05', 100, { folio: 1 }), cash('2026-01-06', 50, { folio: 2 }), cash('2026-01-07', 30, { folio: 3 })] }
    state = apply(state, ops.closeCash(state, { date: '2026-01-05', opening: 200, counted: 300, note: '' })).state
    const second = apply(state, ops.closeCash(state, { date: '2026-01-07', opening: 0, counted: 380, note: '' }))
    expect(second.value).toMatchObject({ from: '2026-01-06', opening: 300, expected: 380, difference: 0 })
    expect(ops.closedOn(second.state, '2026-01-06')).toBe(true)
    expect(ops.recordSale(second.state, { clientName: '', phone: '', date: '2026-01-06', lines: [{ name: 'Baño', qty: 1, price: 100 }], discount: 0, method: 'Efectivo' }).ok).toBe(false)
  })

  it('un depósito baja el efectivo esperado y queda fuera de los gastos', () => {
    let state: AppState = { ...quiet(), movements: [cash('2026-01-05', 1000, { folio: 1 })] }
    state = apply(state, ops.closeCash(state, { date: '2026-01-05', opening: 200, counted: 1200, note: '' })).state
    expect(ops.recordDeposit(state, { date: '2026-01-05', amount: 900, bank: 'BI', reference: '1', note: '' }).ok).toBe(false)
    expect(ops.recordDeposit(state, { date: '2026-01-06', amount: 900, bank: 'BI', reference: '', note: '' }).ok).toBe(false)
    state = apply(state, ops.recordDeposit(state, { date: '2026-01-06', amount: 1000, bank: 'BI', reference: '77', note: '' })).state
    expect(ops.cashOnHand(state, '2026-01-06')).toBe(200)
    const close = apply(state, ops.closeCash(state, { date: '2026-01-06', opening: 0, counted: 200, note: '' })).value
    expect(close).toMatchObject({ deposited: 1000, expected: 200, cashOut: 0 })
    expect(ops.removeDeposit({ ...state, cashCloses: [close, ...state.cashCloses!] }, state.deposits![0].id).ok).toBe(false)
  })

  it('separa lo facturado de lo que no y resta las devoluciones', () => {
    const split = ops.cashSplit([
      cash('2026-01-05', 100, { folio: 1, invoiced: true }),
      cash('2026-01-05', 60, { folio: 2 }),
      cash('2026-01-05', 45, { saleId: 's1' }),
      cash('2026-01-05', 80, { saleId: 's2', invoiced: true }),
      cash('2026-01-05', 45, { saleId: 's1', type: 'egreso', reverses: 'x' }),
      cash('2026-01-05', 500, { category: 'Aporte de capital' }),
      cash('2026-01-05', 70, { saleId: 's3', method: 'Pedido' }),
    ])
    expect(split).toEqual({ facturado: { ventas: 80, servicios: 100 }, sinFactura: { ventas: 0, servicios: 60 } })
  })

  it('guarda la factura al cobrar una cita, una venta o un pedido', () => {
    const seed = quiet()
    const visit = { ...seed.appointments[0], status: 'completada' as const, cost: 150, date: isoDate() }
    const charged = apply(seed, ops.chargeAppointment(seed, visit, 'Efectivo', true, true)).state
    expect(charged.movements[0].invoiced).toBe(true)
    const sold = apply(seed, ops.recordSale(seed, { clientName: '', phone: '', lines: [{ name: 'Baño', qty: 1, price: 90 }], discount: 0, method: 'Efectivo', invoiced: true }))
    expect(sold.value.invoiced).toBe(true)
    expect(sold.state.movements[0].invoiced).toBe(true)
  })
})

describe('contabilidad', () => {
  function busyState(regime?: 'general' | 'pequeno') {
    let state: AppState = { ...createSeed(), settings: { ...createSeed().settings, taxRegime: regime } }
    state = withSupplier(state).state
    const supplierId = state.suppliers![0].id
    state = apply(state, ops.recordPurchase(state, { date: isoDate(), supplierId, invoice: 'F-1', withTax: true, lines: [{ productId: 'collar', description: 'Collar', qty: 5, cost: 22.4 }, { description: 'Toallas', qty: 1, cost: 56 }], terms: 'credito', notes: '' })).state
    state = apply(state, ops.recordSale(state, { clientName: 'Eva', phone: '', lines: [{ productId: 'collar', name: 'Collar', qty: 3, price: 45 }, { name: 'Baño', qty: 1, price: 112 }], discount: 0, method: 'Tarjeta', invoiced: true })).state
    state = apply(state, ops.payPayable(state, { payableId: state.payables![0].id, amount: 100, method: 'Efectivo', date: isoDate() })).state
    state = apply(state, ops.adjustStock(state, { productId: 'collar', qty: 1, kind: 'consumo', note: 'Se rompió' })).state
    state = apply(state, ops.savePayable(state, { date: isoDate(), dueDate: isoDate(), supplierName: 'Empresa eléctrica', invoice: '', concept: 'Luz', category: 'Luz', amount: 300 })).state
    return state
  }

  for (const regime of [undefined, 'general', 'pequeno'] as const) {
    it(`cada partida cuadra y el balance iguala activo con pasivo más patrimonio (${regime ?? 'sin régimen'})`, () => {
      const state = busyState(regime)
      const entries = balancedJournal(state)
      const sheet = balanceSheet(entries, '9999-12-31')
      expect(Math.round(sheet.totalAssets * 100)).toBe(Math.round((sheet.totalLiabilities + sheet.totalEquity) * 100))
    })
  }

  it('el estado de resultados resta costo de ventas y gastos', () => {
    const state = busyState()
    const entries = buildJournal(state)
    const statement = incomeStatement(entries, '0000-01-01', '9999-12-31')
    const income = state.movements.filter((item) => item.type === 'ingreso').reduce((sum, item) => sum + item.amount, 0)
    expect(statement.totalRevenue).toBe(income)
    expect(statement.cost).toBeGreaterThan(0)
    expect(statement.net).toBe(Math.round((statement.gross - statement.totalPayroll - statement.totalExpenses - statement.taxes) * 100) / 100)
  })

  it('en régimen general separa el IVA de la venta y de la compra', () => {
    const entries = buildJournal(busyState('general'))
    const rows = balances(entries)
    expect(rows.find((row) => row.code === '2105')?.balance ?? 0).toBeGreaterThanOrEqual(0)
    const sale = entries.find((entry) => entry.concept.startsWith('Venta'))!
    const iva = sale.lines.find((line) => line.code === '2104')!.credit
    expect(iva).toBe(Math.round((247 - 247 / 1.12) * 100) / 100)
  })

  it('en régimen general solo cobra IVA a los cobros facturados', () => {
    const seed: AppState = { ...createSeed(), settings: { ...createSeed().settings, taxRegime: 'general' }, movements: [], sales: [], stockMoves: [] }
    const billed = apply(seed, ops.recordSale(seed, { clientName: 'Ana', phone: '', lines: [{ name: 'Baño', qty: 1, price: 112 }], discount: 0, method: 'Efectivo', invoiced: true }))
    const plain = apply(billed.state, ops.recordSale(billed.state, { clientName: 'Luis', phone: '', lines: [{ name: 'Baño', qty: 1, price: 112 }], discount: 0, method: 'Efectivo', invoiced: false }))
    const entries = buildJournal(plain.state)
    const ivaOf = (name: string) => entries.find((entry) => entry.concept.includes(name))?.lines.find((line) => line.code === '2104')?.credit ?? 0
    expect(ivaOf('Ana')).toBe(Math.round((112 - 112 / 1.12) * 100) / 100)
    expect(ivaOf('Luis')).toBe(0)
  })
})

describe('clientes', () => {
  it('junta visitas y compras por teléfono', () => {
    const seed = createSeed()
    const sold = apply(seed, ops.recordSale(seed, { clientName: 'María López', phone: '55551007', lines: [{ productId: 'snack', name: 'Snack', qty: 1, price: 28 }], discount: 0, method: 'Efectivo' })).state
    const maria = clientProfiles(sold).find((item) => item.name === 'María López')!
    expect(maria.pets.map((pet) => pet.name)).toContain('Nube')
    expect(maria.products).toBe(28)
    expect(maria.sales).toHaveLength(1)
  })
})

describe('alertas', () => {
  it('señala citas de hoy, cortes pendientes, WhatsApp, metas y tareas vencidas', () => {
    const seed = createSeed()
    const today = isoDate()
    const yesterday = addDays(today, -1)
    const admin = { ...seed.users[0], permissions: defaultsFor('Administrador') }
    const rosa = { id: 'w1', name: 'Rosa', lastName: 'Méndez', username: 'rosa', password: '', role: 'Recepción' as const, active: true, employeeCode: '1001', servicesGoal: 40 }
    const state: AppState = {
      ...seed,
      users: [admin, rosa],
      appointments: [
        { ...seed.appointments[0], id: 'a-hoy', date: today, status: 'pendiente', time: '10:00', petName: 'Nube' },
        { ...seed.appointments[0], id: 'a-otra', date: yesterday, status: 'pendiente', time: '11:00', petName: 'Max' },
      ],
      movements: [
        ...seed.movements,
        { id: 'm-open', type: 'ingreso', date: yesterday, concept: 'Cobro', amount: 100, method: 'Efectivo', notes: '', document: 'ING-900' },
      ],
      cashCloses: (seed.cashCloses ?? []).filter((item) => item.date < yesterday),
      conversations: seed.conversations.map((item, index) => ({ ...item, unread: index === 0 ? 2 : 0 })),
      tasks: [{ id: 't1', title: 'Reponer shampoo', detail: '', priority: 'alta', status: 'pendiente', dueDate: yesterday, createdAt: yesterday }],
      sales: [],
    }
    const alerts = buildAlerts(state, admin, today)
    expect(alerts.map((item) => item.kind).sort()).toEqual(['caja', 'citas', 'metas', 'tareas', 'whatsapp'].sort())
    expect(openCashDays(state, today)).toContain(yesterday)
    expect(alertBadges(state, admin, today)['/admin']).toBe(1)
    expect(alertBadges(state, admin, today)['/admin/corte']).toBeGreaterThan(0)
    expect(alertBadges(state, admin, today)['/admin/whatsapp']).toBe(1)
    expect(alertBadges(state, admin, today)['/admin/tareas']).toBe(1)
  })
})
