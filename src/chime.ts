type HeardThread = { messages?: { id?: string; direction?: string }[] }

const listeners = new Set<(count: number) => void>()

/** Cuenta mensajes entrantes que todavía no estaban en `seen`. Devuelve el conjunto actualizado. */
export function incomingCount(seen: ReadonlySet<string>, threads: HeardThread[] | undefined) {
  const next = new Set<string>()
  let count = 0
  for (const thread of threads ?? []) {
    for (const message of thread.messages ?? []) {
      if (message.direction !== 'in' || !message.id) continue
      next.add(message.id)
      if (!seen.has(message.id)) count += 1
    }
  }
  return { count, next }
}

export function onIncoming(listener: (count: number) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitIncoming(count: number) {
  if (count < 1) return
  for (const listener of listeners) listener(count)
}

function buildWav(pcm: Int16Array, rate: number) {
  const bytes = new Uint8Array(44 + pcm.length * 2)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index)
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  for (let index = 0; index < pcm.length; index += 1) view.setInt16(44 + index * 2, pcm[index], true)
  return bytes
}

/** Dos notas cortas, parecidas al aviso de un mensaje. */
export function buildChimeWav() {
  const rate = 22050
  const total = Math.floor(rate * 0.42)
  const pcm = new Int16Array(total)
  const tone = (time: number, frequency: number, start: number) => {
    const elapsed = time - start
    if (elapsed < 0) return 0
    return Math.sin(2 * Math.PI * frequency * time) * Math.exp(-elapsed * 9)
  }
  for (let index = 0; index < total; index += 1) {
    const time = index / rate
    const attack = Math.min(1, time / 0.008)
    const sample = attack * (tone(time, 784, 0) * 0.5 + tone(time, 1175, 0.12) * 0.38)
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767)
  }
  return buildWav(pcm, rate)
}

/** Silencio breve para desbloquear el audio con el primer toque, sin que se oiga nada. */
export function buildSilentWav() {
  return buildWav(new Int16Array(1600), 8000)
}
