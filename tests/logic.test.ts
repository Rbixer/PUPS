import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allows, defaultsFor, expandLegacyPermissions, homeFor, PERMISSIONS_VERSION, resolvePermissions } from '../src/access'
import { backupDueDays, parseBackup, snoozeBackupReminder } from '../src/backup'
import { hashSecret, verifySecret, weakSecret } from '../server/api'
import { addDays, daysBetween, money, normalizePhone, parseAmount, publicSiteContent, safeLink } from '../src/format'
import { emptyReport, hardAreas, readReport } from '../src/grooming'
import { buildMonthReport, packageOfAppointment } from '../src/report'
import type { Mark } from '../src/types'
import { ACCOUNTING_LINKS, MODULE_GROUPS } from '../src/modules'
import { EMPLOYEE_CREDIT, employeeOwed, recordEmployeePurchase, settleEmployeeCredit } from '../src/ops'
import { createSeed, DATA_VERSION } from '../src/seed'
import { applyShopOrder, BASE_CATEGORY_NAMES, categoryNames, demoCatalog, normalizeCategory } from '../src/shop'
import { nextPetCode, planOf, priceFor, resolvePetCode, SLOT_CAPACITY, slotCount, slotTaken } from '../src/visit'

describe('formato', () => {
  it('normaliza teléfonos de Guatemala', () => {
    expect(normalizePhone('5555 1234')).toBe('+502 55551234')
    expect(normalizePhone('502 5555 1234')).toBe('+502 55551234')
    expect(normalizePhone('+1 305 555 0100')).toBe('+1 305 555 0100')
  })

  it('suma días y cuenta diferencias entre fechas ISO', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-10-01', '2026-10-27')).toBe(26)
  })

  it('da formato de quetzales', () => {
    expect(money(155)).toContain('155.00')
    expect(money(1234.5)).toContain('1,234.50')
  })

  it('la clave se guarda con scrypt, con sal distinta cada vez, y distingue mayúsculas', () => {
    const first = hashSecret('pups2026')
    expect(first).toMatch(/^scrypt\$/)
    expect(hashSecret('pups2026')).not.toBe(first)
    expect(verifySecret(first, 'pups2026')).toBe(true)
    expect(verifySecret(first, 'Pups2026')).toBe(false)
    expect(verifySecret('ba20fa37d86c34de9718be9356f63c618008fe45a876f9561aca1d23a8733bfb', 'pups2026')).toBe(true)
    expect(verifySecret('pups2026', 'pups2026')).toBe(false)
    expect(weakSecret('pups2026')).toBe(true)
    expect(weakSecret('corta')).toBe(true)
    expect(weakSecret('una clave larga')).toBe(false)
  })

  it('lee montos escritos con coma o punto', () => {
    expect(parseAmount('Q 1,500.50')).toBe(1500.5)
    expect(parseAmount('1.500,50')).toBe(1500.5)
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount('1,500')).toBe(1500)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('doce')).toBeNaN()
  })

  it('el enlace del aviso solo acepta rutas del sitio o https', () => {
    expect(safeLink(' /reservar ')).toBe('/reservar')
    expect(safeLink('https://facebook.com/pups')).toBe('https://facebook.com/pups')
    expect(safeLink('javascript:alert(1)')).toBe('')
    expect(safeLink('//otro-sitio.com')).toBe('')
    expect(safeLink('http://facebook.com')).toBe('')
    expect(safeLink(undefined)).toBe('')
  })

  it('el sitio público solo recibe contenido limpio', () => {
    const site = publicSiteContent({
      facebook: '/pagina',
      instagram: 'https://instagram.com/pups',
      reviews: [
        { name: ' Ana ', text: ' Muy bien ' },
        { name: '', text: 'Sin nombre' },
        { name: 'Luis', text: 'x'.repeat(500) },
      ],
      gallery: [
        { src: '/api/media/abc.jpg', caption: ' Max ' },
        { src: 'javascript:alert(1)', caption: 'mala' },
        { src: '//otro.com/foto.jpg', caption: 'externa' },
      ],
    })
    expect(site.facebook).toBe('')
    expect(site.instagram).toBe('https://instagram.com/pups')
    expect(site.reviews).toEqual([
      { name: 'Ana', text: 'Muy bien' },
      { name: 'Luis', text: 'x'.repeat(400) },
    ])
    expect(site.gallery).toEqual([{ src: '/api/media/abc.jpg', caption: 'Max' }])
    expect(publicSiteContent({ reviews: Array.from({ length: 20 }, () => ({ name: 'A', text: 'B' })) }).reviews).toHaveLength(12)
  })
})

