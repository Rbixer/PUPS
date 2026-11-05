import { describe, expect, it } from 'vitest'
import { CONTROL_COLUMNS, controlAuto, controlSheet } from '../src/control'
import { emptyReport } from '../src/grooming'
import { createSeed } from '../src/seed'
import type { Appointment, AppState, Movement, PayrollLine } from '../src/types'

const move = (patch: Partial<Movement> & Pick<Movement, 'id' | 'type' | 'date' | 'amount'>): Movement => ({ concept: '', method: 'Efectivo', notes: '', document: '', ...patch })

const groomed = (folio: number, date: string, packageId: 'basico' | 'estandar' | 'premium', service = 'Grooming'): Appointment =>
  ({ id: `a${folio}`, folio, date, time: '09:00', status: 'completada', service, cost: 0, report: { ...emptyReport(), packageId } }) as Appointment

const line = (patch: Partial<PayrollLine>): PayrollLine =>
  ({ userId: 'u', name: 'Ana', code: 'A', salary: 3000, servicesBase: 0, services: 0, commissionRate: 0, commission: 0, bonus: 250, extra: 0, deductions: 0, igss: 145, net: 0, employerIgss: 0, aguinaldo: 0, bono14: 0, vacaciones: 0, indemnizacion: 0, ...patch }) as PayrollLine

function state(): AppState {
  const seed = createSeed()
  return {
    ...seed,
    appointments: [
      { ...groomed(1, '2025-03-04', 'premium'), cost: 220 },
      groomed(2, '2025-03-05', 'estandar'),
      groomed(3, '2025-03-06', 'basico'),
      { ...groomed(4, '2025-03-07', 'premium'), status: 'pendiente' },
      { ...groomed(5, '2025-03-08', 'estandar', 'Hospedaje 2 noches'), report: undefined },
    ],
    fixedCosts: [
      { id: 'f-luz', name: 'Luz EEGSA', category: 'Luz', amount: 400, day: 5, active: true },
      { id: 'f-local', name: 'Alquiler del local', category: 'Alquiler', amount: 3500, day: 1, active: true },
      { id: 'f-net', name: 'Internet Tigo', category: 'Teléfono e internet', amount: 300, day: 10, active: true },
      { id: 'f-app', name: 'App de reservas', category: 'Otros gastos', amount: 150, day: 10, active: true },
    ],
    payrolls: [{ id: 'p1', period: '2025-03', paidAt: '2025-03-31', method: 'Transferencia', document: 'E-9', payableId: 'cxp-igss', lines: [line({ commission: 120, extra: 80 })] }],
    payables: [
      { id: 'cxp-igss', number: 'CXP-1', date: '2025-03-31', dueDate: '2025-04-20', supplierName: 'IGSS', invoice: '', concept: 'IGSS', category: 'IGSS', amount: 400, payments: [], payrollId: 'p1' },
      { id: 'cxp-pet', number: 'CXP-2', date: '2025-03-02', dueDate: '2025-04-02', supplierName: 'Pet Depot', invoice: '', concept: 'Shampoo', category: 'Insumos de grooming', amount: 900, payments: [], purchaseId: 'c1' },
    ],
    sales: [
      { id: 's1', number: 'V-1', date: '2025-03-10', at: '', channel: 'mostrador', clientName: '', phone: '', lines: [{ productId: 'snack', name: 'Snack', qty: 3, price: 25 }, { name: 'Corte de uñas', qty: 1, price: 40 }], discount: 0, total: 115, method: 'Efectivo', status: 'pagada', document: '' },
      { id: 's2', number: 'V-2', date: '2025-03-11', at: '', channel: 'tienda', clientName: '', phone: '', lines: [{ productId: 'snack', name: 'Snack', qty: 9, price: 25 }], discount: 0, total: 225, method: 'Pedido', status: 'por cobrar', document: '' },
    ],
    movements: [
      move({ id: 'i1', type: 'ingreso', date: '2025-03-04', amount: 220, folio: 1, concept: 'Servicio cita #1' }),
      move({ id: 'i2', type: 'ingreso', date: '2025-03-08', amount: 300, folio: 5, concept: 'Servicio cita #5' }),
      move({ id: 'i3', type: 'ingreso', date: '2025-03-09', amount: 75, concept: 'Baño a domicilio' }),
      move({ id: 'i4', type: 'ingreso', date: '2025-03-10', amount: 115, saleId: 's1', concept: 'Venta V-1' }),
      move({ id: 'i5', type: 'ingreso', date: '2025-03-11', amount: 225, saleId: 's2', method: 'Pedido', concept: 'Tienda · Luis' }),
      move({ id: 'i6', type: 'ingreso', date: '2025-03-12', amount: 5000, category: 'Aporte de capital', concept: 'Aporte' }),
      move({ id: 'i7', type: 'ingreso', date: '2025-03-13', amount: 50, saleId: 's9', concept: 'Venta V-9' }),
      move({ id: 'r7', type: 'egreso', date: '2025-03-14', amount: 50, saleId: 's9', reverses: 'i7', category: 'Devolución de venta', concept: 'Devolución V-9' }),
      move({ id: 'e1', type: 'egreso', date: '2025-03-05', amount: 400, fixedId: 'f-luz', category: 'Luz', concept: 'Luz EEGSA · 2025-03' }),
      move({ id: 'e2', type: 'egreso', date: '2025-03-01', amount: 3500, fixedId: 'f-local', category: 'Alquiler', concept: 'Alquiler del local · 2025-03' }),
      move({ id: 'e3', type: 'egreso', date: '2025-03-10', amount: 300, fixedId: 'f-net', category: 'Teléfono e internet', concept: 'Internet Tigo · 2025-03' }),
      move({ id: 'e4', type: 'egreso', date: '2025-03-10', amount: 150, fixedId: 'f-app', category: 'Otros gastos', concept: 'App de reservas · 2025-03' }),
      move({ id: 'e5', type: 'egreso', date: '2025-03-31', amount: 3305, payrollId: 'p1', category: 'Planilla', concept: 'Planilla 2025-03' }),
      move({ id: 'e6', type: 'egreso', date: '2025-03-31', amount: 400, payableId: 'cxp-igss', category: 'IGSS', concept: 'Pago CXP-1 · IGSS' }),
      move({ id: 'e7', type: 'egreso', date: '2025-03-20', amount: 900, payableId: 'cxp-pet', category: 'Insumos de grooming', concept: 'Pago CXP-2 · Pet Depot' }),
      move({ id: 'e8', type: 'egreso', date: '2025-03-21', amount: 800, category: 'Pago de impuestos SAT', concept: 'IVA febrero' }),
      move({ id: 'e9', type: 'egreso', date: '2025-03-22', amount: 1000, category: 'Pago de préstamo', concept: 'Cuota banco' }),
      move({ id: 'e10', type: 'egreso', date: '2025-03-23', amount: 60, category: 'Mantenimiento', concept: 'Foco' }),
      move({ id: 'x1', type: 'egreso', date: '2024-03-23', amount: 999, category: 'Mantenimiento', concept: 'Otro año' }),
    ],
    controlRows: [],
  }
}

