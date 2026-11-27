import { createHmac, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_LABEL, digits, newId, normalizePhone } from '../src/format'
import type { AppState, Conversation, WaDelivery, WaMedia, WaMediaKind, WaMessage } from '../src/types'

const GRAPH = 'https://graph.facebook.com/v21.0'
const WINDOW_MS = 24 * 60 * 60 * 1000
export const RESERVA_TEMPLATE = 'reserva_nueva'

export type WaConfig = {
  token: string
  phoneNumberId: string
  verifyToken: string
  appSecret: string
  template: string
  /** Si la firma de Meta no coincide, acepta avisos que vengan de sus redes y traigan el número de la tienda. */
  trustMetaNetwork?: boolean
}

export function loadWaConfig(env: NodeJS.ProcessEnv = process.env): WaConfig | null {
  const token = env.WA_TOKEN?.trim() ?? ''
  const phoneNumberId = env.WA_PHONE_NUMBER_ID?.trim() ?? ''
  const verifyToken = env.WA_VERIFY_TOKEN?.trim() ?? ''
  const appSecret = env.WA_APP_SECRET?.trim() ?? ''
  if (!token || !phoneNumberId || !verifyToken || !appSecret) return null
  return {
    token,
    phoneNumberId,
    verifyToken,
    appSecret,
    template: env.WA_TEMPLATE?.trim() || RESERVA_TEMPLATE,
    trustMetaNetwork: env.WA_TRUST_META_NETWORK?.trim() === '1',
  }
}

/** Redes de Meta (AS32934). Se usan solo cuando la firma no se puede comprobar. */
const META_NETWORKS = [
  '31.13.24.0/21',
  '31.13.64.0/18',
  '31.13.96.0/19',
  '45.64.40.0/22',
  '57.141.0.0/19',
  '57.141.32.0/23',
  '57.144.0.0/15',
  '66.220.144.0/20',
  '69.63.176.0/20',
  '69.171.224.0/19',
  '74.119.76.0/22',
  '102.132.96.0/20',
  '103.4.96.0/22',
  '129.134.0.0/16',
  '147.75.208.0/20',
  '157.240.0.0/16',
  '163.70.128.0/17',
  '163.77.128.0/17',
  '173.252.64.0/18',
  '179.60.192.0/22',
  '185.60.216.0/22',
  '185.89.216.0/22',
  '204.15.20.0/22',
]

function ipv4Number(ip: string) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

export function fromMetaNetwork(ip: string) {
  const value = ipv4Number(ip.replace(/^::ffff:/, ''))
  if (value === null) return false
  return META_NETWORKS.some((entry) => {
    const [base, bits] = entry.split('/')
    const start = ipv4Number(base)
    if (start === null) return false
    const size = 2 ** (32 - Number(bits))
    return value >= start && value < start + size
  })
}

/** El aviso es de WhatsApp y todos sus eventos son del número de la tienda. */
export function isOwnWebhook(config: Pick<WaConfig, 'phoneNumberId'>, payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as { object?: unknown; entry?: { changes?: { value?: { metadata?: { phone_number_id?: unknown } } }[] }[] }
  if (data.object !== 'whatsapp_business_account' || !Array.isArray(data.entry) || !data.entry.length) return false
  let events = 0
  for (const entry of data.entry) {
    for (const change of entry.changes ?? []) {
      if (String(change.value?.metadata?.phone_number_id ?? '') !== config.phoneNumberId) return false
      events += 1
    }
  }
  return events > 0
}

export function waStatus(config: WaConfig | null) {
  return {
    configured: Boolean(config),
    phoneNumberId: config ? config.phoneNumberId : '',
    template: config?.template ?? RESERVA_TEMPLATE,
  }
}

export function verifyWebhook(config: { verifyToken: string }, params: URLSearchParams) {
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (mode === 'subscribe' && token === config.verifyToken && challenge) return challenge
  return null
}

export function validSignature(config: WaConfig, raw: string, header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', config.appSecret).update(raw).digest('hex')
  const got = value.slice('sha256='.length)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(got, 'hex'))
  } catch {
    return false
  }
}