describe('tarifas y agenda', () => {
  it('cobra por plan y tamaño', () => {
    expect(priceFor('grooming', 'Pequeño')).toBe(155)
    expect(priceFor('premium', 'Grande')).toBe(340)
    expect(priceFor('grooming', 'Gigante')).toBeNull()
  })

  it('reconoce el plan premium por servicio', () => {
    const [appointment] = createSeed().appointments
    expect(planOf({ ...appointment, service: 'Grooming premium', report: undefined })).toBe('premium')
    expect(planOf({ ...appointment, service: 'Baño y corte', report: undefined })).toBe('grooming')
  })

  it('permite hasta 3 citas en el mismo horario y respeta las canceladas', () => {
    const base = createSeed().appointments[0]
    const at = (id: string, status: 'pendiente' | 'cancelada' = 'pendiente') => ({
      ...base,
      id,
      date: '2030-01-10',
      time: '10:00',
      status,
      service: 'Baño y corte' as const,
    })
    const one = [at('x1')]
    const two = [at('x1'), at('x2')]
    const three = [at('x1'), at('x2'), at('x3')]
    expect(slotTaken(one, '2030-01-10', '10:30', 'Baño y corte')).toBe(false)
    expect(slotTaken(two, '2030-01-10', '10:00', 'Baño y corte')).toBe(false)
    expect(slotTaken(three, '2030-01-10', '10:00', 'Baño y corte')).toBe(true)
    expect(slotTaken(three, '2030-01-10', '12:00', 'Baño y corte')).toBe(false)
    expect(slotTaken(three, '2030-01-11', '10:00', 'Baño y corte')).toBe(false)
    expect(slotTaken([at('x1', 'cancelada'), at('x2'), at('x3')], '2030-01-10', '10:00', 'Baño y corte')).toBe(false)
  })
})

describe('constancia', () => {
  it('conserva las fotos viejas en su lugar y suma la segunda de durante al final', () => {
    const old = { ...emptyReport(), photos: ['antes', 'durante', 'despues'] }
    expect(readReport(old).photos).toEqual(['antes', 'durante', 'despues', ''])
  })

  it('toma el comportamiento de la visita más reciente que marcó cada área', () => {
    const report = (bano: Mark, unas: Mark) => ({ ...emptyReport(), behavior: { bano: { value: bano, note: '' }, unas: { value: unas, note: '' } } })
    const hard = hardAreas([report('no', ''), report('si', 'si'), undefined])
    expect(hard.map((area) => area.key)).toEqual(['unas'])
  })
})

