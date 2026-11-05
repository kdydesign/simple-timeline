import { daysInMonth, monthBounds, shiftMonth } from '../../domain/date'
import type { YearMonth } from '../../shared/types'
export const monthOf = (date:string):YearMonth => ({year:Number(date.slice(0,4)),month:Number(date.slice(5,7))})
export function dateInMonth(date:string, month:YearMonth):string {
  return monthBounds(month).start.slice(0,8)+String(Math.min(Number(date.slice(8)),daysInMonth(month.year,month.month))).padStart(2,'0')
}
export function shiftSelectedDate(date:string, delta:-1|1):string|null {
  const month=shiftMonth(monthOf(date),delta)
  return month ? dateInMonth(date,month) : null
}
export function localDate(date:Date):string {
  return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
