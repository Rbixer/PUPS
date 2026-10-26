import type { CheckItem, GroomingReport } from './types'

export const INGRESO_ITEMS: { key: string; label: string }[] = [
  { key: 'nudos', label: 'Nudos' },
  { key: 'nudos-piel', label: 'Nudos pegados a la piel' },
  { key: 'unas-normales', label: 'Uñas normales' },
  { key: 'unas-largas', label: 'Uñas largas' },
  { key: 'unas-encarnadas', label: 'Uñas encarnadas' },
  { key: 'oidos-normales', label: 'Oídos normales' },
  { key: 'oidos-sucios', label: 'Oídos sucios' },
  { key: 'bultos', label: 'Bultos, hernias, verrugas, tumores o cicatrices' },
  { key: 'parasitos', label: 'Pulgas o garrapatas' },
] 

export const EGRESO_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: 'Corte',
    items: [
      { key: 'maquina', label: 'Corte de pelo con máquina' },
      { key: 'tijera', label: 'Corte de pelo con tijera' },
      { key: 'deslanado', label: 'Deslanado' },
      { key: 'desenredado', label: 'Desenredado' },
      { key: 'oidos', label: 'Limpieza de oídos' },
    ],
  },
  {
    title: 'Cuidado',
    items: [
      { key: 'unas', label: 'Corte de uñas' },
      { key: 'dientes', label: 'Cepillado de dientes' },
      { key: 'glandulas', label: 'Extracción de glándulas' },
      { key: 'higienico', label: 'Higiénico' },
      { key: 'bano', label: 'Baño' },
      { key: 'cepillado', label: 'Cepillado' },
    ],
  },
]

export const EGRESO_ITEMS = EGRESO_GROUPS.flatMap((group) => group.items)
export const PHOTO_LABELS = ['Antes', 'Durante', 'Después'] as const

const blank = (): CheckItem => ({ value: '', note: '' })

export function emptyReport(): GroomingReport {
  const ingreso: Record<string, CheckItem> = {}
  for (const item of INGRESO_ITEMS) ingreso[item.key] = blank()
  const egreso: Record<string, CheckItem> = {}
  for (const item of EGRESO_ITEMS) egreso[item.key] = blank()
  return {
    plan: 'grooming',
    address: '',
    age: '',
    weight: '',
    castrated: '',
    ingreso,
    egreso,
    recommendations: '',
    photos: ['', '', ''],
  }
}

export function readReport(report?: GroomingReport): GroomingReport {
  const base = emptyReport()
  if (!report) return base
  return {
    ...base,
    ...report,
    ingreso: { ...base.ingreso, ...report.ingreso },
    egreso: { ...base.egreso, ...report.egreso },
    photos: PHOTO_LABELS.map((_, index) => report.photos?.[index] ?? ''),
  }
}
