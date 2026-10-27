import type { Cell, Worksheet } from 'exceljs'
import { CONTROL_COUNTS, CONTROL_MONEY, controlFilename, type ControlLine } from './control'
import { isoDate, longDate } from './format'

const INK = 'FF17191D'
const WHITE = 'FFFFFFFF'
const MUTED = 'FF5C6168'
const HAIR = 'FFE4E6EA'
const CALC = 'FFF4F5F7'
const LOSS = 'FF8D3B32'
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const GROUP_FILL: Record<string, string> = {
  Servicio: 'FF243028',
  Gastos: 'FF3A2C28',
  Planilla: 'FF2A3140',
  Comisión: 'FF332E24',
  Proveedores: 'FF17191D',
  Resultado: 'FF17191D',
  Paquetes: 'FF2C3036',
  Diferencia: 'FF2C3036',
  Cantidad: 'FF2C3036',
  Ventas: 'FF2C3036',
  Total: 'FF17191D',
}

type Sheet = ReturnType<typeof import('./control').controlSheet>

const MONEY_INPUT = '"Q "#,##0.00;"Q "-#,##0.00;""'
const MONEY_CALC = '"Q "#,##0.00;"Q "-#,##0.00'
const COUNT_INPUT = '#,##0;;'
const COUNT_CALC = '#,##0'

export async function downloadControlExcel(sheet: Sheet) {
  const workbook = await workbookFor(sheet)
  const raw = await workbook.xlsx.writeBuffer()
  saveFile(raw, controlFilename(sheet.year, 'xlsx'), MIME)
}

export function downloadControlPdf(sheet: Sheet) {
  saveFile(controlPdfBytes(sheet), controlFilename(sheet.year, 'pdf'), 'application/pdf')
}

export async function workbookFor(sheet: Sheet) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = "PUP'S Pet Shop y Grooming"
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true
  const grid = workbook.addWorksheet('Control general', {
    properties: { defaultRowHeight: 18, tabColor: { argb: INK } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }],
    pageSetup: {
      paperSize: 3 as never,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: true,
      printTitlesRow: '1:5',
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.4, header: 0.18, footer: 0.18 },
    },
  })
  grid.headerFooter.oddFooter = `&L&8&K5C6168PUP'S · Control general ${sheet.year}&R&8&K5C6168&D`
  grid.addConditionalFormatting({
    ref: 'S6:S18',
    rules: [
      {
        type: 'cellIs',
        operator: 'lessThan',
        priority: 1,
        formulae: [0],
        style: { font: { name: 'Calibri', bold: true, color: { argb: LOSS } } },
      },
    ],
  })
  paintSheet(grid, sheet)
  return workbook
}