describe('permisos', () => {
  it('el administrador lo puede todo y recepción no administra el equipo', () => {
    const admin = { role: 'Administrador' as const, permissions: undefined, active: true }
    const front = { role: 'Recepción' as const, permissions: undefined, active: true }
    expect(allows(admin, 'equipo')).toBe(true)
    expect(allows(front, 'equipo')).toBe(false)
    expect(allows({ ...admin, active: false }, 'citas')).toBe(false)
    expect(allows(null, 'citas')).toBe(false)
  })

  it('respeta permisos marcados uno por uno y manda a la primera pantalla permitida', () => {
    const custom = { role: 'Recepción' as const, permissions: ['whatsapp' as const], permissionsVersion: PERMISSIONS_VERSION, active: true }
    expect(resolvePermissions(custom)).toEqual(['whatsapp'])
    expect(homeFor(custom)).toBe('/admin/whatsapp')
    expect(homeFor({ ...custom, permissions: [] })).toBe('/admin/asistencia')
    expect(defaultsFor('Administrador').length).toBeGreaterThan(defaultsFor('Recepción').length)
  })

  it('expande caja y compras legacy y no lo hace con versión 2', () => {
    const legacy = { role: 'Recepción' as const, permissions: ['caja' as const, 'compras' as const], active: true }
    const resolved = resolvePermissions(legacy)
    expect(resolved).toEqual(expect.arrayContaining(['caja', 'corte', 'movimientos', 'anular', 'compras', 'inventario', 'ajustar']))
    expect(expandLegacyPermissions(['caja'])).toEqual(expect.arrayContaining(['caja', 'corte', 'movimientos', 'anular']))
    const v2 = { ...legacy, permissions: ['caja' as const], permissionsVersion: PERMISSIONS_VERSION }
    expect(resolvePermissions(v2)).toEqual(['caja'])
    expect(allows({ role: 'Recepción', permissions: undefined, active: true }, 'corte')).toBe(false)
    expect(allows({ role: 'Recepción', permissions: undefined, active: true }, 'movimientos')).toBe(true)
    expect(allows({ role: 'Recepción', permissions: undefined, active: true }, 'anular')).toBe(false)
  })
})

describe('reportería', () => {
  it('el resultado es ingresos menos egresos y los cobros salen de citas completadas', () => {
    const state = createSeed()
    const month = state.appointments.find((item) => item.status === 'completada')!.date.slice(0, 7)
    const report = buildMonthReport(state, `${month}-01`)
    const sum = (type: 'ingreso' | 'egreso') =>
      state.movements.filter((item) => item.date.startsWith(month) && item.type === type).reduce((total, item) => total + item.amount, 0)
    expect(report.income).toBeCloseTo(sum('ingreso'), 2)
    expect(report.expense).toBeCloseTo(sum('egreso'), 2)
    expect(report.result).toBeCloseTo(report.income - report.expense, 2)
    expect(report.done.length).toBeGreaterThan(0)
    expect(report.done.every((item) => item.status === 'completada')).toBe(true)
    expect(report.sales).toBeCloseTo(report.done.reduce((total, item) => total + item.cost, 0), 2)
  })

  it('un mes sin movimiento da ceros y no rompe', () => {
    const report = buildMonthReport(createSeed(), '2019-01-01')
    expect(report.sales).toBe(0)
    expect(report.result).toBe(0)
    expect(report.average).toBe(0)
    expect(report.packages.map(([name]) => name)).toEqual(['Básico', 'Estándar', 'Premium'])
  })

  it('cuenta paquetes básico, estándar y premium en citas completadas', () => {
    const seed = createSeed()
    const base = seed.appointments.find((item) => item.status === 'completada')!
    const month = base.date.slice(0, 7)
    const withPacks = {
      ...seed,
      appointments: [
        { ...base, id: 'p1', folio: 9001, report: { ...emptyReport(), packageId: 'basico' as const, plan: 'grooming' as const }, cost: 100 },
        { ...base, id: 'p2', folio: 9002, report: { ...emptyReport(), packageId: 'estandar' as const, plan: 'grooming' as const }, cost: 150 },
        { ...base, id: 'p3', folio: 9003, report: { ...emptyReport(), packageId: 'premium' as const, plan: 'premium' as const }, cost: 220 },
        { ...base, id: 'p4', folio: 9004, status: 'pendiente' as const, report: { ...emptyReport(), packageId: 'premium' as const, plan: 'premium' as const }, cost: 220 },
      ],
    }
    expect(packageOfAppointment(withPacks.appointments[0])).toBe('basico')
    const report = buildMonthReport(withPacks, `${month}-01`)
    expect(Object.fromEntries(report.packages)).toMatchObject({
      Básico: { count: 1, amount: 100 },
      Estándar: { count: 1, amount: 150 },
      Premium: { count: 1, amount: 220 },
    })
    expect(report.premium).toBe(1)
  })
})

