import { describe, expect, it } from 'vitest'
import { allows, defaultsFor, homeFor, resolvePermissions } from '../src/access'
import { parseBackup } from '../src/backup'
import { addDays, daysBetween, hashPassword, money, normalizePhone } from '../src/format'
import { buildMonthReport } from '../src/report'
import { createSeed, DATA_VERSION } from '../src/seed'
import { planOf, priceFor, slotTaken } from '../src/visit'

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

  it('la clave se cifra igual cada vez y distingue mayúsculas', async () => {
    const first = await hashPassword('pups2026')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashPassword(' pups2026 ')).toBe(first)
    expect(await hashPassword('Pups2026')).not.toBe(first)
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

  it('detecta horarios ocupados y respeta las citas canceladas', () => {
    const base = createSeed().appointments[0]
    const busy = { ...base, id: 'x1', date: '2030-01-10', time: '10:00', status: 'pendiente' as const, service: 'Baño y corte' }
    expect(slotTaken([busy], '2030-01-10', '10:30', 'Baño y corte')).toBe(true)
    expect(slotTaken([busy], '2030-01-10', '12:00', 'Baño y corte')).toBe(false)
    expect(slotTaken([busy], '2030-01-11', '10:00', 'Baño y corte')).toBe(false)
    expect(slotTaken([{ ...busy, status: 'cancelada' }], '2030-01-10', '10:00', 'Baño y corte')).toBe(false)
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
    const custom = { role: 'Recepción' as const, permissions: ['whatsapp' as const], active: true }
    expect(resolvePermissions(custom)).toEqual(['whatsapp'])
    expect(homeFor(custom)).toBe('/admin/whatsapp')
    expect(homeFor({ ...custom, permissions: [] })).toBe('/admin/sin-acceso')
    expect(defaultsFor('Administrador').length).toBeGreaterThan(defaultsFor('Recepción').length)
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
