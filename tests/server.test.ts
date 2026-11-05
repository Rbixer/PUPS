import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../server/api'
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
      expect((await call('POST', '/api/login', { username: 'admin', password: 'mala' })).status).toBe(401)
    }
    const locked = await call('POST', '/api/login', { username: 'admin', password: 'pups2026' })
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

  it('la reserva pública rechaza horas pasadas y horarios ocupados', async () => {
    const booking = { clientName: 'Ana', phone: '55550000', petName: 'Toby', service: SERVICE_NAMES[0], date: addDays(isoDate(), 2), time: '10:00' }
    expect((await call('POST', '/api/public/booking', { ...booking, date: addDays(isoDate(), -1) })).status).toBe(400)
    const first = await call('POST', '/api/public/booking', booking)
    expect(first.status).toBe(200)
    expect(first.body.folio).toBeGreaterThan(0)
    expect((await call('POST', '/api/public/booking', booking)).status).toBe(409)
  })
})
