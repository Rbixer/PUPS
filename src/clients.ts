import { digits, isoDate } from './format'
import { round2 } from './ops'
import type { AppState, Appointment, Movement, Sale } from './types'
import { petKey } from './visit'

export type ClientPet = { key: string; name: string; breed: string; size: string; allergies: string }

export type ClientProfile = {
  key: string
  name: string
  phone: string
  pets: ClientPet[]
  visits: Appointment[]
  sales: Sale[]
  pendingOrders: Movement[]
  completed: number
  cancelled: number
  services: number
  products: number
  pending: number
  total: number
  firstVisit: string
  lastVisit: string
  next?: Appointment
}

/** Agrupa por teléfono (últimos 8 dígitos) y, si falta, por nombre. */
export function clientKey(phone: string, name: string) {
  const line = digits(phone).slice(-8)
  return line ? `tel:${line}` : `nom:${name.trim().toLowerCase()}`
}

export function clientProfiles(state: AppState, today = isoDate()): ClientProfile[] {
  const map = new Map<string, ClientProfile>()
  const ensure = (phone: string, name: string) => {
    const key = clientKey(phone, name)
    let profile = map.get(key)
    if (!profile) {
      profile = {
        key,
        name: name.trim(),
        phone,
        pets: [],
        visits: [],
        sales: [],
        pendingOrders: [],
        completed: 0,
        cancelled: 0,
        services: 0,
        products: 0,
        pending: 0,
        total: 0,
        firstVisit: '',
        lastVisit: '',
      }
      map.set(key, profile)
    }
    if (!profile.name && name.trim()) profile.name = name.trim()
    if (!profile.phone && phone) profile.phone = phone
    return profile
  }

  for (const visit of state.appointments) {
    if (!visit.clientName.trim() && !visit.phone.trim()) continue
    const profile = ensure(visit.phone, visit.clientName)
    profile.visits.push(visit)
    const key = petKey(visit)
    if (visit.petName.trim() && !profile.pets.some((pet) => pet.key === key)) {
      profile.pets.push({ key, name: visit.petName, breed: visit.breed, size: visit.size, allergies: visit.allergies })
    }
    if (visit.status === 'completada') {
      profile.completed += 1
      profile.services += visit.cost
    }
    if (visit.status === 'cancelada') profile.cancelled += 1
  }

  for (const sale of state.sales ?? []) {
    if (sale.status === 'anulada' || (!sale.clientName.trim() && !sale.phone)) continue
    const profile = ensure(sale.phone, sale.clientName)
    profile.sales.push(sale)
    if (sale.status === 'pagada') profile.products += sale.total
  }

  for (const movement of state.movements) {
    if (movement.type !== 'ingreso' || movement.method !== 'Pedido') continue
    const phone = movement.notes.split('\n').find((line) => digits(line).length >= 8) ?? ''
    const name = movement.concept.replace(/^Tienda · /, '')
    const profile = ensure(phone.trim(), name)
    profile.pendingOrders.push(movement)
    profile.pending += movement.amount
  }

  return [...map.values()]
    .map((profile) => {
      const ordered = [...profile.visits].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      const dates = [...profile.visits.map((item) => item.date), ...profile.sales.map((item) => item.date)].sort()
      const next = [...profile.visits]
        .filter((item) => item.status === 'pendiente' && item.date >= today)
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0]
      return {
        ...profile,
        visits: ordered,
        sales: [...profile.sales].sort((a, b) => b.at.localeCompare(a.at)),
        services: round2(profile.services),
        products: round2(profile.products),
        pending: round2(profile.pending),
        total: round2(profile.services + profile.products),
        firstVisit: dates[0] ?? '',
        lastVisit: dates[dates.length - 1] ?? '',
        next,
      }
    })
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit) || a.name.localeCompare(b.name))
}
