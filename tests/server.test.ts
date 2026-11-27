import { createHmac } from 'node:crypto'
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
  if (!raw) return { status: response.status, body: null }
  try {
    return { status: response.status, body: JSON.parse(raw) }
  } catch {
    return { status: response.status, body: raw }
  }
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

  it('una clave puesta por el administrador obliga a cambiarla al entrar', async () => {
    const admin = await login('admin')
    const current = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const id = 'temp-user'
    const saved = await call(
      'PUT',
      '/api/state',
      {
        base: current.revision ?? 0,
        state: {
          ...current,
          users: [...current.users, { id, name: 'Temporal', username: 'temp-user', role: 'Trabajador', active: true, permissions: ['citas'], permissionsVersion: 3 }],
        },
      },
      admin.token,
    )
    expect(saved.status).toBe(200)
    expect((await call('POST', '/api/password', { userId: id, password: 'ClaveTemporal1' }, admin.token)).status).toBe(204)
    const first = await call('POST', '/api/login', { username: 'temp-user', password: 'ClaveTemporal1' })
    expect(first.status).toBe(200)
    expect(first.body.mustChange).toBe(true)
    expect((await call('POST', '/api/password', { userId: id, current: 'ClaveTemporal1', password: 'ClavePropia2026' }, first.body.token)).status).toBe(204)
    const second = await call('POST', '/api/login', { username: 'temp-user', password: 'ClavePropia2026' })
    expect(second.status).toBe(200)
    expect(second.body.mustChange).toBe(false)
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

  it('whatsapp cloud: status y webhook exigen configuración; con secretos verifica el challenge', async () => {
    const admin = await login('admin')
    const before = await call('GET', '/api/whatsapp/status', undefined, admin.token)
    expect(before.status).toBe(200)
    expect(before.body.configured).toBe(false)
    expect((await call('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1')).status).toBe(503)

    process.env.WA_VERIFY_TOKEN = 'verify-me'
    const handshake = await call('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=solo')
    expect(handshake.status).toBe(200)
    expect(handshake.body).toBe('solo')
    expect((await call('GET', '/api/whatsapp/status', undefined, admin.token)).body.configured).toBe(false)
    delete process.env.WA_VERIFY_TOKEN

    process.env.WA_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '100'
    process.env.WA_VERIFY_TOKEN = 'verify-me'
    process.env.WA_APP_SECRET = 'secret'
    try {
      const ok = await call('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=hola')
      expect(ok.status).toBe(200)
      expect(ok.body).toBe('hola')
      const status = await call('GET', '/api/whatsapp/status', undefined, admin.token)
      expect(status.body.configured).toBe(true)
      expect((await call('POST', '/api/whatsapp/send', { conversationId: 'wa-nube', text: 'Hola' }, admin.token)).status).toBe(400)
    } finally {
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_NUMBER_ID
      delete process.env.WA_VERIFY_TOKEN
      delete process.env.WA_APP_SECRET
    }
  })

  it('whatsapp: los archivos del cliente solo los ve quien tiene permiso y solo si pertenecen a un mensaje', async () => {
    const admin = await login('admin')
    process.env.WA_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '100'
    process.env.WA_VERIFY_TOKEN = 'verify-me'
    process.env.WA_APP_SECRET = 'secret'
    try {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '100' },
                  contacts: [{ wa_id: '50255554321', profile: { name: 'Marta' } }],
                  messages: [{ id: 'wamid.media1', from: '50255554321', timestamp: String(Math.floor(Date.now() / 1000)), type: 'image', image: { id: '90001', mime_type: 'image/png' } }],
                },
              },
            ],
          },
        ],
      })
      const signature = `sha256=${createHmac('sha256', 'secret').update(payload).digest('hex')}`
      const hook = await fetch(`${base}/api/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body: payload })
      expect(hook.status).toBe(200)
      const state = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
      const stored = state.conversations.flatMap((item) => item.messages).find((item) => item.externalId === 'wamid.media1')
      expect(stored).toMatchObject({ body: '📷 Foto', media: { kind: 'image', id: '90001' } })

      fs.mkdirSync(path.join(dataDir, 'wa-media'), { recursive: true })
      fs.writeFileSync(path.join(dataDir, 'wa-media', '90001.bin'), Buffer.from([137, 80, 78, 71]))
      fs.writeFileSync(path.join(dataDir, 'wa-media', '90001.mime'), 'image/png')

      const noSession = await fetch(`${base}/api/whatsapp/media/90001`)
      expect(noSession.status).toBe(401)
      const outsider = await limitedUser('sinWhatsapp', ['citas'])
      expect((await fetch(`${base}/api/whatsapp/media/90001`, { headers: { authorization: `Bearer ${outsider.token}` } })).status).toBe(403)
      expect((await fetch(`${base}/api/whatsapp/media/12345`, { headers: { authorization: `Bearer ${admin.token}` } })).status).toBe(404)

      const seen = await fetch(`${base}/api/whatsapp/media/90001`, { headers: { authorization: `Bearer ${admin.token}` } })
      expect(seen.status).toBe(200)
      expect(seen.headers.get('content-type')).toBe('image/png')
      expect(seen.headers.get('cache-control')).toContain('private')
      expect(Buffer.from(await seen.arrayBuffer()).length).toBe(4)
    } finally {
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_NUMBER_ID
      delete process.env.WA_VERIFY_TOKEN
      delete process.env.WA_APP_SECRET
    }
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

  it('sin anular no anula ventas y sin corte no cierra caja', async () => {
    const admin = await login('admin')
    const full = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const sale = {
      id: 'ven-guard',
      number: 'VEN-GUARD',
      date: isoDate(),
      at: '',
      channel: 'mostrador' as const,
      clientName: 'Prueba',
      phone: '',
      lines: [{ name: 'Shampoo', qty: 1, price: 10, cost: 0 }],
      discount: 0,
      total: 10,
      method: 'Efectivo',
      status: 'pagada' as const,
      document: 'ING-GUARD',
    }
    const users = full.users.map((user) =>
      user.username === 'recepcion'
        ? {
            ...user,
            permissionsVersion: 2,
            permissions: ['citas', 'fichas', 'whatsapp', 'caja', 'movimientos', 'tareas', 'estadisticas', 'reportes'] as AppState['users'][number]['permissions'],
          }
        : user,
    )
    expect((await call('PUT', '/api/state', { base: full.revision, state: { ...full, users, sales: [sale, ...(full.sales ?? [])] } }, admin.token)).status).toBe(200)
    const desk = await login('recepcion', 'NuevaClave2026')
    const seen = (await call('GET', '/api/state', undefined, desk.token)).body as AppState
    expect(seen.sales?.some((item) => item.id === sale.id)).toBe(true)
    const voided = {
      ...seen,
      sales: (seen.sales ?? []).map((item) => (item.id === sale.id ? { ...item, status: 'anulada' as const } : item)),
      cashCloses: [{ id: 'corte-forzado', date: isoDate(), opening: 0, expected: 0, counted: 0, difference: 0, note: '', closedAt: '' }, ...(seen.cashCloses ?? [])],
    }
    expect((await call('PUT', '/api/state', { base: seen.revision, state: voided }, desk.token)).status).toBe(200)
    const after = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    expect(after.sales?.find((item) => item.id === sale.id)?.status).toBe('pagada')
    expect(after.cashCloses?.some((item) => item.id === 'corte-forzado')).toBe(false)
  })

  it('la reserva pública rechaza horas pasadas y horarios con 3 citas', async () => {
    const booking = { clientName: 'Ana', phone: '55550000', petName: 'Toby', service: SERVICE_NAMES[0], date: addDays(isoDate(), 2), time: '10:00' }
    expect((await call('POST', '/api/public/booking', { ...booking, date: addDays(isoDate(), -1) })).status).toBe(400)
    for (let i = 0; i < 3; i += 1) {
      const result = await call('POST', '/api/public/booking', { ...booking, petName: `Toby${i}`, phone: `5555000${i}` })
      expect(result.status).toBe(200)
      expect(result.body.folio).toBeGreaterThan(0)
    }
    expect((await call('POST', '/api/public/booking', { ...booking, petName: 'TobyX', phone: '55550999' })).status).toBe(409)
  })

  it('con WhatsApp lento, dos reservas simultáneas se guardan las dos', async () => {
    process.env.WA_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '100'
    process.env.WA_VERIFY_TOKEN = 'verify-me'
    process.env.WA_APP_SECRET = 'secret'
    const original = globalThis.fetch
    let sent = 0
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input).startsWith('https://graph.facebook.com')) {
        await new Promise((resolve) => setTimeout(resolve, 150))
        sent += 1
        return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent}` }] }), { status: 200 })
      }
      return original(input, init)
    }) as typeof fetch
    try {
      const day = addDays(isoDate(), 3)
      const booking = { clientName: 'Luz', service: SERVICE_NAMES[0], date: day, time: '11:00' }
      const [first, second] = await Promise.all([
        call('POST', '/api/public/booking', { ...booking, petName: 'Rocky', phone: '55551111' }),
        call('POST', '/api/public/booking', { ...booking, clientName: 'Mar', petName: 'Nube', phone: '55552222' }),
      ])
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      const admin = await login('admin')
      const state = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
      const mine = state.appointments.filter((item) => item.date === day && item.time === '11:00')
      expect(mine.map((item) => item.petName).sort()).toEqual(['Nube', 'Rocky'])
      const messages = state.conversations.flatMap((thread) => thread.messages).filter((message) => message.direction === 'out' && message.externalId?.startsWith('wamid.'))
      expect(messages).toHaveLength(2)
    } finally {
      globalThis.fetch = original
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_NUMBER_ID
      delete process.env.WA_VERIFY_TOKEN
      delete process.env.WA_APP_SECRET
    }
  })

  async function limitedUser(id: string, permissions: string[]) {
    const admin = await login('admin')
    const current = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
    const extra = { id, name: id, username: id, role: 'Recepción', active: true, permissions, permissionsVersion: 3 }
    const saved = await call('PUT', '/api/state', { base: current.revision ?? 0, state: { ...current, users: [...current.users, extra] } }, admin.token)
    expect(saved.status).toBe(200)
    expect((await call('POST', '/api/password', { userId: id, password: 'ClaveLarga2026' }, admin.token)).status).toBe(204)
    return login(id, 'ClaveLarga2026')
  }

  it('con solo «Citas» no se cancelan citas, ni se cambian datos del negocio, la línea de WhatsApp o el control', async () => {
    const limited = await limitedUser('soloCitas', ['citas'])
    const seen = (await call('GET', '/api/state', undefined, limited.token)).body as AppState
    const pending = seen.appointments.find((item) => item.status === 'pendiente')!
    const forged = {
      ...seen,
      appointments: seen.appointments.map((item) => (item.id === pending.id ? { ...item, status: 'cancelada' as const } : item)),
      settings: { ...seen.settings, address: 'Otra calle', whatsapp: '+50211112222', controlGoal: 5 },
      controlRows: [{ year: 2026, month: 1, values: { deas: 9 } }],
    }
    const saved = await call('PUT', '/api/state', { base: seen.revision ?? 0, state: forged }, limited.token)
    expect(saved.status).toBe(200)
    const after = saved.body.state as AppState
    expect(after.appointments.find((item) => item.id === pending.id)!.status).toBe('pendiente')
    expect(after.settings.address).toBe(seen.settings.address)
    expect(after.settings.whatsapp).toBe(seen.settings.whatsapp)
    expect(after.settings.controlGoal).toBe(seen.settings.controlGoal)
    expect(after.controlRows ?? []).toEqual(seen.controlRows ?? [])
  })

  it('con «Cancelar citas» sí cancela, y con «Datos del negocio» cambia la dirección', async () => {
    const limited = await limitedUser('conCancelar', ['citas', 'citas_cancelar', 'negocio'])
    const seen = (await call('GET', '/api/state', undefined, limited.token)).body as AppState
    const pending = seen.appointments.find((item) => item.status === 'pendiente')!
    const forged = {
      ...seen,
      appointments: seen.appointments.map((item) => (item.id === pending.id ? { ...item, status: 'cancelada' as const } : item)),
      settings: { ...seen.settings, address: 'Nueva dirección 123' },
    }
    const saved = await call('PUT', '/api/state', { base: seen.revision ?? 0, state: forged }, limited.token)
    expect(saved.status).toBe(200)
    const after = (await call('GET', '/api/state', undefined, limited.token)).body as AppState
    expect(after.appointments.find((item) => item.id === pending.id)!.status).toBe('cancelada')
    expect(after.settings.address).toBe('Nueva dirección 123')
  })

  it('leer WhatsApp no alcanza para enviar mensajes', async () => {
    const reader = await limitedUser('soloLeerWa', ['whatsapp'])
    const sent = await call('POST', '/api/whatsapp/send', { conversationId: 'x', text: 'hola' }, reader.token)
    expect(sent.status).toBe(403)
  })

  it('manda una foto jpg al hilo abierto y la deja lista para verla', async () => {
    const admin = await login('admin')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')
    expect((await call('POST', '/api/whatsapp/image', { conversationId: 'wa-nube', image: jpeg })).status).toBe(401)
    const reader = await limitedUser('soloLeerFoto', ['whatsapp'])
    expect((await call('POST', '/api/whatsapp/image', { conversationId: 'wa-nube', image: jpeg }, reader.token)).status).toBe(403)

    process.env.WA_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '100'
    process.env.WA_VERIFY_TOKEN = 'verify-me'
    process.env.WA_APP_SECRET = 'secret'
    const original = globalThis.fetch
    try {
      expect((await call('POST', '/api/whatsapp/image', { conversationId: 'wa-nube', image: Buffer.from('GIF89a').toString('base64') }, admin.token)).status).toBe(400)
      const seen = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
      const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const closed = await call(
        'PUT',
        '/api/state',
        { base: seen.revision ?? 0, state: { ...seen, conversations: seen.conversations.map((item) => (item.id === 'wa-luna' ? { ...item, lastInboundAt: old } : item)) } },
        admin.token,
      )
      expect(closed.status).toBe(200)
      const blocked = await call('POST', '/api/whatsapp/image', { conversationId: 'wa-luna', image: jpeg }, admin.token)
      expect(blocked.status).toBe(400)
      expect(blocked.body.error).toMatch(/24 h/)

      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '100' },
                  contacts: [{ wa_id: '50255550999', profile: { name: 'Nora' } }],
                  messages: [{ id: 'wamid.fotoin', from: '50255550999', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hola' } }],
                },
              },
            ],
          },
        ],
      })
      const signature = `sha256=${createHmac('sha256', 'secret').update(payload).digest('hex')}`
      expect((await fetch(`${base}/api/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body: payload })).status).toBe(200)
      const opened = (await call('GET', '/api/state', undefined, admin.token)).body as AppState
      const thread = opened.conversations.find((item) => item.phone.includes('55550999'))!

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('graph.facebook.com') && url.endsWith('/media')) return Response.json({ id: '55501' })
        if (url.includes('graph.facebook.com') && url.endsWith('/messages')) {
          const sent = JSON.parse(String(init?.body)) as { type?: string; image?: { id?: string; caption?: string } }
          expect(sent.type).toBe('image')
          expect(sent.image).toEqual({ id: '55501', caption: 'Mira a Toby' })
          return Response.json({ messages: [{ id: 'out.img.1' }] })
        }
        return original(input, init)
      }) as typeof fetch

      const sent = await call('POST', '/api/whatsapp/image', { conversationId: thread.id, caption: 'Mira a Toby', image: jpeg }, admin.token)
      expect(sent.status).toBe(200)
      const stored = (sent.body.state as AppState).conversations
        .flatMap((item) => item.messages)
        .find((item) => item.externalId === 'out.img.1')
      expect(stored).toMatchObject({ direction: 'out', body: 'Mira a Toby', media: { kind: 'image', id: '55501', mime: 'image/jpeg' } })
      expect(fs.readFileSync(path.join(dataDir, 'wa-media', '55501.bin'))).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      globalThis.fetch = original
      const file = await fetch(`${base}/api/whatsapp/media/55501`, { headers: { authorization: `Bearer ${admin.token}` } })
      expect(file.status).toBe(200)
      expect(file.headers.get('content-type')).toContain('image/jpeg')
      expect(Buffer.from(await file.arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    } finally {
      globalThis.fetch = original
      delete process.env.WA_TOKEN
      delete process.env.WA_PHONE_NUMBER_ID
      delete process.env.WA_VERIFY_TOKEN
      delete process.env.WA_APP_SECRET
    }
  })
})
