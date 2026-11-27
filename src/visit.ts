import type { Appointment, GroomingReport } from './types'

export type PlanId = 'grooming' | 'premium'

export const PLAN_MINUTES: Record<PlanId, number> = {
  grooming: 60,
  premium: 90,
}

/** Pequeño de grooming queda en Q 155, el monto de la cita real. El resto es referencia por tamaño. */
export const TARIFF: Record<PlanId, Record<string, number>> = {
  grooming: { Pequeño: 155, Mediano: 190, Grande: 240 },
  premium: { Pequeño: 220, Mediano: 270, Grande: 340 },
}

const INCLUDED: Record<PlanId, string[]> = {
  grooming: ['bano', 'cepillado', 'unas', 'oidos'],
  // Dientes y glándulas van en el paquete, pero el cliente a veces no los pide: no se marcan solos ni frenan la constancia.
  premium: ['bano', 'cepillado', 'unas', 'oidos', 'deslanado'],
}

export function priceFor(plan: PlanId, size: string) {
  return TARIFF[plan][size] ?? null
}

export function planOf(appointment: Appointment): PlanId {
  if (appointment.packageId === 'premium') return 'premium'
  if (appointment.packageId) return 'grooming'
  if (appointment.report?.plan === 'premium' || appointment.report?.packageId === 'premium') return 'premium'
  if (appointment.service.toLowerCase().includes('premium')) return 'premium'
  return 'grooming'
}

export function visitMinutes(appointment: Appointment) {
  const service = appointment.service.toLowerCase()
  if (planOf(appointment) === 'premium') return PLAN_MINUTES.premium
  if (service.includes('consulta') || service.includes('vacun') || service.includes('despara')) return 30
  return PLAN_MINUTES.grooming
}