function paintSheet(grid: Worksheet, sheet: Sheet) {
  const columns = 28
  grid.mergeCells(1, 1, 1, columns)
  grid.mergeCells(2, 1, 2, columns)
  const title = grid.getCell(1, 1)
  title.value = "PUP'S Pet Shop y Grooming"
  title.font = { name: 'Calibri', bold: true, size: 18, color: { argb: INK } }
  title.alignment = { vertical: 'middle' }
  const subtitle = grid.getCell(2, 1)
  subtitle.value = `Control general · ${sheet.year} · generado el ${longDate(isoDate())}`
  subtitle.font = { name: 'Calibri', size: 11, color: { argb: MUTED } }
  grid.getRow(1).height = 26
  grid.getRow(2).height = 18
  grid.getRow(3).height = 8

  const groups = [
    { label: 'Mes', from: 1, span: 1 },
    { label: 'Servicio', from: 2, span: 3 },
    { label: 'Gastos', from: 5, span: 6 },
    { label: 'Planilla', from: 11, span: 4 },
    { label: 'Comisión', from: 15, span: 2 },
    { label: 'Proveedores', from: 17, span: 1 },
    { label: 'Resultado', from: 18, span: 3 },
    { label: 'Paquetes', from: 21, span: 3 },
    { label: 'Diferencia', from: 24, span: 1 },
    { label: 'Cantidad', from: 25, span: 2 },
    { label: 'Ventas', from: 27, span: 1 },
    { label: 'Total', from: 28, span: 1 },
  ]
  grid.mergeCells(4, 1, 5, 1)
  for (const group of groups) {
    if (group.span > 1) grid.mergeCells(4, group.from, 4, group.from + group.span - 1)
    const cell = grid.getCell(4, group.from)
    cell.value = group.label.toUpperCase()
    cell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: WHITE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    const fill = group.label === 'Mes' ? INK : GROUP_FILL[group.label]
    for (let column = group.from; column < group.from + group.span; column += 1) {
      const header = grid.getCell(4, column)
      header.fill = solid(fill)
      header.border = darkBorder()
      header.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }
  grid.getCell(4, 1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  grid.getRow(4).height = 18

  const labels = [
    ...CONTROL_MONEY.map((column) => column.label),
    'Gastos',
    'Disponible',
    'Total',
    ...CONTROL_COUNTS.map((column) => column.label),
    'Total',
  ]
  labels.forEach((label, index) => {
    const cell = grid.getCell(5, index + 2)
    cell.value = label
    cell.font = { name: 'Calibri', bold: true, size: 8, color: { argb: WHITE } }
    cell.fill = solid('FF2C3036')
    cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true }
    cell.border = darkBorder()
  })
  grid.getRow(5).height = 20

  const widths = [16, ...Array(16).fill(13), 13, 14, 13, ...Array(7).fill(12), 11]
  widths.forEach((width, index) => {
    grid.getColumn(index + 1).width = width
  })

  sheet.months.forEach((line, index) => writeLine(grid, 6 + index, line, false))
  writeLine(grid, 18, sheet.totals, true)

  grid.mergeCells(20, 1, 20, columns)
  const note = grid.getCell(20, 1)
  note.value = 'Gastos reúne local, teléfono, internet, luz, impuesto, AFP, planilla, DEAS, extra, bonos, comisión, préstamo y proveedores. Disponible es el servicio menos los gastos. El total es el servicio. Las celdas vacías valen cero.'
  note.font = { name: 'Calibri', size: 9, italic: true, color: { argb: MUTED } }
  note.alignment = { vertical: 'middle', wrapText: true }
  grid.getRow(20).height = 28
  grid.pageSetup.printArea = 'A1:AB20'
}

function writeLine(grid: Worksheet, rowNumber: number, line: ControlLine, totals: boolean) {
  const row = grid.getRow(rowNumber)
  row.height = totals ? 22 : 18
  const month = row.getCell(1)
  month.value = line.label
  month.font = { name: 'Calibri', bold: true, size: totals ? 11 : 10, color: { argb: totals ? WHITE : INK } }
  month.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  month.fill = solid(totals ? INK : 'FFFFFFFF')
  month.border = totals ? totalBorder() : hairBorder()

  const money = CONTROL_MONEY.map((column) => roundMoney(line.values[column.field]))
  const counts = CONTROL_COUNTS.map((column) => Math.round(line.values[column.field]))
  money.forEach((amount, index) => styleMoney(row.getCell(2 + index), amount, totals))

  const excelRow = rowNumber
  styleFormula(row.getCell(18), `SUM(E${excelRow}:Q${excelRow})`, roundMoney(line.gastos), true, totals, false)
  styleFormula(row.getCell(19), `SUM(B${excelRow}:D${excelRow})-R${excelRow}`, roundMoney(line.disponible), true, totals, true)
  styleFormula(row.getCell(20), `SUM(B${excelRow}:D${excelRow})`, roundMoney(line.servicio), true, totals, false)
  counts.forEach((amount, index) => styleCount(row.getCell(21 + index), amount, totals))
  styleFormula(row.getCell(28), `SUM(U${excelRow}:W${excelRow})`, line.paquetes, false, totals, false)
}

function styleMoney(cell: Cell, amount: number, totals: boolean) {
  cell.value = amount
  cell.numFmt = totals ? MONEY_CALC : MONEY_INPUT
  paintAmount(cell, totals, false, false)
}

function styleCount(cell: Cell, amount: number, totals: boolean) {
  cell.value = amount
  cell.numFmt = totals ? COUNT_CALC : COUNT_INPUT
  paintAmount(cell, totals, false, false)
}

function styleFormula(cell: Cell, formula: string, result: number, money: boolean, totals: boolean, signed: boolean) {
  cell.value = { formula, result }
  cell.numFmt = money ? MONEY_CALC : COUNT_CALC
  paintAmount(cell, totals, signed && result < 0, true)
}

function paintAmount(cell: Cell, totals: boolean, loss: boolean, calc: boolean) {
  cell.font = {
    name: 'Calibri',
    bold: totals || calc,
    size: totals ? 10 : 9,
    color: { argb: totals ? WHITE : loss ? LOSS : INK },
  }
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  cell.fill = solid(totals ? INK : calc ? CALC : 'FFFFFFFF')
  cell.border = totals ? totalBorder() : hairBorder()
}

function solid(argb: string): Cell['fill'] {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function hairBorder(): Cell['border'] {
  const side = { style: 'thin' as const, color: { argb: HAIR } }
  return { top: side, left: side, bottom: side, right: side }
}

function darkBorder(): Cell['border'] {
  const side = { style: 'thin' as const, color: { argb: 'FF24272C' } }
  return { top: side, left: side, bottom: side, right: side }
}

function totalBorder(): Cell['border'] {
  const side = { style: 'thin' as const, color: { argb: INK } }
  return { top: { style: 'medium', color: { argb: INK } }, left: side, bottom: side, right: side }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function controlPdfBytes(sheet: Sheet) {
  const page = drawControl(sheet)
  return buildPdf(page.commands, page.width, page.height, `PUP'S Control general ${sheet.year}`)
}

function drawControl(sheet: Sheet) {
  const width = 24 * 72
  const marginX = 28
  const top = 22
  const monthW = 96
  const inner = width - marginX * 2
  const colW = (inner - monthW) / 27
  const groupH = 16
  const labelH = 20
  const rowH = 22
  const totalH = 24
  const mastH = 46
  const tableH = groupH + labelH + rowH * 12 + totalH
  const height = top + mastH + 14 + tableH + 28
  const pdf = new Pdf()
  const tableTop = height - top - mastH - 14

  pdf.text("PUP'S", marginX, height - top - 16, 16, true, '17191D')
  pdf.text('Pet Shop y Grooming', marginX, height - top - 30, 8, false, '5C6168')
  const title = 'Control general'
  pdf.text(title, width - marginX - textWidth(title, 14, true), height - top - 16, 14, true, '17191D')
  const meta = `Año ${sheet.year}  ·  ${longDate(isoDate())}`
  pdf.text(meta, width - marginX - textWidth(meta, 8, false), height - top - 30, 8, false, '5C6168')
  pdf.line(marginX, height - top - 40, width - marginX, height - top - 40, 1.2, '17191D')

  const columns = flatColumns()
  let cursor = marginX
  pdf.rect(cursor, tableTop - groupH - labelH, monthW, groupH + labelH, '17191D')
  pdf.text('MES', cursor + 8, baseline(tableTop - groupH - labelH, groupH + labelH, 7.5), 7.5, true, 'FFFFFF')
  cursor += monthW
  for (const group of columnGroups(columns)) {
    const spanW = colW * group.span
    pdf.rect(cursor, tableTop - groupH, spanW, groupH, GROUP_FILL[group.label].slice(2))
    const label = group.label.toUpperCase()
    const size = fitSize(label, spanW - 6, 7, true)
    pdf.text(label, cursor + (spanW - textWidth(label, size, true)) / 2, baseline(tableTop - groupH, groupH, size), size, true, 'FFFFFF')
    cursor += spanW
  }
  cursor = marginX + monthW
  for (const column of columns) {
    pdf.rect(cursor, tableTop - groupH - labelH, colW, labelH, '2C3036')
    const size = fitSize(column.label, colW - 4, 6.4, true)
    pdf.text(column.label, cursor + (colW - textWidth(column.label, size, true)) / 2, baseline(tableTop - groupH - labelH, labelH, size), size, true, 'FFFFFF')
    cursor += colW
  }

  sheet.months.forEach((line, index) => {
    const bottom = tableTop - groupH - labelH - rowH * (index + 1)
    paintRow(pdf, line, bottom, rowH, false, marginX, monthW, colW, columns)
  })
  const totalBottom = tableTop - groupH - labelH - rowH * 12 - totalH
  paintRow(pdf, sheet.totals, totalBottom, totalH, true, marginX, monthW, colW, columns)

  const gridBottom = totalBottom
  const gridTop = tableTop
  pdf.line(marginX, gridTop, width - marginX, gridTop, 0.6, '17191D')
  let lineX = marginX
  pdf.line(lineX, gridBottom, lineX, gridTop, 0.7, '17191D')
  lineX += monthW
  pdf.line(lineX, gridBottom, lineX, gridTop, 0.7, '17191D')
  for (let index = 0; index < columns.length; index += 1) {
    lineX += colW
    const edge = index === columns.length - 1
    pdf.line(lineX, gridBottom, lineX, gridTop, edge ? 0.8 : 0.45, edge ? '17191D' : 'D5D8DE')
  }
  let lineY = tableTop
  pdf.line(marginX, lineY, width - marginX, lineY, 0.4, '3A3E45')
  lineY -= groupH
  pdf.line(marginX + monthW, lineY, width - marginX, lineY, 0.4, '3A3E45')
  lineY -= labelH
  pdf.line(marginX, lineY, width - marginX, lineY, 0.8, '17191D')
  for (let index = 0; index < 12; index += 1) {
    lineY -= rowH
    pdf.line(marginX, lineY, width - marginX, lineY, 0.45, 'D5D8DE')
  }
  lineY -= totalH
  pdf.line(marginX, lineY, width - marginX, lineY, 0.8, '17191D')

  const note = 'Gastos reúne local, teléfono, internet, luz, impuesto, AFP, planilla, DEAS, extra, bonos, comisión, préstamo y proveedores. Disponible es el servicio menos los gastos. El total es el servicio.'
  pdf.text(note, marginX, gridBottom - 16, 7.2, false, '5C6168')
  return { commands: pdf.commands, width, height }
}

type PdfColumn = { label: string; group: string; kind: 'money' | 'count' | 'calc-money' | 'calc-count' }

function flatColumns(): PdfColumn[] {
  return [
    ...CONTROL_MONEY.map((column) => ({ label: column.label, group: column.group, kind: 'money' as const })),
    { label: 'Gastos', group: 'Resultado', kind: 'calc-money' },
    { label: 'Disponible', group: 'Resultado', kind: 'calc-money' },
    { label: 'Total', group: 'Resultado', kind: 'calc-money' },
    ...CONTROL_COUNTS.map((column) => ({ label: column.label, group: column.group, kind: 'count' as const })),
    { label: 'Total', group: 'Total', kind: 'calc-count' },
  ]
}

function columnGroups(columns: PdfColumn[]) {
  const groups: { label: string; span: number }[] = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last?.label === column.group) last.span += 1
    else groups.push({ label: column.group, span: 1 })
  }
  return groups
}

function paintRow(pdf: Pdf, line: ControlLine, bottom: number, rowH: number, totals: boolean, marginX: number, monthW: number, colW: number, columns: PdfColumn[]) {
  const pageRight = marginX + monthW + colW * columns.length
  pdf.rect(marginX, bottom, pageRight - marginX, rowH, totals ? '17191D' : 'FFFFFF')
  const ink = totals ? 'FFFFFF' : '17191D'
  pdf.text(line.label, marginX + 8, baseline(bottom, rowH, totals ? 8.5 : 8), totals ? 8.5 : 8, true, ink)
  const amounts = rowAmounts(line)
  amounts.forEach((amount, index) => {
    const column = columns[index]
    const x = marginX + monthW + colW * index
    const calc = column.kind === 'calc-money' || column.kind === 'calc-count'
    if (calc && !totals) pdf.rect(x, bottom, colW, rowH, 'F4F5F7')
    const blank = !totals && !calc && !amount
    if (blank) return
    const text = column.kind === 'count' || column.kind === 'calc-count' ? countText(amount) : moneyText(amount)
    const loss = !totals && column.label === 'Disponible' && amount < 0
    const size = fitSize(text, colW - 7, totals ? 7.4 : 7.1, totals)
    pdf.text(text, x + colW - 4 - textWidth(text, size, totals), baseline(bottom, rowH, size), size, totals, loss ? '8D3B32' : ink)
  })
}

function rowAmounts(line: ControlLine) {
  return [
    ...CONTROL_MONEY.map((column) => line.values[column.field]),
    line.gastos,
    line.disponible,
    line.servicio,
    ...CONTROL_COUNTS.map((column) => line.values[column.field]),
    line.paquetes,
  ]
}

function moneyText(value: number) {
  const sign = value < 0 ? '-' : ''
  const [whole, frac] = Math.abs(value).toFixed(2).split('.')
  return `Q ${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

function countText(value: number) {
  return Math.round(value).toLocaleString('es-GT')
}

function baseline(bottom: number, rowH: number, size: number) {
  return bottom + rowH / 2 - size * 0.35
}

class Pdf {
  commands: string[] = []

  rect(x: number, y: number, w: number, h: number, hex: string) {
    const [r, g, b] = rgb(hex)
    this.commands.push(`${num(r)} ${num(g)} ${num(b)} rg`)
    this.commands.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`)
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, hex: string) {
    const [r, g, b] = rgb(hex)
    this.commands.push(`${num(r)} ${num(g)} ${num(b)} RG`)
    this.commands.push(`${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`)
  }

  text(value: string, x: number, y: number, size: number, bold: boolean, hex: string) {
    const [r, g, b] = rgb(hex)
    this.commands.push(`${num(r)} ${num(g)} ${num(b)} rg`)
    this.commands.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm <${hexText(value)}> Tj ET`)
  }
}

function buildPdf(commands: string[], width: number, height: number, title: string) {
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${asciiBytes(stream).length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title <${hexText(title)}> /Author <${hexText("PUP'S Pet Shop y Grooming")}> /Creator <${hexText("PUP'S")}> >>`,
  ]
  const header = asciiBytes('%PDF-1.4\n')
  const chunks: Uint8Array[] = [header]
  let offset = header.length
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    const body = asciiBytes(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`)
    offsets.push(offset)
    chunks.push(body)
    offset += body.length
  }
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${offset}\n%%EOF`
  chunks.push(asciiBytes(xref))
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let cursor = 0
  for (const chunk of chunks) {
    bytes.set(chunk, cursor)
    cursor += chunk.length
  }
  return bytes
}

function saveFile(data: BlobPart, name: string, type: string) {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const REGULAR: Record<string, number> = {
  ' ': 278, '-': 333, ',': 278, '.': 278, "'": 191,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
}
const BOLD: Record<string, number> = {
  ' ': 278, '-': 333, ',': 278, '.': 278, "'": 238,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
}

function textWidth(value: string, size: number, bold: boolean) {
  const table = bold ? BOLD : REGULAR
  let units = 0
  for (const char of value) units += table[char] ?? table[char.normalize('NFD')[0]] ?? 520
  return (units * size) / 1000
}

function fitSize(value: string, max: number, size: number, bold: boolean) {
  let next = size
  while (next > 5 && textWidth(value, next, bold) > max) next -= 0.2
  return next
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function num(value: number) {
  return Number(value.toFixed(2)).toString()
}

const WIN: Record<string, number> = {
  á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa, ñ: 0xf1, ü: 0xfc, '·': 0xb7,
  Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda, Ñ: 0xd1, Ü: 0xdc,
}

function hexText(value: string) {
  let hex = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const byte = code < 128 ? code : WIN[char] ?? 0x3f
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 255
  return bytes
}
