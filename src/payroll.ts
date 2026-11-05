import { daysBetween, isoDate, parseIso } from './format'
import { round2 } from './ops'
import type { Appointment, PayrollLine, User } from './types'

/** Porcentajes de ley en Guatemala. Conviene confirmarlos con el contador cada año. */
export const PAYROLL_RATES = {
  igssLaboral: 0.0483,
  igssPatronal: 0.1267,
  aguinaldo: 1 / 12,
  bono14: 1 / 12,
  /** Un mes por año sobre el salario más la sexta parte de aguinaldo y bono 14 (1/12 × 7/6). */
  indemnizacion: 7 / 72,
  vacaciones: 15 / 360,
}

export const LEGAL_BONUS = 250

export type PayrollAdjust = { extra: number; deductions: number }

export function workersOf(users: User[]) {
  return users.filter((item) => item.active && item.employeeCode)
}

function servicesFor(user: User, appointments: Appointment[], period: string) {
  return appointments.filter(
    (item) =>
      item.status === 'completada' &&
      item.date.startsWith(period) &&
      ((user.employeeCode && item.employeeCode === user.employeeCode) || (item.employeeId && item.employeeId === user.id)),
  )
}

/** Parte del mes trabajada por quien entró a mitad de ese mes, en base de 30 días. */
export function workedShare(hiredAt: string | undefined, period: string) {
  if (!hiredAt || !hiredAt.startsWith(period)) return hiredAt && hiredAt.slice(0, 7) > period ? 0 : 1
  const day = Math.min(30, Number(hiredAt.slice(8, 10)) || 1)
  return (30 - day + 1) / 30
}

export function payrollLine(user: User, appointments: Appointment[], period: string, adjust: PayrollAdjust = { extra: 0, deductions: 0 }): PayrollLine {
  const share = workedShare(user.hiredAt, period)
  const salary = round2((user.salary ?? 0) * share)
  const done = servicesFor(user, appointments, period)
  const servicesBase = round2(done.reduce((sum, item) => sum + item.cost, 0))
  const commissionRate = user.commissionRate ?? 0
  const commission = round2((servicesBase * commissionRate) / 100)
  const bonus = round2(salary > 0 || commission > 0 ? (user.bonus ?? LEGAL_BONUS) * share : 0)
  const extra = round2(Math.max(0, adjust.extra || 0))
  const insurable = salary + commission + extra
  const igss = round2(insurable * PAYROLL_RATES.igssLaboral)
  const deductions = round2(Math.min(Math.max(0, adjust.deductions || 0), Math.max(0, insurable + bonus - igss)))
  const ordinary = salary + commission
  return {
    userId: user.id,
    name: [user.name, user.lastName].filter(Boolean).join(' '),
    code: user.employeeCode ?? '',
    salary,
    servicesBase,
    services: done.length,
    commissionRate,
    commission,
    bonus,
    extra,
    deductions,
    igss,
    net: round2(insurable + bonus - igss - deductions),
    employerIgss: round2(insurable * PAYROLL_RATES.igssPatronal),
    aguinaldo: round2(ordinary * PAYROLL_RATES.aguinaldo),
    bono14: round2(ordinary * PAYROLL_RATES.bono14),
    vacaciones: round2(ordinary * PAYROLL_RATES.vacaciones),
    indemnizacion: round2(ordinary * PAYROLL_RATES.indemnizacion),
  }
}

export function payrollTotals(lines: PayrollLine[]) {
  const sum = (pick: (line: PayrollLine) => number) => round2(lines.reduce((total, line) => total + pick(line), 0))
  return {
    salary: sum((line) => line.salary),
    commission: sum((line) => line.commission),
    bonus: sum((line) => line.bonus),
    extra: sum((line) => line.extra),
    deductions: sum((line) => line.deductions),
    igss: sum((line) => line.igss),
    net: sum((line) => line.net),
    employerIgss: sum((line) => line.employerIgss),
    provisions: sum((line) => line.aguinaldo + line.bono14 + line.vacaciones + line.indemnizacion),
    cost: sum((line) => line.salary + line.commission + line.bonus + line.extra + line.employerIgss + line.aguinaldo + line.bono14 + line.vacaciones + line.indemnizacion),
  }
}

/** Inicio del ciclo vigente: aguinaldo corre del 1 de diciembre, bono 14 del 1 de julio. */
function cycleStart(today: string, month: number) {
  const date = parseIso(today)
  const year = date.getMonth() + 1 >= month ? date.getFullYear() : date.getFullYear() - 1
  return isoDate(new Date(year, month - 1, 1))
}

function anniversary(hiredAt: string, today: string) {
  const hire = parseIso(hiredAt)
  const now = parseIso(today)
  let candidate = new Date(now.getFullYear(), hire.getMonth(), hire.getDate())
  if (candidate > now) candidate = new Date(now.getFullYear() - 1, hire.getMonth(), hire.getDate())
  return isoDate(candidate)
}

export type Liability = {
  userId: string
  name: string
  code: string
  salary: number
  hiredAt?: string
  years: number
  aguinaldo: number
  bono14: number
  vacaciones: number
  indemnizacion: number
  total: number
}

/** Pasivo laboral acumulado a la fecha, con el salario vigente más la comisión promedio del mes. */
export function laborLiability(user: User, today = isoDate(), commission = 0): Liability {
  const salary = round2((user.salary ?? 0) + Math.max(0, commission))
  const base = {
    userId: user.id,
    name: [user.name, user.lastName].filter(Boolean).join(' '),
    code: user.employeeCode ?? '',
    salary,
    hiredAt: user.hiredAt,
  }
  if (!user.hiredAt || !salary || user.hiredAt > today) {
    return { ...base, years: 0, aguinaldo: 0, bono14: 0, vacaciones: 0, indemnizacion: 0, total: 0 }
  }
  const since = (from: string) => Math.max(0, daysBetween(from > user.hiredAt! ? from : user.hiredAt!, today))
  const aguinaldo = round2((salary * since(cycleStart(today, 12))) / 365)
  const bono14 = round2((salary * since(cycleStart(today, 7))) / 365)
  const vacaciones = round2(((salary / 30) * 15 * since(anniversary(user.hiredAt, today))) / 365)
  const worked = since(user.hiredAt)
  const indemnizacion = round2((salary * (7 / 6) * worked) / 365)
  return {
    ...base,
    years: round2(worked / 365),
    aguinaldo,
    bono14,
    vacaciones,
    indemnizacion,
    total: round2(aguinaldo + bono14 + vacaciones + indemnizacion),
  }
}

/** Comisión promedio de las últimas seis planillas pagadas, para que el pasivo use la misma base que las provisiones. */
export function averageCommission(userId: string, payrolls: { period: string; lines: PayrollLine[] }[]) {
  const recent = [...payrolls]
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 6)
    .flatMap((run) => run.lines.filter((line) => line.userId === userId))
  if (recent.length === 0) return 0
  return round2(recent.reduce((sum, line) => sum + line.commission, 0) / recent.length)
}
