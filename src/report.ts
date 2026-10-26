import { Workbook, type Cell } from 'exceljs'
import { formatName, isoDate, monthTitle } from './format'
import type { AppState, Appointment, Movement } from './types'

export type Tone = 'up' | 'down' | 'flat'

export type MonthReport = {
  key: string
  title: string
  generated: string
  sales: number
  prevSales: number
  income: number
  expense: number
  result: number
  prevResult: number
  average: number
  pets: number
  clients: number
  premium: number
  pending: number
  cancelled: number
  messages: number
  unread: number
  leads: number
  appointments: Appointment[]
  done: Appointment[]
  movements: Movement[]
  services: [string, { count: number; amount: number }][]
  methods: [string, number][]
  sizes: [string, number][]
  tutors: [string, { visits: number; amount: number }][]
  hours: { label: string; count: number }[]
  days: { date: string; sales: number; citas: number }[]
}

const ACCENT = 'FFC4492C'
const WHITE = 'FFFFFFFF'
const PAPER = 'FFF7F1E8'
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function sum(items: { amount?: number; cost?: number }[], key: 'amount' | 'cost') {
  return items.reduce((total, item) => total + (item[key] ?? 0), 0)
}

export function rate(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export function change(current: number, previous: number): { label: string; tone: Tone } {
  if (previous === 0) {
    return current === 0
      ? { label: 'Igual que el mes anterior', tone: 'flat' }
      : { label: 'Sin base el mes anterior', tone: 'flat' }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { label: 'Igual que el mes anterior', tone: 'flat' }
  return { label: `${pct > 0 ? '+' : ''}${pct}% vs mes anterior`, tone: pct > 0 ? 'up' : 'down' }
}

export function statusLabel(status: Appointment['status']) {
  if (status === 'completada') return 'Completada'
  if (status === 'cancelada') return 'Cancelada'
  return 'Pendiente'
}

export function planLabel(item: Appointment) {
  if (item.report?.plan === 'premium' || item.service.toLowerCase().includes('premium')) return 'Premium'
  if (item.report?.plan === 'grooming') return 'Grooming'
  return '—'
}

function monthDays(cursor: string) {
  const [year, month] = cursor.split('-').map(Number)
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return `${cursor.slice(0, 7)}-${day}`
  })
}