describe('respaldo', () => {
  const current = { sessionUserId: null, revision: 5 }

  it('acepta un respaldo propio y sube la revisión para ganar la sincronización', () => {
    const raw = JSON.stringify({ ...createSeed(), revision: 2 })
    const result = parseBackup(raw, current)
    expect('state' in result && result.state.revision).toBe(6)
    expect('state' in result && result.state.appointments.length).toBe(createSeed().appointments.length)
  })

  it('rechaza archivos que no son respaldos', () => {
    expect(parseBackup('no es json', current)).toEqual({ error: expect.stringContaining('respaldo') })
    expect(parseBackup('{"version":99}', current)).toEqual({ error: expect.stringContaining('respaldo') })
    expect(parseBackup(JSON.stringify({ version: DATA_VERSION, users: [], appointments: [], movements: [] }), current)).toEqual({
      error: expect.stringContaining('administrador'),
    })
  })

  it('conserva la sesión solo si la persona sigue activa en el respaldo', () => {
    const seed = createSeed()
    const admin = seed.users.find((user) => user.role === 'Administrador')!
    const kept = parseBackup(JSON.stringify(seed), { sessionUserId: admin.id, revision: 0 })
    expect('state' in kept && kept.state.sessionUserId).toBe(admin.id)
    const dropped = parseBackup(JSON.stringify(seed), { sessionUserId: 'otra-persona', revision: 0 })
    expect('state' in dropped && dropped.state.sessionUserId).toBeNull()
  })
})

describe('recordatorio de respaldo', () => {
  const store = new Map<string, string>()
  const day = 86_400_000

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
  })

  it('no avisa el primer día y avisa a la semana', () => {
    const start = Date.parse('2026-10-01T12:00:00Z')
    expect(backupDueDays(start)).toBeNull()
    expect(backupDueDays(start + 6 * day)).toBeNull()
    expect(backupDueDays(start + 8 * day)).toBe(8)
  })

  it('posponer silencia el aviso por unos días y luego vuelve', () => {
    const start = Date.parse('2026-10-01T12:00:00Z')
    backupDueDays(start)
    const late = start + 9 * day
    snoozeBackupReminder(3, late)
    expect(backupDueDays(late + day)).toBeNull()
    expect(backupDueDays(late + 4 * day)).toBe(13)
  })
})