export function phoneKey(phone: string) {
  return digits(normalizePhone(phone))
}

export function findThread(conversations: Conversation[], phone: string) {
  const key = phoneKey(phone)
  return conversations.find((item) => phoneKey(item.phone) === key)
}

export function withinServiceWindow(thread: Conversation | undefined, now = Date.now()) {
  if (!thread?.lastInboundAt) return false
  const at = Date.parse(thread.lastInboundAt)
  return Number.isFinite(at) && now - at < WINDOW_MS
}

type GraphSend = { messages?: { id: string }[]; error?: { message?: string } }

export type GraphClient = (path: string, body: unknown) => Promise<GraphSend>

export function createGraphClient(config: WaConfig): GraphClient {
  return async (path, body) => {
    const response = await fetch(`${GRAPH}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as GraphSend
    if (!response.ok) {
      const message = data.error?.message || `WhatsApp respondió ${response.status}.`
      throw new Error(message)
    }
    return data
  }
}

export async function sendText(
  config: WaConfig,
  to: string,
  body: string,
  graph: GraphClient = createGraphClient(config),
) {
  const data = await graph(`/${config.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: phoneKey(to),
    type: 'text',
    text: { preview_url: false, body },
  })
  const externalId = data.messages?.[0]?.id
  if (!externalId) throw new Error('WhatsApp no devolvió el id del mensaje.')
  return externalId
}

export async function sendTemplate(
  config: WaConfig,
  to: string,
  params: string[],
  graph: GraphClient = createGraphClient(config),
) {
  const data = await graph(`/${config.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: phoneKey(to),
    type: 'template',
    template: {
      name: config.template,
      language: { code: 'es' },
      components: params.length
        ? [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ]
        : [],
    },
  })
  const externalId = data.messages?.[0]?.id
  if (!externalId) throw new Error('WhatsApp no devolvió el id del mensaje.')
  return externalId
}

function upsertThread(state: AppState, phone: string, name: string, petName = ''): { state: AppState; thread: Conversation } {
  const list = state.conversations ?? []
  const found = findThread(list, phone)
  if (found) {
    const thread: Conversation = {
      ...found,
      name: name.trim() || found.name,
      petName: petName.trim() || found.petName,
      phone: found.phone || normalizePhone(phone),
    }
    return {
      state: { ...state, conversations: list.map((item) => (item.id === thread.id ? thread : item)) },
      thread,
    }
  }
  const thread: Conversation = {
    id: newId(),
    phone: normalizePhone(phone),
    name: name.trim() || 'Cliente',
    petName: petName.trim(),
    unread: 0,
    messages: [],
  }
  return { state: { ...state, conversations: [thread, ...list] }, thread }
}

function pushMessage(state: AppState, threadId: string, message: WaMessage, inbound: boolean): AppState {
  return {
    ...state,
    conversations: state.conversations.map((item) => {
      if (item.id !== threadId) return item
      return {
        ...item,
        unread: inbound ? item.unread + 1 : item.unread,
        lastInboundAt: inbound ? message.at : item.lastInboundAt,
        messages: [...item.messages, message],
      }
    }),
  }
}

/** Aplica un envío saliente ya aceptado por Meta. */
export function appendOutbound(
  state: AppState,
  input: { phone: string; name?: string; petName?: string; body: string; externalId: string; at?: string; media?: WaMedia },
): AppState {
  const stamped = input.at ?? new Date().toISOString()
  const { state: withThread, thread } = upsertThread(state, input.phone, input.name ?? '', input.petName ?? '')
  const message: WaMessage = {
    id: newId(),
    direction: 'out',
    body: input.body,
    at: stamped,
    status: 'enviado',
    externalId: input.externalId,
    ...(input.media ? { media: input.media } : {}),
  }
  return pushMessage(withThread, thread.id, message, false)
}

const STATUS_MAP: Record<string, WaDelivery> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
}

type MediaRef = { id?: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean }

type InboundItem = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: MediaRef
  video?: MediaRef
  audio?: MediaRef
  sticker?: MediaRef
  document?: MediaRef
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[]
  reaction?: { emoji?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
  button?: { text?: string }
}

const MEDIA_ID = /^[A-Za-z0-9_-]{1,64}$/
const MEDIA_KINDS: WaMediaKind[] = ['image', 'sticker', 'audio', 'video', 'document']

/** WhatsApp solo acepta JPG o PNG, y como máximo 5 MB, en un mensaje de imagen. */
export const IMAGE_MAX = 5 * 1024 * 1024

export type OutboundImage = { data: Buffer; mime: 'image/jpeg' | 'image/png' }

export function readOutboundImage(raw: string): OutboundImage {
  const payload = raw
    .trim()
    .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
    .replace(/\s/g, '')
  if (!payload) throw new Error('Elige una imagen.')
  if (payload.length > Math.ceil(IMAGE_MAX / 3) * 4) throw new Error('La imagen es muy pesada. El máximo es 5 MB.')
  const data = Buffer.from(payload, 'base64')
  const clean = payload.replace(/=+$/, '')
  if (data.length === 0 || data.toString('base64').replace(/=+$/, '') !== clean) throw new Error('La imagen no se pudo leer.')
  if (data.length > IMAGE_MAX) throw new Error('La imagen es muy pesada. El máximo es 5 MB.')
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { data, mime: 'image/jpeg' }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return { data, mime: 'image/png' }
  }
  throw new Error('Solo se pueden enviar fotos JPG o PNG.')
}

async function uploadImage(config: Pick<WaConfig, 'token' | 'phoneNumberId'>, image: OutboundImage, fetcher: typeof fetch) {
  const form = new FormData()
  form.set('messaging_product', 'whatsapp')
  form.set('type', image.mime)
  form.set('file', new Blob([new Uint8Array(image.data)], { type: image.mime }), image.mime === 'image/png' ? 'foto.png' : 'foto.jpg')
  let response: Response
  try {
    response = await fetcher(`${GRAPH}/${config.phoneNumberId}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw new Error('No se pudo enviar la imagen por WhatsApp.')
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!response.ok || !data.id || !MEDIA_ID.test(data.id)) throw new Error(data.error?.message || 'WhatsApp no aceptó la imagen.')
  return data.id
}

/** Sube la foto a Meta y la manda en el hilo. Solo sirve dentro de la ventana de 24 h; la plantilla no lleva foto. */
export async function deliverImage(
  config: WaConfig,
  input: { to: string; caption: string; image: OutboundImage },
  deps?: { fetcher?: typeof fetch; graph?: GraphClient },
): Promise<{ externalId: string; mediaId: string }> {
  const mediaId = await uploadImage(config, input.image, deps?.fetcher ?? fetch)
  const caption = input.caption.trim().slice(0, 1024)
  const image: { id: string; caption?: string } = { id: mediaId }
  if (caption) image.caption = caption
  const graph = deps?.graph ?? createGraphClient(config)
  const data = await graph(`/${config.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneKey(input.to),
    type: 'image',
    image,
  })
  const externalId = data.messages?.[0]?.id
  if (!externalId) throw new Error('WhatsApp no devolvió el id del mensaje.')
  return { externalId, mediaId }
}

/** Deja en disco la foto que acabamos de enviar, para mostrarla sin volver a pedírsela a Meta. */
export function cacheWaMedia(dir: string, id: string, data: Buffer, mime: string) {
  if (!MEDIA_ID.test(id)) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.bin`), data)
  fs.writeFileSync(path.join(dir, `${id}.mime`), mime)
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Convierte un mensaje entrante de cualquier tipo en algo que se pueda ver en el chat. */
export function describeInbound(item: InboundItem): { body: string; media?: WaMedia; link?: string } | null {
  const type = item.type ?? 'text'
  if (type === 'text') {
    const body = clean(item.text?.body, 4096)
    return body ? { body } : null
  }
  if ((MEDIA_KINDS as string[]).includes(type)) {
    const kind = type as WaMediaKind
    const ref = item[kind]
    const id = clean(ref?.id, 64)
    if (!ref || !MEDIA_ID.test(id)) return { body: `${MEDIA_LABEL[kind]} (no se pudo recibir el archivo)` }
    const voice = kind === 'audio' && ref.voice === true
    const media: WaMedia = { kind, id }
    const mime = clean(ref.mime_type, 100)
    const name = clean(ref.filename, 120)
    if (mime) media.mime = mime
    if (name) media.name = name
    if (voice) media.voice = true
    const caption = clean(ref.caption, 1024)
    return { body: caption || MEDIA_LABEL[voice ? 'voice' : kind], media }
  }
  if (type === 'location' && item.location) {
    const { latitude, longitude } = item.location
    const place = [clean(item.location.name, 120), clean(item.location.address, 200)].filter(Boolean).join(' · ')
    const link =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : undefined
    return { body: `📍 Ubicación${place ? `: ${place}` : ''}`, ...(link ? { link } : {}) }
  }
  if (type === 'contacts') {
    const names = (item.contacts ?? []).map((contact) => clean(contact.name?.formatted_name, 80)).filter(Boolean)
    const phones = (item.contacts ?? []).flatMap((contact) => (contact.phones ?? []).map((phone) => clean(phone.phone, 30))).filter(Boolean)
    return { body: `👤 Contacto: ${[...names, ...phones].join(' · ') || 'compartido'}` }
  }
  if (type === 'reaction') {
    const emoji = clean(item.reaction?.emoji, 16)
    return emoji ? { body: `${emoji} reaccionó a un mensaje` } : null
  }
  if (type === 'interactive' || type === 'button') {
    const title = clean(item.interactive?.button_reply?.title ?? item.interactive?.list_reply?.title ?? item.button?.text, 200)
    return title ? { body: title } : null
  }
  return { body: 'Mensaje que este chat no puede mostrar. Ábrelo en WhatsApp.' }
}

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
        messages?: InboundItem[]
        statuses?: { id?: string; status?: string; timestamp?: string; errors?: { message?: string }[] }[]
      }
    }[]
  }[]
}

