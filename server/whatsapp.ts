import { createHmac, timingSafeEqual } from 'node:crypto'
import { digits, newId, normalizePhone } from '../src/format'
import type { AppState, Conversation, WaDelivery, WaMessage } from '../src/types'

const GRAPH = 'https://graph.facebook.com/v21.0'
const WINDOW_MS = 24 * 60 * 60 * 1000
export const RESERVA_TEMPLATE = 'reserva_nueva'

export type WaConfig = {
  token: string
  phoneNumberId: string
  verifyToken: string
  appSecret: string
  template: string
}

export function loadWaConfig(env: NodeJS.ProcessEnv = process.env): WaConfig | null {
  const token = env.WA_TOKEN?.trim() ?? ''
  const phoneNumberId = env.WA_PHONE_NUMBER_ID?.trim() ?? ''
  const verifyToken = env.WA_VERIFY_TOKEN?.trim() ?? ''
  const appSecret = env.WA_APP_SECRET?.trim() ?? ''
  if (!token || !phoneNumberId || !verifyToken || !appSecret) return null
  return { token, phoneNumberId, verifyToken, appSecret, template: env.WA_TEMPLATE?.trim() || RESERVA_TEMPLATE }
}

export function waStatus(config: WaConfig | null) {
  return {
    configured: Boolean(config),
    phoneNumberId: config ? config.phoneNumberId : '',
    template: config?.template ?? RESERVA_TEMPLATE,
  }
}

export function verifyWebhook(config: WaConfig, params: URLSearchParams) {
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
  input: { phone: string; name?: string; petName?: string; body: string; externalId: string; at?: string },
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
  }
  return pushMessage(withThread, thread.id, message, false)
}

const STATUS_MAP: Record<string, WaDelivery> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
}

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
        messages?: { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } }[]
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
        if (item.type && item.type !== 'text') continue
        const body = item.text?.body?.trim()
        if (!body) continue
        const at = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString()
        const existing = findThread(next.conversations, item.from)
        if (existing?.messages.some((message) => message.externalId === item.id)) continue
        const prepared = upsertThread(next, item.from, contactName)
        next = prepared.state
        const message: WaMessage = {
          id: newId(),
          direction: 'in',
          body,
          at,
          status: 'recibido',
          externalId: item.id,
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
