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
): { x: number; width: number } {
  return {
    x: (toOrdinal(s.startDate) - toOrdinal(range.start)) * DAY_WIDTH,
    width: inclusiveDays(s.startDate, s.endDate) * DAY_WIDTH,
  };
}
export function monthOffset(
  ym: YearMonth,
  range: { start: string; end: string },
  width: number,
): { offset: number; outside: boolean } {
  const m = monthBounds(ym),
    max = Math.max(
      0,
      inclusiveDays(range.start, range.end) * DAY_WIDTH - width,
    );
  return {
    offset: Math.min(
      max,
      Math.max(0, (toOrdinal(m.start) - toOrdinal(range.start)) * DAY_WIDTH),
    ),
    outside: m.start < range.start || m.start > range.end,
  };
}