/** Incorpora mensajes y estados del webhook de Meta. */
export function applyWebhook(state: AppState, payload: WebhookPayload): AppState {
  let next = state
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      const contactName = value.contacts?.[0]?.profile?.name ?? ''
      for (const item of value.messages ?? []) {
        if (!item.id || !item.from) continue
        const described = describeInbound(item)
        if (!described) continue
        const at = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString()
        const existing = findThread(next.conversations, item.from)
        if (existing?.messages.some((message) => message.externalId === item.id)) continue
        const prepared = upsertThread(next, item.from, contactName)
        next = prepared.state
        const message: WaMessage = {
          id: newId(),
          direction: 'in',
          body: described.body,
          at,
          status: 'recibido',
          externalId: item.id,
          ...(described.media ? { media: described.media } : {}),
          ...(described.link ? { link: described.link } : {}),
        }
        next = pushMessage(next, prepared.thread.id, message, true)
      }
      for (const item of value.statuses ?? []) {
        if (!item.id || !item.status) continue
        const status = STATUS_MAP[item.status]
        if (!status) continue
        const error = item.errors?.[0]?.message
        next = {
          ...next,
          conversations: next.conversations.map((thread) => ({
            ...thread,
            messages: thread.messages.map((message) =>
              message.externalId === item.id
                ? { ...message, status, ...(error ? { error } : {}) }
                : message,
            ),
          })),
        }
      }
    }
  }
  return next
}

