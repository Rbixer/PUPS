import { Workbook, type Cell, type Worksheet } from 'exceljs'
import { accountName, type BalanceSheet, type Entry, type IncomeStatement, type TaxMonth } from './ledger'

const INK = 'FF17191D'
const WHITE = 'FFFFFFFF'
const PAPER = 'FFF7F1E8'
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function head(sheet: Worksheet, title: string, labels: string[], widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  sheet.mergeCells(1, 1, 1, labels.length)
  const cell = sheet.getCell(1, 1)
  cell.value = "PUP'S Pet Shop y Grooming"
  cell.font = { bold: true, size: 15, color: { argb: INK } }
  sheet.mergeCells(2, 1, 2, labels.length)
  sheet.getCell(2, 1).value = title
  labels.forEach((label, index) => {
    const target = sheet.getCell(4, index + 1)
    target.value = label
    target.font = { bold: true, color: { argb: WHITE } }
    target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  })
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
}

function moneyCell(cell: Cell, value: number) {
  cell.value = value
  cell.numFmt = '"Q" #,##0.00'
  cell.alignment = { horizontal: 'right' }
}

function rows(sheet: Worksheet, start: number, values: [string, number | null, boolean?][]) {
  values.forEach(([label, amount, strong], index) => {
    const row = sheet.getRow(start + index)
    row.getCell(1).value = label
    if (amount !== null) moneyCell(row.getCell(2), amount)
    if (strong) {
      row.font = { bold: true }
      for (const column of [1, 2]) row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
    }
  })
}

export async function downloadLedgerExcel(input: { label: string; filename: string; entries: Entry[]; statement: IncomeStatement; sheet: BalanceSheet; taxes: TaxMonth[] }) {
  const workbook = new Workbook()
  workbook.creator = "PUP'S Pet Shop y Grooming"
  workbook.created = new Date()

  const results = workbook.addWorksheet('Estado de resultados')
  head(results, `Estado de resultados · ${input.label}`, ['Cuenta', 'Monto'], [44, 18])
  const s = input.statement
  rows(results, 5, [
    ...s.revenue.map((row) => [row.name, row.balance] as [string, number]),
    ['Total de ingresos', s.totalRevenue, true],
    ['Costo de ventas', -s.cost],
    ['Utilidad bruta', s.gross, true],
    ...s.payroll.map((row) => [row.name, -row.balance] as [string, number]),
    ['Total de planilla', -s.totalPayroll, true],
    ...s.expenses.map((row) => [row.name, -row.balance] as [string, number]),
    ['Total de gastos de operación', -s.totalExpenses, true],
    ['Impuesto sobre ingresos', -s.taxes],
    ['Utilidad neta', s.net, true],
  ])

  const balance = workbook.addWorksheet('Balance general')
  head(balance, `Balance general · ${input.label}`, ['Cuenta', 'Saldo'], [44, 18])
  const b = input.sheet
  rows(balance, 5, [
    ['Activo', null, true],
    ...b.assets.map((row) => [row.name, row.balance] as [string, number]),
    ['Total activo', b.totalAssets, true],
    ['Pasivo', null, true],
    ...b.liabilities.map((row) => [row.name, row.balance] as [string, number]),
    ['Total pasivo', b.totalLiabilities, true],
    ['Patrimonio', null, true],
    ['Capital aportado', b.capital],
    ['Resultado acumulado', b.result],
    ['Total patrimonio', b.totalEquity, true],
    ['Pasivo más patrimonio', b.totalLiabilities + b.totalEquity, true],
  ])

  const journal = workbook.addWorksheet('Libro diario')
  head(journal, `Libro diario · ${input.label}`, ['Fecha', 'Partida', 'Concepto', 'Cuenta', 'Debe', 'Haber'], [12, 14, 40, 34, 16, 16])
  let line = 5
  for (const entry of input.entries) {
    entry.lines.forEach((item, index) => {
      const row = journal.getRow(line)
      if (index === 0) {
        row.getCell(1).value = entry.date
        row.getCell(2).value = entry.ref
        row.getCell(3).value = entry.concept
      }
      row.getCell(4).value = `${item.code} ${accountName(item.code)}`
      if (item.debit) moneyCell(row.getCell(5), item.debit)
      if (item.credit) moneyCell(row.getCell(6), item.credit)
      line += 1
    })
    line += 1
  }

  const tax = workbook.addWorksheet('Impuestos')
  head(tax, `Impuestos · ${input.label}`, ['Mes', 'Ingresos', 'IVA débito', 'IVA crédito', 'A pagar'], [16, 16, 16, 16, 16])
  input.taxes.forEach((month, index) => {
    const row = tax.getRow(5 + index)
    row.getCell(1).value = month.label
    moneyCell(row.getCell(2), month.base)
    moneyCell(row.getCell(3), month.debitTax)
    moneyCell(row.getCell(4), month.creditTax)
    moneyCell(row.getCell(5), month.payable)
  })

  const raw = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([raw], { type: MIME }))
  const link = document.createElement('a')
  link.href = url
  link.download = input.filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