describe('control general automático', () => {
  it('reparte los ingresos del mes por tipo', () => {
    const march = controlAuto(state(), 2025)[2]
    expect(march.servicio).toBe(220)
    expect(march.hospedaje).toBe(300)
    expect(march.hospedajeCant).toBe(1)
    expect(march.domicilio).toBe(75)
    expect(march.domicilioCant).toBe(1)
    expect(march.bien).toBe(115)
  })

  it('reparte los gastos por rubro sin contar dos veces la planilla', () => {
    const march = controlAuto(state(), 2025)[2]
    expect(march.local).toBe(3500)
    expect(march.luz).toBe(400)
    expect(march.internet).toBe(300)
    expect(march.afp).toBe(150)
    expect(march.impuesto).toBe(800)
    expect(march.prestamo).toBe(1000)
    expect(march.comision).toBe(120)
    expect(march.deas).toBe(80)
    expect(march.planilla).toBe(3305 - 120 - 80 + 400)
    expect(march.proveedores).toBe(900)
    expect(march.gastos).toBe(60)
  })

  it('cuenta paquetes con constancia, unidades vendidas y la diferencia con la meta', () => {
    const march = controlAuto(state(), 2025, 10)[2]
    expect([march.basico, march.estandar, march.premium]).toEqual([1, 1, 1])
    expect(march.ventas).toBe(3)
    expect(march.diferencia).toBe(7)
  })

  it('deja otros años fuera y los meses sin datos en cero', () => {
    const months = controlAuto(state(), 2025)
    expect(months[1].gastos).toBe(0)
    expect(months[1].servicio).toBe(0)
    expect(months[1].diferencia).toBe(0)
    expect(months[2].diferencia).toBe(347)
  })

  it('la cifra escrita a mano manda y el resto sigue automático', () => {
    const base = state()
    const sheet = controlSheet(2025, [{ year: 2025, month: 3, values: { luz: 450, extra: 30 } }], base)
    const march = sheet.months[2]
    expect(march.values.luz).toBe(450)
    expect(march.auto.luz).toBe(400)
    expect(march.manual).toEqual({ luz: true, deas: true })
    expect(march.values.deas).toBe(30)
    expect(march.values.local).toBe(3500)
    expect(march.ingresos).toBe(220 + 300 + 75 + 115)
    expect(march.gastos).toBe(3500 + 450 + 300 + 150 + 800 + 1000 + 120 + 30 + 3505 + 900 + 60)
    expect(march.disponible).toBe(march.ingresos - march.gastos)
    expect(sheet.totals.values.luz).toBe(450)
    expect(sheet.totals.paquetes).toBe(3)
  })

  it('sin estado de la app se comporta como la hoja manual de antes', () => {
    const sheet = controlSheet(2025, [{ year: 2025, month: 1, values: { hospedaje: 100, local: 40 } }])
    expect(sheet.months[0].disponible).toBe(60)
    expect(sheet.totals.ingresos).toBe(100)
  })

  it('el Excel suma las columnas correctas', async () => {
    const { workbookFor, controlPdfBytes } = await import('../src/controlExport')
    const pdf = new TextDecoder('latin1').decode(controlPdfBytes(controlSheet(2025, [], state())))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain(Buffer.from('Días extras', 'latin1').toString('hex'))
    const grid = workbookFor(controlSheet(2025, [], state())).getWorksheet('Control general')!
    const labels = (grid.getRow(5).values as unknown[]).slice(2)
    expect(labels).toEqual(CONTROL_COLUMNS.map((column) => column.label))
    const formula = (column: number) => (grid.getRow(8).getCell(column).value as { formula: string; result: number })
    expect(formula(19)).toEqual({ formula: 'SUM(F8:R8)', result: controlSheet(2025, [], state()).months[2].gastos })
    expect(formula(20).formula).toBe('SUM(B8:E8)-S8')
    expect(formula(21).formula).toBe('SUM(B8:E8)')
    expect(formula(25).formula).toBe('SUM(V8:X8)')
    expect(grid.pageSetup.printArea).toBe('A1:AC20')
  })

  it('cada columna de la hoja es un campo o un cálculo', () => {
    expect(CONTROL_COLUMNS).toHaveLength(28)
    expect(CONTROL_COLUMNS.every((column) => Boolean(column.field) !== Boolean(column.calc))).toBe(true)
  })
})