export type SendResult = { ok: true; externalId: string; mode: 'text' | 'template' } | { ok: false; error: string }

/**
 * Envía texto si hay ventana de 24 h; si no, solo plantilla cuando `allowTemplate` es true.
 * `forceTemplate` salta el texto y usa la plantilla (reserva en línea).
 */
export async function dispatchOutbound(
  config: WaConfig,
  state: AppState,
  input: {
    phone: string
    name?: string
    petName?: string
    body: string
    templateParams?: string[]
    forceTemplate?: boolean
    allowTemplate?: boolean
  },
  graph: GraphClient = createGraphClient(config),
): Promise<{ result: SendResult; state: AppState }> {
  const thread = findThread(state.conversations, input.phone)
  const useTemplate = Boolean(input.forceTemplate) || !withinServiceWindow(thread)
  if (useTemplate && !input.allowTemplate && !input.forceTemplate) {
    return { result: { ok: false, error: 'Han pasado más de 24 h desde el último mensaje del cliente. Usa una plantilla aprobada o espera a que escriba.' }, state }
  }
  try {
    const externalId = useTemplate
      ? await sendTemplate(config, input.phone, input.templateParams ?? [input.body.slice(0, 60)], graph)
      : await sendText(config, input.phone, input.body, graph)
    const body = useTemplate
      ? input.body || `Plantilla ${config.template}`
      : input.body
    const next = appendOutbound(state, {
      phone: input.phone,
      name: input.name,
      petName: input.petName,
      body,
      externalId,
    })
    return { result: { ok: true, externalId, mode: useTemplate ? 'template' : 'text' }, state: next }
  } catch (error) {
    return { result: { ok: false, error: error instanceof Error ? error.message : 'No se pudo enviar por WhatsApp.' }, state }
  }
}