function startMinute(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

export function overlaps(left: Appointment, right: Appointment) {
  if (left.id === right.id || left.date !== right.date) return false
  if (left.status === 'cancelada' || right.status === 'cancelada') return false
  const leftStart = startMinute(left.time)
  const rightStart = startMinute(right.time)
  const leftEnd = leftStart + visitMinutes(left)
  const rightEnd = rightStart + visitMinutes(right)
  return leftStart < rightEnd && rightStart < leftEnd
}

/** Horarios que ofrece el sitio público: de 8:00 a 18:00 cada media hora. */
export const BOOKING_SLOTS = Array.from({ length: ((18 - 8) * 60) / 30 + 1 }, (_, index) => {
  const total = 8 * 60 + index * 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})

export function slotPassed(date: string, time: string, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (date !== today) return date < today
  return startMinute(time) <= now.getHours() * 60 + now.getMinutes()
}

/** Máximo de citas que pueden compartir el mismo tramo de horario. */
export const SLOT_CAPACITY = 3

function slotProbe(date: string, time: string, service: string, ignoreId = 'probe'): Appointment {
  return {
    id: ignoreId,
    folio: 0,
    petName: '',
    date,
    time,
    status: 'pendiente',
    clientName: '',
    phone: '',
    sex: '',
    breed: '',
    service,
    size: '',
    coat: '',
    allergies: '',
    cost: 0,
  }
}

/** Cuántas citas se traslapan con ese horario (sin contar la que se está editando). */
export function slotCount(appointments: Appointment[], date: string, time: string, service: string, ignoreId = 'probe') {
  const probe = slotProbe(date, time, service, ignoreId)
  return appointments.filter((item) => overlaps(probe, item)).length
}

/** True cuando el cupo del horario ya está lleno (3 citas). */
export function slotTaken(appointments: Appointment[], date: string, time: string, service: string, ignoreId = 'probe') {
  return slotCount(appointments, date, time, service, ignoreId) >= SLOT_CAPACITY
}

export function applyPlan(report: GroomingReport, plan: PlanId): GroomingReport {
  const egreso = { ...report.egreso }
  for (const key of INCLUDED[plan]) {
    const current = egreso[key] ?? { value: '' as const, note: '' }
    if (current.value === '') egreso[key] = { ...current, value: 'si' }
  }
  return { ...report, plan, egreso }
}

export function premiumGaps(report: GroomingReport) {
  const gaps: string[] = []
  if (!report.photos[0]) gaps.push('foto de antes')
  if (!report.photos[2]) gaps.push('foto de después')
  if (report.egreso.bano?.value !== 'si') gaps.push('baño')
  if (report.egreso.deslanado?.value !== 'si' && report.egreso.desenredado?.value !== 'si') gaps.push('deslanado o desenredado')
  return gaps
}

export function petKey(item: Pick<Appointment, 'petName' | 'phone' | 'clientName'>) {
  const phone = item.phone.replace(/\D/g, '')
  const owner = phone || item.clientName.trim().toLowerCase()
  return `${item.petName.trim().toLowerCase()}::${owner}`
}

export type PetFile = {
  key: string
  petName: string
  clientName: string
  phone: string
  breed: string
  sex: string
  size: string
  coat: string
  allergies: string
  age: string
  weight: string
  petCode?: string
  visits: Appointment[]
}

/** Siguiente código P-1001, P-1002… según los ya usados. */
export function nextPetCode(appointments: Appointment[]) {
  let max = 1000
  for (const item of appointments) {
    const match = /^P-(\d+)$/i.exec((item.petCode ?? '').trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `P-${max + 1}`
}

/** Reusa el código de visitas previas de la misma mascota, o asigna uno nuevo. */
export function resolvePetCode(
  appointments: Appointment[],
  pet: Pick<Appointment, 'petName' | 'phone' | 'clientName' | 'petCode'>,
) {
  const wanted = (pet.petCode ?? '').trim()
  if (wanted) return wanted
  const key = petKey(pet)
  const previous = appointments.find((item) => petKey(item) === key && item.petCode?.trim())
  if (previous?.petCode?.trim()) return previous.petCode.trim()
  return nextPetCode(appointments)
}

export function petFiles(appointments: Appointment[]): PetFile[] {
  const groups = new Map<string, Appointment[]>()
  for (const item of appointments) {
    const key = petKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
    .map(([key, visits]) => {
      const ordered = [...visits].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      const latest = ordered[0]
      const withReport = ordered.find((item) => item.report)
      return {
        key,
        petName: latest.petName,
        clientName: latest.clientName,
        phone: latest.phone,
        breed: latest.breed,
        sex: latest.sex,
        size: latest.size,
        coat: latest.coat,
        allergies: ordered.find((item) => item.allergies.trim())?.allergies ?? '',
        age: withReport?.report?.age ?? '',
        weight: ordered.find((item) => item.report?.weight)?.report?.weight ?? '',
        petCode: ordered.find((item) => item.petCode?.trim())?.petCode,
        visits: ordered,
      }
    })
    .sort((a, b) => `${b.visits[0].date}T${b.visits[0].time}`.localeCompare(`${a.visits[0].date}T${a.visits[0].time}`))
}

export function visitPhoto(appointment: Appointment, slot: 'antes' | 'despues') {
  if (slot === 'antes') return appointment.beforePhoto ?? appointment.report?.photos?.[0] ?? ''
  return appointment.afterPhoto ?? appointment.report?.photos?.[2] ?? ''
}

export function ingresoLabels(appointment?: Appointment) {
  if (!appointment?.report) return []
  const labels: Record<string, string> = {
    nudos: 'Nudos',
    'nudos-piel': 'Nudos pegados a la piel',
    'unas-normales': 'Uñas normales',
    'unas-largas': 'Uñas largas',
    'unas-encarnadas': 'Uñas encarnadas',
    'oidos-normales': 'Oídos normales',
    'oidos-sucios': 'Oídos sucios',
    bultos: 'Bultos o cicatrices',
    parasitos: 'Pulgas o garrapatas',
  }
  return Object.entries(appointment.report.ingreso)
    .filter(([, item]) => item.value === 'si')
    .map(([key, item]) => (item.note.trim() ? `${labels[key] ?? key} (${item.note.trim()})` : labels[key] ?? key))
}
