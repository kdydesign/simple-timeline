import type { YearMonth } from '../shared/types'
import { DomainValidationError } from './error'
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
export const daysInMonth = (y: number, m: number) =>
  [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
const prior = (y: number) =>
  365 * (y - 1) +
  Math.floor((y - 1) / 4) -
  Math.floor((y - 1) / 100) +
  Math.floor((y - 1) / 400)
export function parseBusinessDate(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DomainValidationError(
      field,
      '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.',
    )
  const [y, m, d] = value.split('-').map(Number)
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
    throw new DomainValidationError(
      field,
      '실제 달력에 존재하는 날짜를 입력해 주세요.',
    )
  return value
}
export function toOrdinal(value: string): number {
  const [y, m, d] = parseBusinessDate(value).split('-').map(Number)
  let n = prior(y) + d
  for (let i = 1; i < m; i++) n += daysInMonth(y, i)
  return n
}
export function fromOrdinal(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3652059)
    throw new DomainValidationError('date')
  let lo = 1,
    hi = 9999
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (prior(mid) < n) lo = mid
    else hi = mid - 1
  }
  let rest = n - prior(lo),
    m = 1
  while (rest > daysInMonth(lo, m)) {
    rest -= daysInMonth(lo, m)
    m++
  }
  return `${String(lo).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(rest).padStart(2, '0')}`
}
export function inclusiveDays(start: string, end: string): number {
  const count = toOrdinal(end) - toOrdinal(start) + 1
  if (count < 1)
    throw new DomainValidationError(
      'endDate',
      '종료일은 시작일보다 빠를 수 없습니다.',
    )
  return count
}
export function validateYearMonth(ym: YearMonth): void {
  if (
    !ym ||
    !Number.isInteger(ym.year) ||
    !Number.isInteger(ym.month) ||
    ym.year < 1 ||
    ym.year > 9999 ||
    ym.month < 1 ||
    ym.month > 12
  )
    throw new DomainValidationError('yearMonth')
}
export function monthBounds(ym: YearMonth): { start: string; end: string } {
  validateYearMonth(ym)
  const prefix = `${String(ym.year).padStart(4, '0')}-${String(ym.month).padStart(2, '0')}`
  return {
    start: `${prefix}-01`,
    end: `${prefix}-${daysInMonth(ym.year, ym.month)}`,
  }
}
export function shiftMonth(ym: YearMonth, delta: -1 | 1): YearMonth | null {
  validateYearMonth(ym)
  const i = (ym.year - 1) * 12 + ym.month - 1 + delta
  return i < 0 || i >= 9999 * 12
    ? null
    : { year: Math.floor(i / 12) + 1, month: (i % 12) + 1 }
}
