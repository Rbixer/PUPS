import { addDays, daysBetween, isoDate } from './format'
import type { AppState, Conversation } from './types'

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function demoThreads(): Conversation[] {
  return [
    {
      id: 'wa-nube',
      phone: '+502 55551007',
      name: 'María López',
      petName: 'Nube',
      unread: 1,
      messages: [
        {
          id: 'wa-nube-1',
          direction: 'in',
          body: 'Hola, ¿la vacuna de Nube sigue hoy a las 3?',
          at: ago(18),
          status: 'recibido',
        },
      ],
    },
    {
      id: 'wa-luna',
      phone: '+502 55551005',
      name: 'Andrea Paz',
      petName: 'Luna',
      unread: 0,
      messages: [
        {
          id: 'wa-luna-1',
          direction: 'in',
          body: 'Confirmo el baño de Luna a las 9. Tiene la piel sensible.',
          at: ago(95),
          status: 'recibido',
        },
        {
          id: 'wa-luna-2',
          direction: 'out',
          body: 'Quedó anotado. La esperamos a las 9.',
          at: ago(80),
          status: 'enviado',
        },
      ],
    },
    {
      id: 'wa-mujito',
      phone: '+502 30063444',
      name: 'Anali Renteria',
      petName: 'Mujito',
      unread: 1,
      messages: [
        {
          id: 'wa-mujito-1',
          direction: 'out',
          body: 'Mujito ya está listo para recoger.',
          at: ago(240),
          status: 'enviado',
        },
        {
          id: 'wa-mujito-2',
          direction: 'in',
          body: 'Gracias, paso en un momento.',
          at: ago(26),
          status: 'recibido',
        },
      ],
    },
  ]
}

const ANCHOR = '2026-10-22'

function on(date: string) {
  return addDays(date, daysBetween(ANCHOR, isoDate()))
}

export const DATA_VERSION = 1

export function createSeed(): AppState {
  return {
    version: DATA_VERSION,
    revision: 1,
    sessionUserId: null,
    users: [
      {
        id: 'u-admin',
        name: 'Administración',
        username: 'admin',
        password: 'ba20fa37d86c34de9718be9356f63c618008fe45a876f9561aca1d23a8733bfb',
        role: 'Administrador',
        active: true,
      },
      {
        id: 'u-recepcion',
        name: 'Recepción',
        username: 'recepcion',
        password: 'ba20fa37d86c34de9718be9356f63c618008fe45a876f9561aca1d23a8733bfb',
        role: 'Recepción',
        active: true,
      },
    ],
    settings: {
      whatsapp: '',
      address: '',
      hours: '',
    },
    leads: [],
    conversations: demoThreads(),
    movements: [
      {
        id: 'mov-904',
        type: 'ingreso',
        date: on('2026-10-19'),
        concept: 'Servicio cita #904',
        amount: 155,
        method: 'Efectivo',
        notes: 'Cobro de la cita completada.',
        document: 'ING-904',
        folio: 904,
      },
      {
        id: 'mov-906',
        type: 'ingreso',
        date: on('2026-10-22'),
        concept: 'Consulta cita #906',
        amount: 220,
        method: 'Tarjeta',
        notes: '',
        document: 'ING-906',
        folio: 906,
      },
      {
        id: 'mov-eg-012',
        type: 'egreso',
        date: on('2026-10-21'),
        concept: 'Shampoo hipoalergénico',
        amount: 85,
        method: 'Efectivo',
        notes: 'Reposición de grooming.',
        document: 'EG-012',
      },
    ],
    appointments: [
      {
        id: 'apt-907',
        folio: 907,
        petName: 'Nube',
        date: on('2026-10-22'),
        time: '15:00',
        status: 'pendiente',
        clientName: 'María López',
        phone: '+502 55551007',
        sex: 'Hembra',
        breed: 'Poodle',
        service: 'Vacunación',
        size: 'Pequeño',
        coat: 'Rizado',
        allergies: '',
        cost: 150,
      },
      {
        id: 'apt-906',
        folio: 906,
        petName: 'Rocky',
        date: on('2026-10-22'),
        time: '10:30',
        status: 'completada',
        clientName: 'Carlos Méndez',
        phone: '+502 55551006',
        sex: 'Macho',
        breed: 'Labrador',
        service: 'Consulta veterinaria',
        size: 'Grande',
        coat: 'Corto',
        allergies: '',
        cost: 220,
      },
      {
        id: 'apt-905',
        folio: 905,
        petName: 'Luna',
        date: on('2026-10-22'),
        time: '09:00',
        status: 'pendiente',
        clientName: 'Andrea Paz',
        phone: '+502 55551005',
        sex: 'Hembra',
        breed: 'Mestizo',
        service: 'Baño y corte',
        size: 'Mediano',
        coat: 'Largo',
        allergies: 'Piel sensible',
        cost: 180,
      },
      {
        id: 'apt-903',
        folio: 903,
        petName: 'Kira',
        date: on('2026-10-21'),
        time: '16:00',
        status: 'completada',
        clientName: 'Luis Ortega',
        phone: '+502 55551003',
        sex: 'Hembra',
        breed: 'Schnauzer',
        service: 'Baño y corte',
        size: 'Mediano',
        coat: 'Duro',
        allergies: '',
        cost: 190,
      },
      {
        id: 'apt-902',
        folio: 902,
        petName: 'Coco',
        date: on('2026-10-20'),
        time: '12:00',
        status: 'cancelada',
        clientName: 'Sofía Ramos',
        phone: '+502 55551002',
        sex: 'Macho',
        breed: 'Beagle',
        service: 'Corte higiénico',
        size: 'Mediano',
        coat: 'Corto',
        allergies: '',
        cost: 0,
      },
      {
        id: 'apt-904',
        folio: 904,
        petName: 'MUJITO',
        date: on('2026-10-19'),
        time: '11:30',
        status: 'completada',
        clientName: 'ANALI RENTERIA',
        phone: '+502 30063444',
        sex: 'Macho',
        breed: 'FRENCH',
        service: '',
        size: 'Pequeño',
        coat: '',
        allergies: '',
        cost: 155,
      },
    ],
  }
}
