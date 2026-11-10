import { isoDate } from './format'
import { packageOf } from './grooming'
import { PETTY_REFILL } from './ops'
import type { AppState, ControlField, ControlRow, Movement } from './types'

export const CONTROL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const CONTROL_GOAL = 350

export type ControlCalc = 'gastos' | 'disponible' | 'ingresos' | 'paquetes'

export type ControlColumn = { label: string; group: string; money: boolean } & ({ field: ControlField; calc?: undefined } | { calc: ControlCalc; field?: undefined })

export const CONTROL_COLUMNS: ControlColumn[] = [
  { field: 'servicio', label: 'Servicio', group: 'Ingresos', money: true },
  { field: 'hospedaje', label: 'Hospedaje', group: 'Ingresos', money: true },
  { field: 'domicilio', label: 'Domicilio', group: 'Ingresos', money: true },
  { field: 'bien', label: 'Bien', group: 'Ingresos', money: true },
  { field: 'local', label: 'Local', group: 'Gastos', money: true },
  { field: 'telefono', label: 'Teléfono', group: 'Gastos', money: true },
  { field: 'internet', label: 'Internet', group: 'Gastos', money: true },
  { field: 'luz', label: 'Luz', group: 'Gastos', money: true },
  { field: 'impuesto', label: 'Impuesto', group: 'Gastos', money: true },
  { field: 'afp', label: 'App', group: 'Gastos', money: true },
  { field: 'planilla', label: 'Planilla', group: 'Planilla', money: true },
  { field: 'deas', label: 'Días extras', group: 'Planilla', money: true },
  { field: 'bonos', label: 'Bonos', group: 'Planilla', money: true },
  { field: 'comision', label: 'Comisión', group: 'Planilla', money: true },
  { field: 'prestamo', label: 'Préstamos', group: 'Planilla', money: true },
  { field: 'proveedores', label: 'Proveedores', group: 'Otros', money: true },
  { field: 'gastos', label: 'Gastos', group: 'Otros', money: true },
  { calc: 'gastos', label: 'Gastos', group: 'Resultado', money: true },
  { calc: 'disponible', label: 'Disponible', group: 'Resultado', money: true },
  { calc: 'ingresos', label: 'Ingresos', group: 'Resultado', money: true },
  { field: 'basico', label: 'Básico', group: 'Paquetes', money: false },
  { field: 'estandar', label: 'Estándar', group: 'Paquetes', money: false },
  { field: 'premium', label: 'Premium', group: 'Paquetes', money: false },
  { calc: 'paquetes', label: 'Total', group: 'Paquetes', money: false },
  { field: 'diferencia', label: 'Diferencia', group: 'Meta', money: false },
  { field: 'hospedajeCant', label: 'Hospedaje', group: 'Cantidad', money: false },
  { field: 'domicilioCant', label: 'Domicilio', group: 'Cantidad', money: false },
  { field: 'ventas', label: 'Ventas', group: 'Cantidad', money: false },
]

export const CONTROL_FIELDS = CONTROL_COLUMNS.flatMap((column) => (column.field ? [column.field] : []))
export const CONTROL_INCOME: ControlField[] = ['servicio', 'hospedaje', 'domicilio', 'bien']
export const CONTROL_EXPENSE: ControlField[] = CONTROL_COLUMNS.flatMap((column) =>
  column.field && column.money && !CONTROL_INCOME.includes(column.field) ? [column.field] : [],
)

export type ControlLine = {
  label: string
  month: number
  values: Record<ControlField, number>
  auto: Record<ControlField, number>
  /** Celdas escritas a mano: reemplazan el cálculo automático. */
  manual: Partial<Record<ControlField, true>>
  gastos: number
  disponible: number
  ingresos: number
  paquetes: number
}

export function controlFilename(year: number, ext: 'xlsx' | 'pdf') {
  return `pups-control-general-${year}.${ext}`
}

