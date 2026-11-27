import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildChimeWav, incomingCount } from '../src/chime'
import { createSeed } from '../src/seed'
import {
  appendOutbound,
  applyWebhook,
  describeInbound,
  dispatchOutbound,
  fromMetaNetwork,
  isOwnWebhook,
  loadWaConfig,
  loadWaMedia,
  MediaError,
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

describe('aviso de mensaje', () => {
  const threads = [
    { messages: [{ id: 'a', direction: 'in' }, { id: 'b', direction: 'out' }] },
    { messages: [{ id: 'c', direction: 'in' }] },
  ]

  it('cuenta solo los entrantes nuevos y recuerda los que ya sonaron', () => {
    const first = incomingCount(new Set(), threads)
    expect(first.count).toBe(2)
    expect(incomingCount(first.next, threads).count).toBe(0)
    const again = incomingCount(first.next, [...threads, { messages: [{ id: 'd', direction: 'in' }] }])
    expect(again.count).toBe(1)
    expect(incomingCount(again.next, [{ messages: [{ id: 'e', direction: 'out' }] }]).count).toBe(0)
  })

  it('arma un wav con las dos notas del aviso', () => {
    const wav = buildChimeWav()
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
    expect(wav.length).toBeGreaterThan(44)
  })
})

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

  it('sin permiso explícito no confía en la red de Meta; con él solo acepta su red y el número de la tienda', () => {
    const base = { WA_TOKEN: 't', WA_PHONE_NUMBER_ID: '1027451207127204', WA_VERIFY_TOKEN: 'v', WA_APP_SECRET: 's' }
    expect(loadWaConfig(base)?.trustMetaNetwork).toBe(false)
    expect(loadWaConfig({ ...base, WA_TRUST_META_NETWORK: '1' })?.trustMetaNetwork).toBe(true)

    for (const ip of ['173.252.107.33', '69.171.230.43', '31.13.115.6', '66.220.149.1', '69.63.184.34', '57.144.10.5']) {
      expect(fromMetaNetwork(ip)).toBe(true)
    }
    for (const ip of ['190.56.143.206', '3.239.70.231', '127.0.0.1', '8.8.8.8', 'desconocido', '2600:1f18::1', '300.1.1.1']) {
      expect(fromMetaNetwork(ip)).toBe(false)
    }

    const own = { phoneNumberId: '1027451207127204' }
    const event = (phone: string) => ({ value: { metadata: { phone_number_id: phone } } })
    expect(isOwnWebhook(own, { object: 'whatsapp_business_account', entry: [{ changes: [event('1027451207127204')] }] })).toBe(true)
    expect(isOwnWebhook(own, { object: 'whatsapp_business_account', entry: [{ changes: [event('123456123')] }] })).toBe(false)
    expect(isOwnWebhook(own, { object: 'whatsapp_business_account', entry: [{ changes: [event('1027451207127204'), event('999')] }] })).toBe(false)
    expect(isOwnWebhook(own, { object: 'page', entry: [{ changes: [event('1027451207127204')] }] })).toBe(false)
    expect(isOwnWebhook(own, { object: 'whatsapp_business_account', entry: [] })).toBe(false)
    expect(isOwnWebhook(own, { object: 'whatsapp_business_account', entry: [{ changes: [] }] })).toBe(false)
    expect(isOwnWebhook(own, undefined)).toBe(false)
    expect(isOwnWebhook(own, 'texto')).toBe(false)
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

  it('entiende fotos, notas de voz, documentos, ubicación, contactos y reacciones', () => {
    expect(describeInbound({ type: 'text', text: { body: '  Hola 🐶  ' } })).toEqual({ body: 'Hola 🐶' })
    expect(describeInbound({ type: 'image', image: { id: '111', mime_type: 'image/jpeg', caption: 'Mira a Toby' } })).toEqual({
      body: 'Mira a Toby',
      media: { kind: 'image', id: '111', mime: 'image/jpeg' },
    })
    expect(describeInbound({ type: 'image', image: { id: '112' } })?.body).toBe('📷 Foto')
    expect(describeInbound({ type: 'audio', audio: { id: '113', voice: true } })).toMatchObject({ body: '🎤 Nota de voz', media: { kind: 'audio', voice: true } })
    expect(describeInbound({ type: 'video', video: { id: '114' } })?.body).toBe('🎥 Video')
    expect(describeInbound({ type: 'sticker', sticker: { id: '115' } })?.media?.kind).toBe('sticker')
    expect(describeInbound({ type: 'document', document: { id: '116', filename: 'carnet.pdf' } })).toMatchObject({ body: '📄 Documento', media: { kind: 'document', name: 'carnet.pdf' } })
    expect(describeInbound({ type: 'image', image: { id: '../etc/passwd' } })?.media).toBeUndefined()
    const place = describeInbound({ type: 'location', location: { latitude: 14.6, longitude: -90.5, name: 'Casa' } })
    expect(place?.body).toBe('📍 Ubicación: Casa')
    expect(place?.link).toBe('https://www.google.com/maps?q=14.6,-90.5')
    expect(describeInbound({ type: 'contacts', contacts: [{ name: { formatted_name: 'Ana' }, phones: [{ phone: '+50255551111' }] }] })?.body).toBe('👤 Contacto: Ana · +50255551111')
    expect(describeInbound({ type: 'reaction', reaction: { emoji: '❤️' } })?.body).toBe('❤️ reaccionó a un mensaje')
    expect(describeInbound({ type: 'reaction', reaction: {} })).toBeNull()
    expect(describeInbound({ type: 'interactive', interactive: { button_reply: { title: 'Sí, confirmo' } } })?.body).toBe('Sí, confirmo')
    expect(describeInbound({ type: 'order' })?.body).toMatch(/Ábrelo en WhatsApp/)
    expect(describeInbound({ type: 'text', text: { body: '   ' } })).toBeNull()
  })

  it('guarda en el hilo el archivo del cliente con su vista previa', () => {
    const next = applyWebhook(createSeed(), {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: 'wamid.img', from: '50255550000', timestamp: String(Math.floor(Date.now() / 1000)), type: 'image', image: { id: '777', mime_type: 'image/png' } }],
              },
            },
          ],
        },
      ],
    })
    const thread = next.conversations.find((item) => item.phone.includes('55550000'))!
    expect(thread.messages[0]).toMatchObject({ body: '📷 Foto', media: { kind: 'image', id: '777', mime: 'image/png' } })
    expect(thread.unread).toBe(1)
  })

  it('baja el archivo de Meta una sola vez y luego lo sirve del disco', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pups-wa-'))
    const seen: string[] = []
    const bytes = Buffer.from([137, 80, 78, 71])
    const fake = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      seen.push(url)
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token')
      if (url.endsWith('/777')) return Response.json({ url: 'https://lookaside.fbsbx.com/x?mid=1', mime_type: 'image/png', file_size: 4 })
      if (url.endsWith('/666')) return Response.json({ url: 'https://evil.example.com/x', mime_type: 'image/png' })
      if (url.endsWith('/555')) return Response.json({ url: 'https://lookaside.fbsbx.com/y', mime_type: 'text/html' })
      if (url.endsWith('/444')) return new Response('no', { status: 404 })
      return new Response(url.includes('/y') ? '<script>alert(1)</script>' : bytes)
    }) as typeof fetch
    try {
      const first = await loadWaMedia(config, '777', dir, fake)
      expect(first).toMatchObject({ mime: 'image/png', inline: true })
      expect([...first.data]).toEqual([...bytes])
      const calls = seen.length
      const again = await loadWaMedia(null, '777', dir, fake)
      expect(again.mime).toBe('image/png')
      expect(seen.length).toBe(calls)
      const html = await loadWaMedia(config, '555', dir, fake)
      expect(html).toMatchObject({ mime: 'application/octet-stream', inline: false })
      await expect(loadWaMedia(config, '666', dir, fake)).rejects.toMatchObject({ status: 502 })
      await expect(loadWaMedia(config, '444', dir, fake)).rejects.toBeInstanceOf(MediaError)
      await expect(loadWaMedia(config, '../x', dir, fake)).rejects.toMatchObject({ status: 404 })
      await expect(loadWaMedia(null, '321', dir, fake)).rejects.toMatchObject({ status: 503 })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
