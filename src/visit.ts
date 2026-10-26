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
  premium: ['bano', 'cepillado', 'unas', 'oidos', 'deslanado', 'dientes', 'glandulas'],
}

export function priceFor(plan: PlanId, size: string) {
  return TARIFF[plan][size] ?? null
}

export function planOf(appointment: Appointment): PlanId {
  if (appointment.report?.plan === 'premium') return 'premium'
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

export function slotTaken(appointments: Appointment[], date: string, time: string, service: string, ignoreId = 'probe') {
  const probe: Appointment = {
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
  return appointments.some((item) => overlaps(probe, item))
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
  if (report.egreso.dientes?.value !== 'si') gaps.push('cepillado de dientes')
  if (report.egreso.glandulas?.value !== 'si') gaps.push('extracción de glándulas')
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
  visits: Appointment[]
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
