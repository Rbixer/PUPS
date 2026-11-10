import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSeed } from '../src/seed'
import {
  appendOutbound,
  applyWebhook,
  dispatchOutbound,
  loadWaConfig,
  validSignature,
  verifyWebhook,
  withinServiceWindow,
  type WaConfig,
} from '../server/whatsapp'

const config: WaConfig = {
  token: 'token',
  phoneNumberId: '123',
  verifyToken: 'verify-me',
  appSecret: 'secret',
  template: 'reserva_nueva',
}

describe('whatsapp cloud', () => {
  it('carga la config solo si están todas las variables', () => {
    expect(loadWaConfig({})).toBeNull()
    expect(
      loadWaConfig({
        WA_TOKEN: 't',
        WA_PHONE_NUMBER_ID: '1',
        WA_VERIFY_TOKEN: 'v',
        WA_APP_SECRET: 's',
      }),
    ).toMatchObject({ token: 't', phoneNumberId: '1', template: 'reserva_nueva' })
  })

  it('verifica el webhook y la firma HMAC', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify-me',
      'hub.challenge': 'abc123',
    })
    expect(verifyWebhook(config, params)).toBe('abc123')
    expect(verifyWebhook(config, new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otra' }))).toBeNull()

    const raw = '{"ok":true}'
    const digest = createHmac('sha256', config.appSecret).update(raw).digest('hex')
    expect(validSignature(config, raw, `sha256=${digest}`)).toBe(true)
    expect(validSignature(config, raw, 'sha256=deadbeef')).toBe(false)
  })

  it('ingesta mensajes entrantes, actualiza estados y respeta la ventana de 24 h', () => {
    const seed = createSeed()
    const stamped = Math.floor(Date.now() / 1000)
    const next = applyWebhook(seed, {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '50255559999', profile: { name: 'Carla' } }],
                messages: [
                  {
                    id: 'wamid.in1',
                    from: '50255559999',
                    timestamp: String(stamped),
                    type: 'text',
                    text: { body: 'Hola, quiero una cita' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    const thread = next.conversations.find((item) => item.phone.includes('55559999'))!
    expect(thread.name).toBe('Carla')
    expect(thread.unread).toBe(1)
    expect(thread.messages[0]).toMatchObject({ body: 'Hola, quiero una cita', externalId: 'wamid.in1', status: 'recibido' })
    expect(withinServiceWindow(thread)).toBe(true)

    const withOut = appendOutbound(next, {
      phone: '50255559999',
      body: 'Claro, te agendamos',
      externalId: 'wamid.out1',
    })
    const updated = applyWebhook(withOut, {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.out1', status: 'read', timestamp: String(stamped) }],
              },
            },
          ],
        },
      ],
    })
    expect(updated.conversations.find((item) => item.id === thread.id)!.messages.find((item) => item.externalId === 'wamid.out1')!.status).toBe('leido')
  })

  it('envía texto dentro de la ventana y plantilla cuando se fuerza', async () => {
    const seed = createSeed()
    const withIn = applyWebhook(seed, {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: 'wamid.a', from: '50255558888', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hola' } }],
              },
            },
          ],
        },
      ],
    })
    const calls: unknown[] = []
    const graph = async (_path: string, body: unknown) => {
      calls.push(body)
      return { messages: [{ id: `wamid.${calls.length}` }] }
    }

    const text = await dispatchOutbound(config, withIn, { phone: '50255558888', body: 'Te esperamos' }, graph)
    expect(text.result).toMatchObject({ ok: true, mode: 'text' })
    expect(calls[0]).toMatchObject({ type: 'text' })

    const blocked = await dispatchOutbound(config, seed, { phone: '50255557777', body: 'Hola' }, graph)
    expect(blocked.result.ok).toBe(false)

    const forced = await dispatchOutbound(
      config,
      seed,
      { phone: '50255557777', body: 'Reserva', forceTemplate: true, allowTemplate: true, templateParams: ['Ana', '12', 'Toby', 'Baño', 'mañana'] },
      graph,
    )
    expect(forced.result).toMatchObject({ ok: true, mode: 'template' })
    expect(calls.at(-1)).toMatchObject({ type: 'template', template: { name: 'reserva_nueva' } })
  })
})
