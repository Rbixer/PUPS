import type { ControlField, ControlRow } from './types'

export const CONTROL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const CONTROL_MONEY: { field: ControlField; label: string; group: string }[] = [
  { field: 'hospedaje', label: 'Hospedaje', group: 'Servicio' },
  { field: 'domicilio', label: 'Domicilio', group: 'Servicio' },
  { field: 'bien', label: 'Bien', group: 'Servicio' },
  { field: 'local', label: 'Local', group: 'Gastos' },
  { field: 'telefono', label: 'Teléfono', group: 'Gastos' },
  { field: 'internet', label: 'Internet', group: 'Gastos' },
  { field: 'luz', label: 'Luz', group: 'Gastos' },
  { field: 'impuesto', label: 'Impuesto', group: 'Gastos' },
  { field: 'afp', label: 'AFP', group: 'Gastos' },
  { field: 'planilla', label: 'Planilla', group: 'Planilla' },
  { field: 'deas', label: 'DEAS', group: 'Planilla' },
  { field: 'extra', label: 'Extra', group: 'Planilla' },
  { field: 'bonos', label: 'Bonos', group: 'Planilla' },
  { field: 'comision', label: 'Comisión', group: 'Comisión' },
  { field: 'prestamo', label: 'Préstamo', group: 'Comisión' },
  { field: 'proveedores', label: 'Proveedores', group: 'Proveedores' },
]

export const CONTROL_COUNTS: { field: ControlField; label: string; group: string }[] = [
  { field: 'basico', label: 'Básico', group: 'Paquetes' },
  { field: 'estandar', label: 'Estándar', group: 'Paquetes' },
  { field: 'premium', label: 'Premium', group: 'Paquetes' },
  { field: 'diferencia', label: 'Diferencia', group: 'Diferencia' },
  { field: 'hospedajeCant', label: 'Hospedaje', group: 'Cantidad' },
  { field: 'domicilioCant', label: 'Domicilio', group: 'Cantidad' },
  { field: 'ventas', label: 'Ventas', group: 'Ventas' },
]

export const CONTROL_SERVICE: ControlField[] = ['hospedaje', 'domicilio', 'bien']
export const CONTROL_EXPENSE: ControlField[] = CONTROL_MONEY.filter((item) => item.group !== 'Servicio').map((item) => item.field)

export type ControlLine = {
  label: string
  month: number
  values: Record<ControlField, number>
  gastos: number
  disponible: number
  servicio: number
  paquetes: number
}

export function controlFilename(year: number, ext: 'xlsx' | 'pdf') {
  return `pups-control-general-${year}.${ext}`
}

export function controlSheet(year: number, rows: ControlRow[]) {
  const months = CONTROL_MONTHS.map((label, index) => lineFrom(label, index + 1, rows.find((item) => item.year === year && item.month === index + 1)))
  const values = blankValues()
  for (const column of [...CONTROL_MONEY, ...CONTROL_COUNTS]) {
    values[column.field] = months.reduce((total, item) => total + item.values[column.field], 0)
  }
  const servicio = CONTROL_SERVICE.reduce((total, field) => total + values[field], 0)
  const gastos = CONTROL_EXPENSE.reduce((total, field) => total + values[field], 0)
  const totals: ControlLine = {
    label: 'Total',
    month: 0,
    values,
    servicio,
    gastos,
    disponible: servicio - gastos,
    paquetes: values.basico + values.estandar + values.premium,
  }
  return { year, months, totals }
}

export function controlGroups(columns: { group: string }[]) {
  const groups: { label: string; span: number; tone: string }[] = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last?.label === column.group) last.span += 1
    else groups.push({ label: column.group, span: 1, tone: column.group.toLowerCase() })
  }
  const resultIndex = groups.findIndex((group) => group.label === 'Proveedores')
  groups.splice(resultIndex + 1, 0, { label: 'Resultado', span: 3, tone: 'resultado' })
  groups.push({ label: 'Total', span: 1, tone: 'resultado' })
  return groups
}

function lineFrom(label: string, month: number, row: ControlRow | undefined): ControlLine {
  const values = blankValues()
  for (const column of [...CONTROL_MONEY, ...CONTROL_COUNTS]) values[column.field] = row?.values[column.field] ?? 0
  const servicio = CONTROL_SERVICE.reduce((total, field) => total + values[field], 0)
  const gastos = CONTROL_EXPENSE.reduce((total, field) => total + values[field], 0)
  return {
    label,
    month,
    values,
    servicio,
    gastos,
    disponible: servicio - gastos,
    paquetes: values.basico + values.estandar + values.premium,
  }
}

function blankValues() {
  const values = {} as Record<ControlField, number>
  for (const column of [...CONTROL_MONEY, ...CONTROL_COUNTS]) values[column.field] = 0
  return values
}
