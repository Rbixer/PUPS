import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi, networkOf } from '../server/api'
import { SERVICE_NAMES } from '../src/catalog'
import { addDays, isoDate } from '../src/format'
import type { AppState } from '../src/types'

const dataDir = path.resolve(__dirname, `.tmp-server-${process.pid}`)
let server: http.Server
let base = ''

async function call(method: string, at: string, body?: unknown, token?: string) {
  const response = await fetch(`${base}${at}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const raw = await response.text()
  return { status: response.status, body: raw ? JSON.parse(raw) : null }
}

async function login(username: string, password = 'pups2026') {
  const result = await call('POST', '/api/login', { username, password })
  expect(result.status).toBe(200)
  return result.body as { token: string; userId: string; weak: boolean }
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true })
  const handle = createApi(dataDir)
  server = http.createServer((request, response) => void handle(request, response))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('servidor', () => {
  it('los datos públicos no muestran costos ni claves', async () => {
    const result = await call('GET', '/api/public')
    expect(result.status).toBe(200)
    expect(result.body.products.length).toBeGreaterThan(0)
    for (const product of result.body.products) expect(product).not.toHaveProperty('cost')
    expect(JSON.stringify(result.body)).not.toContain('password')
  })

  it('sin sesión no se leen ni se guardan datos', async () => {
    expect((await call('GET', '/api/state')).status).toBe(401)
    expect((await call('PUT', '/api/state', { base: 0, state: {} })).status).toBe(401)
    expect((await call('GET', '/api/state', undefined, 'token-falso')).status).toBe(401)
  })

  it('bloquea el usuario después de cinco intentos fallidos', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await call('POST', '/api/login', { username: 'fantasma', password: 'mala' })).status).toBe(401)
    }
    const locked = await call('POST', '/api/login', { username: 'fantasma', password: 'pups2026' })
    expect(locked.status).toBe(429)
    expect(locked.body.wait).toBeGreaterThan(0)
  })

  it('avisa que la clave de demostración es débil y no envía claves al cliente', async () => {
    const session = await login('recepcion')
    expect(session.weak).toBe(true)
    const state = await call('GET', '/api/state', undefined, session.token)
    expect(state.status).toBe(200)
    expect(JSON.stringify(state.body)).not.toMatch(/scrypt\$|"password"/)
  })

  it('rechaza guardar sobre una versión vieja', async () => {
    const session = await login('recepcion')
    const current = (await call('GET', '/api/state', undefined, session.token)).body as AppState
    const stale = await call('PUT', '/api/state', { base: (current.revision ?? 0) - 1, state: current }, session.token)
    expect(stale.status).toBe(409)
    expect(stale.body.state.revision).toBe(current.revision)
  })

  it('recepción no puede tocar la planilla aunque lo intente', async () => {
    const session = await login('recepcion')
    const current = (await call('GET', '/api/state', undefined, session.token)).body as AppState
    const forged = { ...current, payrolls: [{ id: 'falsa', period: '2026-01', lines: [], paidAt: '' }] as never }
    const saved = await call('PUT', '/api/state', { base: current.revision ?? 0, state: forged }, session.token)
    expect(saved.status).toBe(200)
    expect(saved.body.state.payrolls ?? []).toEqual(current.payrolls ?? [])
  })

  it('cambiar la clave pide la actual y cierra las demás sesiones', async () => {
    const first = await login('recepcion')
    const second = await login('recepcion')
    expect((await call('POST', '/api/password', { userId: first.userId, current: 'otra', password: 'NuevaClave2026' }, first.token)).status).toBe(400)
    expect((await call('POST', '/api/password', { userId: first.userId, current: 'pups2026', password: 'NuevaClave2026' }, first.token)).status).toBe(204)
    expect((await call('GET', '/api/state', undefined, first.token)).status).toBe(200)
    expect((await call('GET', '/api/state', undefined, second.token)).status).toBe(401)
    expect((await call('POST', '/api/login', { username: 'recepcion', password: 'pups2026' })).status).toBe(401)
    await login('recepcion', 'NuevaClave2026')
  })

  it('recepción no lee planillas ni salarios y no puede borrar ingresos ni cambiar costos', async () => {
    const admin = await login('admin')
    const full = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const desk = await login('recepcion', 'NuevaClave2026')
    const seen = (await call('GET', '/api/state', undefined, desk.token)).body as AppState
    expect(seen.users.every((item) => item.salary === undefined)).toBe(true)
    expect(seen.payrolls ?? []).toEqual([])
    expect(seen.purchases ?? []).toEqual([])
    const product = seen.products![0]
    const forged = {
      ...seen,
      movements: seen.movements.filter((item) => item.type !== 'egreso'),
      products: seen.products!.map((item) => (item.id === product.id ? { ...item, cost: 1, price: product.price + 1 } : item)),
    }
    const saved = await call('PUT', '/api/state', { base: seen.revision, state: forged }, desk.token)
    expect(saved.status).toBe(200)
    const after = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    expect(after.movements.length).toBe(full.movements.length)
    const stored = after.products!.find((item) => item.id === product.id)!
    expect(stored.cost).toBe(full.products!.find((item) => item.id === product.id)!.cost)
    expect(stored.price).toBe(product.price + 1)
    expect(after.payrolls).toEqual(full.payrolls)
  })

  it('un día con corte de caja no deja borrar ni agregar cobros', async () => {
    const admin = await login('admin')
    const current = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const day = current.movements.find((item) => item.method !== 'Pedido')!.date
    const closed = { ...current, cashCloses: [{ id: 'corte-x', date: day, opening: 0, expected: 0, counted: 0, difference: 0, note: '', closedAt: '' }, ...(current.cashCloses ?? [])] as never }
    const first = await call('PUT', '/api/state', { base: current.revision, state: closed }, admin.token)
    expect(first.status).toBe(200)
    const before = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const sameDay = before.movements.filter((item) => item.date === day && item.method !== 'Pedido')
    const extra = { ...sameDay[0], id: 'nuevo-x', document: 'ING-999' }
    const forged = { ...before, movements: [extra, ...before.movements.filter((item) => item.id !== sameDay[0].id)] }
    expect((await call('PUT', '/api/state', { base: before.revision, state: forged }, admin.token)).status).toBe(200)
    const after = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    expect(after.movements.some((item) => item.id === sameDay[0].id)).toBe(true)
    expect(after.movements.some((item) => item.id === 'nuevo-x')).toBe(false)
  })

  it('cada quien marca su propia asistencia con la hora del servidor y solo ve la suya', async () => {
    const admin = await login('admin')
    const desk = await login('recepcion', 'NuevaClave2026')
    const seen = (await call('GET', '/api/state', undefined, desk.token)).body as AppState
    const today = isoDate()
    const mine = { id: 'asis-1', userId: desk.userId, date: today, inAt: '2020-01-01T08:00:00.000Z' }
    const other = { id: 'asis-2', userId: admin.userId, date: today, inAt: '2020-01-01T08:00:00.000Z' }
    const saved = await call('PUT', '/api/state', { base: seen.revision, state: { ...seen, attendance: [mine, other] } }, desk.token)
    expect(saved.status).toBe(200)
    const stored = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    expect(stored.attendance?.map((item) => item.id)).toEqual(['asis-1'])
    const record = stored.attendance![0]
    expect(Date.now() - Date.parse(record.inAt)).toBeLessThan(60_000)

    const again = (await call('GET', '/api/state', undefined, desk.token)).body as AppState
    const out = { ...again.attendance![0], inAt: '2020-01-01T07:00:00.000Z', outAt: '2020-01-01T20:00:00.000Z' }
    await call('PUT', '/api/state', { base: again.revision, state: { ...again, attendance: [out] } }, desk.token)
    const closed = ((await call('GET', '/api/state', undefined, admin.token)).body as AppState).attendance![0]
    expect(closed.inAt).toBe(record.inAt)
    expect(Date.now() - Date.parse(closed.outAt!)).toBeLessThan(60_000)

    const full = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const fixed = { ...full, attendance: [...full.attendance!, { ...other, id: 'asis-3' }] }
    expect((await call('PUT', '/api/state', { base: full.revision, state: fixed }, admin.token)).status).toBe(200)
    const deskView = (await call('GET', '/api/state', undefined, desk.token)).body as AppState
    expect(deskView.attendance?.map((item) => item.id)).toEqual(['asis-1'])
  })

  it('rechaza datos con forma inválida', async () => {
    const admin = await login('admin')
    const current = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    expect((await call('PUT', '/api/state', { base: current.revision, state: { ...current, leads: null } }, admin.token)).status).toBe(400)
    expect((await call('PUT', '/api/state', { base: current.revision, state: { ...current, sales: 5 } }, admin.token)).status).toBe(400)
  })

  it('agrupa una IPv6 por su red /64', () => {
    expect(networkOf('2600:1f18:1:2:aaaa:bbbb:cccc:dddd')).toBe('2600:1f18:1:2::/64')
    expect(networkOf('2600:1f18::5')).toBe('2600:1f18::/64')
    expect(networkOf('::ffff:10.0.0.1')).toBe('10.0.0.1')
  })

  it('la reserva pública rechaza horas pasadas y horarios ocupados', async () => {
    const booking = { clientName: 'Ana', phone: '55550000', petName: 'Toby', service: SERVICE_NAMES[0], date: addDays(isoDate(), 2), time: '10:00' }
    expect((await call('POST', '/api/public/booking', { ...booking, date: addDays(isoDate(), -1) })).status).toBe(400)
    const first = await call('POST', '/api/public/booking', booking)
    expect(first.status).toBe(200)
    expect(first.body.folio).toBeGreaterThan(0)
    expect((await call('POST', '/api/public/booking', booking)).status).toBe(409)
  })
})