export function columnValue(line: ControlLine, column: ControlColumn) {
  return column.field ? line.values[column.field] : line[column.calc]
}

export function controlSheet(year: number, rows: ControlRow[], state?: AppState, goal = CONTROL_GOAL) {
  const auto = state ? controlAuto(state, year, goal) : undefined
  const months = CONTROL_MONTHS.map((label, index) => {
    const month = index + 1
    return lineFrom(label, month, rows.find((item) => item.year === year && item.month === month), auto?.[index] ?? blankValues())
  })
  const values = blankValues()
  for (const field of CONTROL_FIELDS) values[field] = round2(months.reduce((total, item) => total + item.values[field], 0))
  return { year, months, totals: withTotals('Total', 0, values, values, {}) }
}

export function controlGroups(columns: { group: string }[]) {
  const groups: { label: string; span: number; tone: string }[] = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last?.label === column.group) last.span += 1
    else groups.push({ label: column.group, span: 1, tone: column.group.toLowerCase() })
  }
  return groups
}

/** Lo que la app ya sabe de cada mes: ingresos, gastos por rubro, planilla y conteos. */
export function controlAuto(state: AppState, year: number, goal = CONTROL_GOAL) {
  const months = CONTROL_MONTHS.map(() => blankValues())
  const prefix = `${year}-`
  const byId = new Map(state.movements.map((item) => [item.id, item]))
  const appointments = new Map(state.appointments.map((item) => [item.folio, item]))
  const payrolls = new Map((state.payrolls ?? []).map((item) => [item.id, item]))
  const payables = new Map((state.payables ?? []).map((item) => [item.id, item]))
  const fixed = new Map((state.fixedCosts ?? []).map((item) => [item.id, item]))

  const incomeField = (movement: Movement): ControlField | null => {
    if (movement.method === 'Pedido' || NOT_REVENUE.has(movement.category ?? '')) return null
    if (movement.saleId) return 'bien'
    const service = movement.folio !== undefined ? appointments.get(movement.folio)?.service ?? '' : ''
    const text = `${movement.concept} ${movement.category ?? ''} ${service}`
    if (/hospedaje|hotel|guarder[ií]a/i.test(text)) return 'hospedaje'
    if (/domicilio/i.test(text)) return 'domicilio'
    return 'servicio'
  }

  for (const movement of state.movements) {
    if (!movement.date.startsWith(prefix)) continue
    const values = months[Number(movement.date.slice(5, 7)) - 1]
    if (!values) continue
    const amount = movement.amount
    if (movement.type === 'ingreso') {
      const field = incomeField(movement)
      if (!field) continue
      values[field] += amount
      if (field === 'hospedaje') values.hospedajeCant += 1
      if (field === 'domicilio') values.domicilioCant += 1
      continue
    }
    if (movement.reverses) {
      const original = byId.get(movement.reverses)
      const field = original?.type === 'ingreso' ? incomeField(original) : null
      if (field) values[field] -= amount
      else values.gastos += amount
      continue
    }
    if (movement.category === PETTY_REFILL) continue
    const run = movement.payrollId ? payrolls.get(movement.payrollId) : undefined
    if (run) {
      const commission = round2(run.lines.reduce((sum, line) => sum + line.commission, 0))
      const extra = round2(run.lines.reduce((sum, line) => sum + line.extra, 0))
      values.comision += commission
      values.deas += extra
      values.planilla += amount - commission - extra
      continue
    }
    const payable = movement.payableId ? payables.get(movement.payableId) : undefined
    if (payable?.payrollId) {
      values.planilla += amount
      continue
    }
    if (movement.purchaseId || payable?.purchaseId) {
      values.proveedores += amount
      continue
    }
    const cost = movement.fixedId ? fixed.get(movement.fixedId) : undefined
    const field =
      (cost && (expenseField(cost.name) ?? expenseField(cost.category))) ??
      expenseField(movement.category ?? '') ??
      expenseField(movement.concept) ??
      (payable ? 'proveedores' : 'gastos')
    values[field] += amount
  }

  for (const appointment of state.appointments) {
    if (appointment.status !== 'completada' || !appointment.report || !appointment.date.startsWith(prefix)) continue
    const values = months[Number(appointment.date.slice(5, 7)) - 1]
    const pack = packageOf(appointment.report)
    if (values && (pack === 'basico' || pack === 'estandar' || pack === 'premium')) values[pack] += 1
  }

  for (const sale of state.sales ?? []) {
    if (sale.status !== 'pagada' || !sale.date.startsWith(prefix)) continue
    const values = months[Number(sale.date.slice(5, 7)) - 1]
    if (values) values.ventas += sale.lines.reduce((sum, line) => sum + (line.productId ? line.qty : 0), 0)
  }

  const current = isoDate().slice(0, 7)
  const active = new Set([...state.movements, ...state.appointments].filter((item) => item.date.startsWith(prefix)).map((item) => item.date.slice(0, 7)))
  months.forEach((values, index) => {
    for (const field of CONTROL_FIELDS) values[field] = round2(values[field])
    const period = `${year}-${String(index + 1).padStart(2, '0')}`
    values.diferencia = period <= current && active.has(period) ? goal - (values.basico + values.estandar + values.premium) : 0
  })
  return months
}

