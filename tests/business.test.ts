import { describe, expect, it } from 'vitest'
import { clientProfiles } from '../src/clients'
import { isoDate } from '../src/format'
import { balanceSheet, balances, buildJournal, incomeStatement } from '../src/ledger'
import * as ops from '../src/ops'
import type { Op } from '../src/ops'
import { laborLiability, payrollLine } from '../src/payroll'
import { createSeed } from '../src/seed'
import type { AppState } from '../src/types'

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
})

describe('contabilidad', () => {
  function busyState(regime?: 'general' | 'pequeno') {
    let state: AppState = { ...createSeed(), settings: { ...createSeed().settings, taxRegime: regime } }
    state = withSupplier(state).state
    const supplierId = state.suppliers![0].id
    state = apply(state, ops.recordPurchase(state, { date: isoDate(), supplierId, invoice: 'F-1', withTax: true, lines: [{ productId: 'collar', description: 'Collar', qty: 5, cost: 22.4 }, { description: 'Toallas', qty: 1, cost: 56 }], terms: 'credito', notes: '' })).state
    state = apply(state, ops.recordSale(state, { clientName: 'Eva', phone: '', lines: [{ productId: 'collar', name: 'Collar', qty: 3, price: 45 }, { name: 'Baño', qty: 1, price: 112 }], discount: 0, method: 'Tarjeta' })).state
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
