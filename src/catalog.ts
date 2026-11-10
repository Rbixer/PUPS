export const SERVICES = [
  {
    name: 'Baño y secado',
    detail: 'Baño con producto según el pelaje, secado y cepillado para dejar el manto suelto.',
  },
  {
    name: 'Corte de raza',
    detail: 'Corte a tijera o máquina, respetando la forma de la raza y el largo que pidas.',
  },
  {
    name: 'Baño y corte',
    detail: 'El grooming completo: baño, corte, oídos, uñas y acabado.',
  },
  {
    name: 'Corte higiénico',
    detail: 'Zonas sensibles, almohadillas y uñas. Útil entre cortes completos.',
  },
  {
    name: 'Grooming premium',
    detail: 'Todo el grooming más deslanado, cepillado de dientes y extracción de glándulas.',
  },
  {
    name: 'Pet shop',
    detail: 'Alimento, accesorios y cuidado para llevar a casa.',
  },
] as const

export const SIZES = ['Pequeño', 'Mediano', 'Grande'] as const
export const SEXES = ['Macho', 'Hembra'] as const
export const COATS = ['Corto', 'Largo', 'Rizado', 'Duro'] as const
/** Medios con los que de verdad entra o sale dinero. "Pedido" lo usan solo los pedidos de la tienda por cobrar. */
export const METHODS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'] as const
/** Los gastos salen de la caja chica salvo que se pague de otra forma. */
export const EXPENSE_METHODS = ['Caja chica', ...METHODS] as const

export const SERVICE_NAMES: string[] = SERVICES.map((service) => service.name)

/** Lo que se agenda con hora; la tienda se pide aparte. */
export const BOOKABLE_SERVICES: string[] = SERVICE_NAMES.filter((name) => name !== 'Pet shop')