describe('tienda', () => {
  it('descuenta la existencia y conserva el precio del momento', () => {
    const products = demoCatalog()
    const result = applyShopOrder(products, [{ id: 'shampoo-suave', qty: 2 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.total).toBe(170)
    expect(result.products.find((item) => item.id === 'shampoo-suave')?.stock).toBe(12)
    expect(products.find((item) => item.id === 'shampoo-suave')?.stock).toBe(14)
  })

  it('rechaza un pedido si no alcanza o el producto está oculto', () => {
    const products = demoCatalog().map((item) => (item.id === 'snack' ? { ...item, active: false } : item))
    expect(applyShopOrder(products, [{ id: 'shampoo-suave', qty: 99 }]).ok).toBe(false)
    expect(applyShopOrder(products, [{ id: 'snack', qty: 1 }]).ok).toBe(false)
    expect(applyShopOrder(products, []).ok).toBe(false)
  })

  it('migra categorías viejas y admite extras en settings', () => {
    expect(normalizeCategory('Shampoo')).toBe('Baño medicado')
    expect(normalizeCategory('Cuidado')).toBe('Baño medicado')
    expect(normalizeCategory('Snacks')).toBe('Alimento')
    expect(BASE_CATEGORY_NAMES).toEqual(['Accesorios', 'Alimento', 'Baño medicado', 'Consumible'])
    expect(categoryNames({ productCategories: ['Juguetes', 'Alimento'] })).toEqual([
      ...BASE_CATEGORY_NAMES,
      'Juguetes',
    ])
  })
})

describe('código de mascota', () => {
  it('asigna P-1001 y reusa el código de la misma mascota', () => {
    const seed = createSeed()
    const base = seed.appointments[0]
    expect(nextPetCode([])).toBe('P-1001')
    expect(nextPetCode([{ ...base, petCode: 'P-1005' }])).toBe('P-1006')
    const withCode = [{ ...base, petCode: 'P-1002' }]
    expect(resolvePetCode(withCode, { petName: base.petName, phone: base.phone, clientName: base.clientName })).toBe('P-1002')
    expect(resolvePetCode(withCode, { petName: 'Otra', phone: base.phone, clientName: base.clientName })).toBe('P-1003')
    expect(resolvePetCode(withCode, { petName: 'X', phone: '1', clientName: 'Y', petCode: 'P-9999' })).toBe('P-9999')
  })
})

describe('compras de empleado', () => {
  it('el crédito baja inventario, no mueve caja y se cobra aparte', () => {
    const state = createSeed()
    const worker = state.users.find((item) => item.active)!
    const product = state.products.find((item) => item.active && item.stock > 0)!
    const beforeStock = product.stock
    const beforeMoves = state.movements.length
    const credit = recordEmployeePurchase(state, {
      employeeId: worker.id,
      credit: true,
      method: 'Efectivo',
      lines: [{ productId: product.id, name: product.name, qty: 1, price: product.price }],
    })
    expect(credit.ok).toBe(true)
    if (!credit.ok) return
    expect(credit.value.method).toBe(EMPLOYEE_CREDIT)
    expect(credit.value.status).toBe('por cobrar')
    expect(credit.patch.movements).toBeUndefined()
    expect(credit.patch.products?.find((item) => item.id === product.id)?.stock).toBe(beforeStock - 1)
    const owed = employeeOwed({ sales: credit.patch.sales, payrolls: state.payrolls }, worker.id)
    expect(owed).toBe(credit.value.total)
    const next = { ...state, ...credit.patch }
    const settle = settleEmployeeCredit(next, credit.value.id, 'Efectivo')
    expect(settle.ok).toBe(true)
    if (!settle.ok) return
    expect(settle.value.amount).toBe(credit.value.total)
    expect(settle.patch.sales?.find((item) => item.id === credit.value.id)?.status).toBe('pagada')
    expect(employeeOwed({ sales: settle.patch.sales, payrolls: state.payrolls }, worker.id)).toBe(0)
    expect((settle.patch.movements ?? []).length).toBe(beforeMoves + 1)
  })
})

describe('conforme', () => {
  it('localiza la constancia por ackToken y guarda ackedAt solo una vez', () => {
    const state = createSeed()
    const appointment = state.appointments.find((item) => item.report) ?? state.appointments[0]
    const token = 'tok-conforme-test'
    const stamped = {
      ...appointment,
      report: { ...(appointment.report ?? emptyReport()), ackToken: token },
    }
    const withToken = { ...state, appointments: state.appointments.map((item) => (item.id === stamped.id ? stamped : item)) }
    const found = withToken.appointments.find((item) => item.report?.ackToken === token)
    expect(found?.id).toBe(stamped.id)
    const ackedAt = '2030-01-10T12:00:00.000Z'
    const once = {
      ...stamped,
      report: { ...stamped.report!, ackedAt },
    }
    expect(once.report.ackedAt).toBe(ackedAt)
    expect(once.report.ackToken).toBe(token)
  })
})

describe('módulos contables', () => {
  it('saca compras, gastos, por pagar y planilla del lanzador y los deja en Contabilidad', () => {
    const launcher = MODULE_GROUPS.flatMap((group) => group.links.map((link) => link.to))
    expect(launcher).not.toContain('/admin/compras')
    expect(launcher).not.toContain('/admin/gastos')
    expect(launcher).not.toContain('/admin/por-pagar')
    expect(launcher).not.toContain('/admin/planilla')
    expect(launcher).toContain('/admin/inventario')
    expect(launcher).toContain('/admin/contabilidad')
    expect(ACCOUNTING_LINKS.map((link) => link.to)).toEqual([
      '/admin/compras',
      '/admin/gastos',
      '/admin/por-pagar',
      '/admin/planilla',
    ])
  })
})
