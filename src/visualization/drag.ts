import { fromOrdinal, toOrdinal } from '../domain/date'
export type DragKind = 'move' | 'start' | 'end'
export interface Dates { startDate: string; endDate: string }
export function dragDates(original: Dates, kind: DragKind, delta: number): Dates {
  let start = toOrdinal(original.startDate), end = toOrdinal(original.endDate)
  const days = Math.round(delta)
  if (kind === 'move') {
    const shift = Math.max(1-start, Math.min(3652059-end, days))
    start += shift; end += shift
  } else if (kind === 'start') start = Math.max(1, Math.min(end, start+days))
  else end = Math.min(3652059, Math.max(start, end+days))
  return { startDate: fromOrdinal(start), endDate: fromOrdinal(end) }
}