const NOT_REVENUE = new Set(['Aporte de capital', 'Préstamo recibido', 'Otro ingreso no gravado'])

const EXPENSE_RULES: [RegExp, ControlField][] = [
  [/alquiler|renta|arrendamiento|\blocal\b/i, 'local'],
  [/tel[eé]fono|celular|m[oó]vil/i, 'telefono'],
  [/internet|wifi|cable/i, 'internet'],
  [/\bluz\b|energ[ií]a|electricidad|eegsa/i, 'luz'],
  [/impuesto|\bsat\b|\biva\b|\bisr\b/i, 'impuesto'],
  [/\bapps?\b|aplicaci[oó]n|software|suscripci[oó]n|sistema/i, 'afp'],
  [/pr[eé]stamo/i, 'prestamo'],
  [/\bbono|bonificaci[oó]n/i, 'bonos'],
  [/planilla|igss|prestaciones|anticipo|sueldo|salario|aguinaldo/i, 'planilla'],
  [/proveedor|insumo|mercader[ií]a|compra/i, 'proveedores'],
]

function expenseField(text: string): ControlField | null {
  for (const [pattern, field] of EXPENSE_RULES) if (pattern.test(text)) return field
  return null
}

function lineFrom(label: string, month: number, row: ControlRow | undefined, auto: Record<ControlField, number>): ControlLine {
  const stored = { ...row?.values }
  if (stored.deas === undefined && stored.extra !== undefined) stored.deas = stored.extra
  const values = { ...auto }
  const manual: ControlLine['manual'] = {}
  for (const field of CONTROL_FIELDS) {
    const value = stored[field]
    if (typeof value === 'number' && Number.isFinite(value)) {
      values[field] = value
      manual[field] = true
    }
  }
  return withTotals(label, month, values, auto, manual)
}

function withTotals(label: string, month: number, values: Record<ControlField, number>, auto: Record<ControlField, number>, manual: ControlLine['manual']): ControlLine {
  const ingresos = round2(CONTROL_INCOME.reduce((total, field) => total + values[field], 0))
  const gastos = round2(CONTROL_EXPENSE.reduce((total, field) => total + values[field], 0))
  return {
    label,
    month,
    values,
    auto,
    manual,
    ingresos,
    gastos,
    disponible: round2(ingresos - gastos),
    paquetes: values.basico + values.estandar + values.premium,
  }
}

function blankValues() {
  const values = {} as Record<ControlField, number>
  for (const field of CONTROL_FIELDS) values[field] = 0
  return values
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}