const MEDIA_MAX = 16 * 1024 * 1024
const MEDIA_HOSTS = /(^|\.)(fbsbx\.com|fbcdn\.net|whatsapp\.net|whatsapp\.com|facebook\.com)$/
const INLINE_MIME = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr|opus|webm)|video\/(mp4|3gpp|webm)|application\/pdf)$/

export class MediaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type WaFile = { data: Buffer; mime: string; inline: boolean }

function describeMime(raw: string) {
  const mime = raw.split(';')[0]?.trim().toLowerCase() ?? ''
  return { mime: INLINE_MIME.test(mime) ? mime : 'application/octet-stream', inline: INLINE_MIME.test(mime) }
}

/**
 * Trae el archivo de un mensaje desde Meta y lo deja en disco: Meta borra los archivos a los pocos días
 * y así el historial del chat sigue mostrándolos.
 */
export async function loadWaMedia(
  config: Pick<WaConfig, 'token'> | null,
  id: string,
  dir: string,
  fetcher: typeof fetch = fetch,
): Promise<WaFile> {
  if (!MEDIA_ID.test(id)) throw new MediaError(404, 'Archivo no encontrado.')
  const data = path.join(dir, `${id}.bin`)
  const meta = path.join(dir, `${id}.mime`)
  if (fs.existsSync(data) && fs.existsSync(meta)) {
    return { data: fs.readFileSync(data), ...describeMime(fs.readFileSync(meta, 'utf8')) }
  }
  if (!config) throw new MediaError(503, 'WhatsApp no está conectado.')
  const headers = { authorization: `Bearer ${config.token}` }
  try {
    const info = await fetcher(`${GRAPH}/${id}`, { headers, signal: AbortSignal.timeout(15000) })
    if (!info.ok) throw new MediaError(404, 'Meta ya no tiene este archivo. Ábrelo en WhatsApp.')
    const found = (await info.json()) as { url?: string; mime_type?: string; file_size?: number }
    const url = found.url ? new URL(found.url) : null
    if (!url || url.protocol !== 'https:' || !MEDIA_HOSTS.test(url.hostname)) throw new MediaError(502, 'Meta devolvió una dirección no válida.')
    if (typeof found.file_size === 'number' && found.file_size > MEDIA_MAX) throw new MediaError(413, 'El archivo es muy pesado para verlo aquí. Ábrelo en WhatsApp.')
    const file = await fetcher(url, { headers, signal: AbortSignal.timeout(30000) })
    if (!file.ok) throw new MediaError(502, 'No se pudo bajar el archivo de Meta.')
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length > MEDIA_MAX) throw new MediaError(413, 'El archivo es muy pesado para verlo aquí. Ábrelo en WhatsApp.')
    const mime = found.mime_type ?? file.headers.get('content-type') ?? ''
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(data, bytes)
    fs.writeFileSync(meta, mime)
    return { data: bytes, ...describeMime(mime) }
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError(502, 'No se pudo bajar el archivo de Meta.')
  }
}
