import type { BehaviorArea, CheckItem, GroomingPackage, GroomingReport } from './types'

export const GROOMING_PACKAGES: { id: GroomingPackage; label: string }[] = [
  { id: 'premium', label: 'Premium' },
  { id: 'estandar', label: 'Estándar' },
  { id: 'basico', label: 'Básico' },
  { id: 'paquete', label: 'Paquete' },
  { id: 'stripping', label: 'Stripping' },
]

export function packageOf(report?: Pick<GroomingReport, 'plan' | 'packageId'>): GroomingPackage {
  if (report?.packageId && GROOMING_PACKAGES.some((item) => item.id === report.packageId)) return report.packageId
  return report?.plan === 'premium' ? 'premium' : 'estandar'
}

export function packageLabel(report?: Pick<GroomingReport, 'plan' | 'packageId'>) {
  const id = packageOf(report)
  return GROOMING_PACKAGES.find((item) => item.id === id)?.label ?? 'Estándar'
}

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

/** La posición en `photos` no cambia nunca: 0 antes, 1 durante, 2 después; la segunda de durante se agregó al final. */
export const PHOTO_SLOTS = [
  { index: 0, label: 'Antes' },
  { index: 1, label: 'Durante' },
  { index: 3, label: 'Durante' },
  { index: 2, label: 'Después' },
] as const
const PHOTO_COUNT = 4

/** Áreas del grooming donde se anota si el perrito se deja trabajar o no. */
export const BEHAVIOR_AREAS: { key: BehaviorArea; label: string }[] = [
  { key: 'bano', label: 'Baño' },
  { key: 'secado', label: 'Secado' },
  { key: 'corte', label: 'Corte' },
  { key: 'unas', label: 'Uñas' },
]

const blank = (): CheckItem => ({ value: '', note: '' })

export function emptyReport(): GroomingReport {
  const ingreso: Record<string, CheckItem> = {}
  for (const item of INGRESO_ITEMS) ingreso[item.key] = blank()
  const egreso: Record<string, CheckItem> = {}
  for (const item of EGRESO_ITEMS) egreso[item.key] = blank()
  const behavior = {} as Record<BehaviorArea, CheckItem>
  for (const item of BEHAVIOR_AREAS) behavior[item.key] = blank()
  return {
    plan: 'grooming',
    packageId: 'estandar',
    address: '',
    age: '',
    weight: '',
    castrated: '',
    ingreso,
    egreso,
    behavior,
    recommendations: '',
    photos: Array.from({ length: PHOTO_COUNT }, () => ''),
  }
}

export function readReport(report?: GroomingReport): GroomingReport {
  const base = emptyReport()
  if (!report) return base
  return {
    ...base,
    ...report,
    packageId: packageOf(report),
    ingreso: { ...base.ingreso, ...report.ingreso },
    egreso: { ...base.egreso, ...report.egreso },
    behavior: { ...base.behavior!, ...report.behavior },
    photos: Array.from({ length: PHOTO_COUNT }, (_, index) => report.photos?.[index] ?? ''),
  }
}

/** Áreas donde la última visita que las marcó dice que tuvo dificultad. `reports` va de la más reciente a la más vieja. */
export function hardAreas(reports: (GroomingReport | undefined)[]) {
  return BEHAVIOR_AREAS.filter((area) => reports.find((report) => report?.behavior?.[area.key]?.value)?.behavior?.[area.key]?.value === 'si')
}
