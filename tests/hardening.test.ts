import { describe, expect, it } from 'vitest'
import { addDays, isoDate } from '../src/format'
import { buildJournal, purchaseLines, taxMonths, type Entry } from '../src/ledger'
import * as ops from '../src/ops'
import type { Op } from '../src/ops'
import { payrollLine, workedShare } from '../src/payroll'
import { createSeed } from '../src/seed'
import { mergeOffline } from '../src/store'
import type { Appointment, AppState, Movement, User } from '../src/types'

function apply<T>(state: AppState, result: Op<T>) {
  if (!result.ok) throw new Error(result.error)
  return { state: { ...state, ...result.patch }, value: result.value }
}

const today = isoDate()
const yesterday = addDays(today, -1)

function visit(patch: Partial<Appointment> = {}): Appointment {
  return {
    id: 'cita-x',
    folio: 5000,
    petName: 'Toby',
    date: yesterday,
    time: '10:00',
    status: 'completada',
    clientName: 'Ana',
    phone: '+50255550000',
    sex: 'Macho',
    breed: '',
    service: 'Baño y corte',
    size: 'Pequeño',
    coat: '',
    allergies: '',
    cost: 150,
    ...patch,
  }
}

describe('cobro de citas', () => {
  it('pide permiso de caja y rechaza el medio Pedido', () => {
    const seed = createSeed()
    expect(ops.chargeAppointment(seed, visit(), 'Efectivo', false).ok).toBe(false)
    expect(ops.chargeAppointment(seed, visit(), 'Pedido', true).ok).toBe(false)
  })

  it('una cita de un día con caja cerrada se cobra con fecha de hoy', () => {
    const seed: AppState = { ...createSeed(), cashCloses: [{ id: 'c1', date: yesterday, opening: 0, expected: 0, counted: 0, difference: 0, note: '', closedAt: '' } as never] }
    const charged = apply(seed, ops.chargeAppointment(seed, visit(), 'Tarjeta', true))
    const income = charged.state.movements.find((item) => item.folio === 5000)!
    expect(income).toMatchObject({ date: today, amount: 150, method: 'Tarjeta' })
  })

  it('no mueve un cobro de un día ya cerrado', () => {
    const seed = createSeed()
    const charged = apply(seed, ops.chargeAppointment(seed, visit(), 'Efectivo', true)).state
    const closed: AppState = { ...charged, cashCloses: [{ id: 'c1', date: yesterday } as never] }
    expect(ops.chargeAppointment(closed, visit({ cost: 200 }), undefined, true).ok).toBe(false)
  })
})

describe('pedidos y anulaciones en la contabilidad', () => {
  it('un pedido por cobrar no entra a la contabilidad hasta cobrarse', () => {
    const seed = createSeed()
    const placed = apply(seed, ops.placeOrder(seed, { name: 'Luis', phone: '55553333', lines: [{ id: 'snack', qty: 1 }] }))
    const movement = placed.state.movements[0]
    const booked = (state: AppState) => buildJournal(state).filter((entry) => entry.ref === movement.document)
    expect(booked(placed.state)).toEqual([])
    const settled = apply(placed.state, ops.settleOrder(placed.state, movement.id, 'Efectivo')).state
    const lines = booked(settled).flatMap((entry) => entry.lines)
    expect(lines).toContainEqual({ code: '1101', debit: 28, credit: 0 })
    expect(lines).toContainEqual({ code: '4102', debit: 0, credit: 28 })
  })

  it('el corte de caja ignora los pedidos por cobrar', () => {
    const seed = createSeed()
    const placed = apply(seed, ops.placeOrder(seed, { name: 'Luis', phone: '55553333', lines: [{ id: 'snack', qty: 1 }] })).state
    const before = ops.cashSummary(seed.movements, today, 0)
    const after = ops.cashSummary(placed.movements, today, 0)
    expect(after.income).toBe(before.income)
    expect(after.expected).toBe(before.expected)
    expect(after.pending).toBe(before.pending + 28)
  })
})

describe('compras', () => {
  it('reparte la compra con IVA sin perder centavos', () => {
    const lines = purchaseLines({
      id: 'p',
      number: 'COM-1',
      date: today,
      supplierName: 'X',
      invoice: '',
      withTax: true,
      lines: [
        { productId: 'collar', description: 'Collar', qty: 3, cost: 33.33 },
        { description: 'Toallas', qty: 1, cost: 10.01 },
      ],
      total: 110,
      terms: 'contado',
      notes: '',
    })
    const debit = lines.reduce((sum, line) => sum + line.debit, 0)
    expect(Math.round(debit * 100)).toBe(11000)
  })
})