function previousKey(cursor: string) {
  const [year, month] = cursor.slice(0, 7).split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${nextMonth}`
}

export function buildMonthReport(state: AppState, cursor: string): MonthReport {
  const key = cursor.slice(0, 7)
  const prior = previousKey(cursor)
  const inMonth = (date: string, monthKey: string) => date.startsWith(monthKey)
  const appointments = state.appointments
    .filter((item) => inMonth(item.date, key))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  const previous = state.appointments.filter((item) => inMonth(item.date, prior))
  const done = appointments.filter((item) => item.status === 'completada')
  const prevDone = previous.filter((item) => item.status === 'completada')
  const movements = state.movements
    .filter((item) => inMonth(item.date, key))
    .sort((a, b) => a.date.localeCompare(b.date) || a.document.localeCompare(b.document))
  const ingresos = movements.filter((item) => item.type === 'ingreso')
  const egresos = movements.filter((item) => item.type === 'egreso')
  const prevMoves = state.movements.filter((item) => inMonth(item.date, prior))
  const sales = sum(done, 'cost')
  const income = sum(ingresos, 'amount')
  const expense = sum(egresos, 'amount')
  const prevIncome = sum(prevMoves.filter((item) => item.type === 'ingreso'), 'amount')
  const prevExpense = sum(prevMoves.filter((item) => item.type === 'egreso'), 'amount')

  const services = new Map<string, { count: number; amount: number }>()
  for (const item of appointments.filter((entry) => entry.status !== 'cancelada')) {
    const name = item.service.trim() || 'Sin servicio'
    const slot = services.get(name) ?? { count: 0, amount: 0 }
    slot.count += 1
    if (item.status === 'completada') slot.amount += item.cost
    services.set(name, slot)
  }

  const methods = new Map<string, number>()
  for (const item of ingresos) {
    const name = item.method.trim() || 'Sin medio'
    methods.set(name, (methods.get(name) ?? 0) + item.amount)
  }

  const sizes = new Map<string, number>()
  for (const item of done) {
    const name = item.size.trim() || 'Sin tamaño'
    sizes.set(name, (sizes.get(name) ?? 0) + 1)
  }

  const tutors = new Map<string, { visits: number; amount: number }>()
  for (const item of done) {
    const name = formatName(item.clientName)
    const slot = tutors.get(name) ?? { visits: 0, amount: 0 }
    slot.visits += 1
    slot.amount += item.cost
    tutors.set(name, slot)
  }

  const hours = Array.from({ length: 12 }, (_, index) => {
    const hour = 8 + index
    const label = `${String(hour).padStart(2, '0')}:00`
    const count = appointments.filter((item) => item.status !== 'cancelada' && Number(item.time.slice(0, 2)) === hour).length
    return { label, count }
  })

  const days = monthDays(cursor).map((date) => ({
    date,
    sales: done.filter((item) => item.date === date).reduce((total, item) => total + item.cost, 0),
    citas: appointments.filter((item) => item.date === date && item.status !== 'cancelada').length,
  }))

  const messages = state.conversations.reduce(
    (total, thread) => total + thread.messages.filter((message) => message.at.startsWith(key)).length,
    0,
  )

  return {
    key,
    title: monthTitle(cursor),
    generated: isoDate(),
    sales,
    prevSales: sum(prevDone, 'cost'),
    income,
    expense,
    result: income - expense,
    prevResult: prevIncome - prevExpense,
    average: done.length ? sales / done.length : 0,
    pets: new Set(appointments.map((item) => `${item.petName.trim().toLowerCase()}::${item.phone}`)).size,
    clients: new Set(appointments.map((item) => item.clientName.trim().toLowerCase()).filter(Boolean)).size,
    premium: done.filter((item) => planLabel(item) === 'Premium').length,
    pending: appointments.filter((item) => item.status === 'pendiente').length,
    cancelled: appointments.filter((item) => item.status === 'cancelada').length,
    messages,
    unread: state.conversations.reduce((total, thread) => total + thread.unread, 0),
    leads: state.leads.filter((lead) => lead.createdAt.startsWith(key)).length,
    appointments,
    done,
    movements,
    services: [...services.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count),
    methods: [...methods.entries()].sort((a, b) => b[1] - a[1]),
    sizes: [...sizes.entries()].sort((a, b) => b[1] - a[1]),
    tutors: [...tutors.entries()].sort((a, b) => b[1].amount - a[1].amount),
    hours,
    days,
  }
}

function paintHeader(sheet: ReturnType<Workbook['addWorksheet']>, columnCount: number) {
  const header = sheet.getRow(4)
  header.height = 22
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = header.getCell(column)
    cell.font = { name: 'Calibri', bold: true, color: { argb: WHITE }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    cell.alignment = { vertical: 'middle' }
  }
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columnCount },
  }
}

function stamp(sheet: ReturnType<Workbook['addWorksheet']>, report: MonthReport, columns: number) {
  sheet.mergeCells(1, 1, 1, columns)
  const title = sheet.getCell(1, 1)
  title.value = "PUP'S Pet Shop y Grooming"
  title.font = { name: 'Calibri', bold: true, size: 16, color: { argb: ACCENT } }
  sheet.mergeCells(2, 1, 2, columns)
  sheet.getCell(2, 1).value = `Estadísticas · ${report.title}`
  sheet.getRow(1).height = 24
}

function widths(sheet: ReturnType<Workbook['addWorksheet']>, values: number[]) {
  values.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
}

function moneyCell(cell: Cell, value: number) {
  cell.value = value
  cell.numFmt = '"Q" #,##0.00'
  cell.alignment = { horizontal: 'right' }
}

function zebra(sheet: ReturnType<Workbook['addWorksheet']>, rowNumber: number, columns: number) {
  if (rowNumber % 2 === 0) return
  const row = sheet.getRow(rowNumber)
  for (let column = 1; column <= columns; column += 1) {
    row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
  }
}

export function excelFilename(report: MonthReport) {
  return `pups-estadisticas-${report.key}.xlsx`
}

export async function downloadExcel(report: MonthReport) {
  const workbook = new Workbook()
  workbook.creator = "PUP'S Pet Shop y Grooming"
  workbook.created = new Date()

  const summary = workbook.addWorksheet('Resumen')
  widths(summary, [34, 18, 42])
  stamp(summary, report, 3)
  ;['Concepto', 'Valor', 'Nota'].forEach((label, index) => {
    summary.getCell(4, index + 1).value = label
  })
  paintHeader(summary, 3)
  const summaryRows: [string, number, string, boolean][] = [
    ['Cobrado en citas', report.sales, change(report.sales, report.prevSales).label, true],
    ['Ingresos de caja', report.income, 'Suma de ingresos del mes', true],
    ['Egresos de caja', report.expense, 'Suma de egresos del mes', true],
    ['Resultado de caja', report.result, change(report.result, report.prevResult).label, true],
    ['Ticket promedio', report.average, `${report.done.length} citas completadas`, true],
    ['Citas del mes', report.appointments.length, `${report.pending} pendientes · ${report.cancelled} canceladas`, false],
    ['Cierre', rate(report.done.length, report.appointments.length), 'Porcentaje de citas completadas', false],
    ['Mascotas', report.pets, `${report.clients} tutores`, false],
    ['Premium en completadas', report.premium, `${report.done.length} citas completadas`, false],
    ['Mensajes de WhatsApp', report.messages, `${report.unread} sin leer ahora · ${report.leads} del sitio`, false],
  ]
  summaryRows.forEach((entry, index) => {
    const row = summary.getRow(5 + index)
    row.getCell(1).value = entry[0]
    if (entry[3]) moneyCell(row.getCell(2), entry[1])
    else row.getCell(2).value = entry[1]
    row.getCell(3).value = entry[2]
    zebra(summary, 5 + index, 3)
  })

  const visits = workbook.addWorksheet('Citas')
  const visitHeaders = ['Fecha', 'Hora', 'Folio', 'Mascota', 'Tutor', 'Teléfono', 'Servicio', 'Tamaño', 'Plan', 'Estado', 'Cobro']
  widths(visits, [14, 10, 10, 18, 24, 16, 22, 14, 14, 14, 14])
  stamp(visits, report, visitHeaders.length)
  visitHeaders.forEach((label, index) => {
    visits.getCell(4, index + 1).value = label
  })
  paintHeader(visits, visitHeaders.length)
  report.appointments.forEach((item, index) => {
    const row = visits.getRow(5 + index)
    row.getCell(1).value = item.date
    row.getCell(2).value = item.time
    row.getCell(3).value = item.folio
    row.getCell(4).value = formatName(item.petName)
    row.getCell(5).value = formatName(item.clientName)
    row.getCell(6).value = item.phone
    row.getCell(7).value = item.service.trim() || 'Sin servicio'
    row.getCell(8).value = item.size.trim() || '—'
    row.getCell(9).value = planLabel(item)
    row.getCell(10).value = statusLabel(item.status)
    moneyCell(row.getCell(11), item.cost)
    zebra(visits, 5 + index, visitHeaders.length)
  })

  const cash = workbook.addWorksheet('Caja')
  const cashHeaders = ['Fecha', 'Documento', 'Tipo', 'Concepto', 'Medio', 'Folio', 'Notas', 'Monto']
  widths(cash, [14, 16, 12, 32, 16, 10, 36, 14])
  stamp(cash, report, cashHeaders.length)
  cashHeaders.forEach((label, index) => {
    cash.getCell(4, index + 1).value = label
  })
  paintHeader(cash, cashHeaders.length)
  report.movements.forEach((item, index) => {
    const row = cash.getRow(5 + index)
    row.getCell(1).value = item.date
    row.getCell(2).value = item.document
    row.getCell(3).value = item.type === 'ingreso' ? 'Ingreso' : 'Egreso'
    row.getCell(4).value = item.concept
    row.getCell(5).value = item.method.trim() || '—'
    row.getCell(6).value = item.folio ?? '—'
    row.getCell(7).value = item.notes
    moneyCell(row.getCell(8), item.type === 'egreso' ? -item.amount : item.amount)
    zebra(cash, 5 + index, cashHeaders.length)
  })

  const cuts = workbook.addWorksheet('Cortes')
  widths(cuts, [28, 14, 16])
  stamp(cuts, report, 3)
  ;['Corte', 'Cantidad', 'Monto'].forEach((label, index) => {
    cuts.getCell(4, index + 1).value = label
  })
  paintHeader(cuts, 3)
  let cursorRow = 5
  const pushCut = (name: string, count: number | string, amount?: number) => {
    const row = cuts.getRow(cursorRow)
    row.getCell(1).value = name
    row.getCell(2).value = count
    if (amount !== undefined) moneyCell(row.getCell(3), amount)
    zebra(cuts, cursorRow, 3)
    cursorRow += 1
  }
  pushCut('Servicios', '', undefined)
  report.services.forEach(([name, slot]) => pushCut(name, slot.count, slot.amount))
  pushCut('Medios de pago', '', undefined)
  report.methods.forEach(([name, amount]) => pushCut(name, '', amount))
  pushCut('Tamaño en completadas', '', undefined)
  report.sizes.forEach(([name, count]) => pushCut(name, count))
  pushCut('Horas', '', undefined)
  report.hours.filter((hour) => hour.count > 0).forEach((hour) => pushCut(hour.label, hour.count))
  pushCut('Tutores', '', undefined)
  report.tutors.forEach(([name, slot]) => pushCut(`${name} · ${slot.visits} visitas`, slot.visits, slot.amount))

  const raw = await workbook.xlsx.writeBuffer()
  const blob = new Blob([raw], { type: MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = excelFilename(report)
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
