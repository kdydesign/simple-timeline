import type { Schedule, TimelineSnapshot, YearMonth } from "../shared/types";
import { inclusiveDays, monthBounds, toOrdinal } from "../domain/date";
export const DAY_WIDTH = 28;
export function ganttRange(
  snapshot: TimelineSnapshot,
  ym: YearMonth,
): { start: string; end: string } {
  if (!snapshot.schedules.length) return monthBounds(ym);
  let start = snapshot.schedules[0].startDate,
    end = snapshot.schedules[0].endDate;
  for (const s of snapshot.schedules) {
    if (s.startDate < start) start = s.startDate;
    if (s.endDate > end) end = s.endDate;
  }
  const toMonth = (d: string) => ({
    year: Number(d.slice(0, 4)),
    month: Number(d.slice(5, 7)),
  });
  return {
    start: monthBounds(toMonth(start)).start,
    end: monthBounds(toMonth(end)).end,
  };
}
export function ganttRect(
  s: Schedule,
  range: { start: string; end: string },
  dayWidth = DAY_WIDTH,
): { x: number; width: number } {
  return {
    x: (toOrdinal(s.startDate) - toOrdinal(range.start)) * dayWidth,
    width: inclusiveDays(s.startDate, s.endDate) * dayWidth,
  };
}
export function monthOffset(
  ym: YearMonth,
  range: { start: string; end: string },
  width: number,
  dayWidth = DAY_WIDTH,
): { offset: number; outside: boolean } {
  const m = monthBounds(ym),
    max = Math.max(
      0,
      inclusiveDays(range.start, range.end) * dayWidth - width,
    );
  return {
    offset: Math.min(
      max,
      Math.max(0, (toOrdinal(m.start) - toOrdinal(range.start)) * dayWidth),
    ),
    outside: m.start < range.start || m.start > range.end,
  };
}