describe('catálogo', () => {
  it('editar un producto no cambia su existencia y el costo pide permiso de compras', () => {
    const seed = createSeed()
    const collar = seed.products!.find((item) => item.id === 'collar')!
    const edited = apply(seed, ops.saveProduct(seed, { ...collar, stock: 999, price: 50 }))
    expect(edited.value.stock).toBe(collar.stock)
    expect(edited.value.price).toBe(50)
    expect(ops.saveProduct(seed, { ...collar, cost: (collar.cost ?? 0) + 5 }, false).ok).toBe(false)
  })

  it('un producto nuevo entra con su existencia inicial en el kárdex', () => {
    const seed = createSeed()
    const created = apply(seed, ops.saveProduct(seed, { id: 'nuevo', name: 'Cepillo', detail: '', category: 'Accesorios', price: 60, unit: 'pieza', stock: 4, image: '/shop/x.jpg', cost: 30 }))
    expect(created.value.stock).toBe(4)
    expect(created.state.stockMoves?.[0]).toMatchObject({ productId: 'nuevo', qty: 4, kind: 'inicial' })
  })
})

describe('impuestos', () => {
  const entry = (id: string, date: string, lines: Entry['lines']): Entry => ({ id, date, ref: id, concept: id, lines })

  it('el IVA crédito que sobra pasa al mes siguiente', () => {
    const settings = { ...createSeed().settings, taxRegime: 'general' as const }
    const entries = [
      entry('a', '2026-01-10', [{ code: '1105', debit: 120, credit: 0 }]),
      entry('b', '2026-02-10', [{ code: '2104', debit: 0, credit: 50 }, { code: '4101', debit: 0, credit: 416.67 }]),
      entry('c', '2026-03-10', [{ code: '2104', debit: 0, credit: 100 }, { code: '4101', debit: 0, credit: 833.33 }]),
    ]
    const months = taxMonths(entries, settings, 2026)
    expect(months[0].payable).toBe(0)
    expect(months[1]).toMatchObject({ carried: 120, payable: 0 })
    expect(months[2]).toMatchObject({ carried: 70, payable: 30 })
  })

  it('cambiar de régimen guarda desde cuándo y respeta los meses anteriores', () => {
    const base = { ...createSeed().settings, taxRegime: 'pequeno' as const }
    const changed = ops.changeRegime(base, 'general', '2026-06-01')
    expect(ops.regimeOn(changed, '2026-05-31')).toBe('pequeno')
    expect(ops.regimeOn(changed, '2026-06-01')).toBe('general')
    const months = taxMonths([entry('v', '2026-03-10', [{ code: '4101', debit: 0, credit: 1000 }])], changed, 2026)
    expect(months[2]).toMatchObject({ regime: 'pequeno', payable: 50 })
    expect(months[6].regime).toBe('general')
  })
})

describe('planilla', () => {
  const worker: User = { id: 'w', name: 'Rosa', username: 'rosa', role: 'Recepción', active: true, employeeCode: '1001', salary: 3000 }

  it('quien entra a mitad de mes cobra la parte trabajada', () => {
    expect(workedShare('2026-03-16', '2026-03')).toBe(0.5)
    expect(workedShare('2026-04-01', '2026-03')).toBe(0)
    const line = payrollLine({ ...worker, hiredAt: '2026-03-16' }, [], '2026-03')
    expect(line.salary).toBe(1500)
    expect(line.bonus).toBe(125)
  })

  it('los descuentos no dejan el líquido en negativo', () => {
    const line = payrollLine(worker, [], '2026-03', { extra: 0, deductions: 99999 })
    expect(line.net).toBe(0)
  })
})

describe('consecutivos', () => {
  it('no reutiliza un número aunque el documento se borre', () => {
    const seed = ops.withCounters(createSeed())
    const last = seed.counters!.ING
    const trimmed: AppState = { ...seed, movements: seed.movements.filter((item) => item.type !== 'ingreso') }
    expect(ops.nextDocument(trimmed, 'ingreso')).toBe(`ING-${String(last + 1).padStart(3, '0')}`)
  })

  it('al volver la conexión, un documento hecho sin red que choca se renumera', () => {
    const seed = ops.withCounters(createSeed())
    const document = ops.nextDocument(seed, 'ingreso')
    const remoteMove: Movement = { id: 'remoto', type: 'ingreso', date: today, concept: 'Otro equipo', amount: 10, method: 'Efectivo', notes: '', document }
    const localMove: Movement = { ...remoteMove, id: 'local', concept: 'Sin red' }
    const merged = mergeOffline({ ...seed, movements: [remoteMove, ...seed.movements] }, { ...seed, movements: [localMove, ...seed.movements] })
    const local = merged.movements.find((item) => item.id === 'local')!
    expect(merged.movements.find((item) => item.id === 'remoto')!.document).toBe(document)
    expect(local.document).not.toBe(document)
    expect(new Set(merged.movements.map((item) => item.document)).size).toBe(merged.movements.length)
  })
})
