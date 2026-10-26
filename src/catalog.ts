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
    name: 'Consulta veterinaria',
    detail: 'Revisión clínica. Motivo, alergias y el siguiente paso quedan en la ficha.',
  },
  {
    name: 'Vacunación',
    detail: 'Aplicación y registro de la vacuna en la visita, con constancia imprimible.',
  },
  {
    name: 'Desparasitación',
    detail: 'Control interno o externo, anotado junto al peso del servicio.',
  },
  {
    name: 'Pet shop',
    detail: 'Alimento, accesorios y cuidado para llevar. El cobro entra a caja como ingreso.',
  },
] as const

export const SIZES = ['Pequeño', 'Mediano', 'Grande'] as const
export const SEXES = ['Macho', 'Hembra'] as const
export const COATS = ['Corto', 'Largo', 'Rizado', 'Duro'] as const
export const METHODS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'] as const

export const SERVICE_NAMES: string[] = SERVICES.map((service) => service.name)
