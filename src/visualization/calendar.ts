import type { Schedule, TimelineSnapshot, YearMonth } from "../shared/types";
import { monthBounds, toOrdinal, fromOrdinal } from "../domain/date";
import { compareIds } from "../domain/sort";
import { compareSchedules } from "./presentation";
// startDate/endDate retain the original interval for deterministic ordering and full descriptions.
export interface Segment {
  scheduleId: string;
  projectId: string;
  weekStart: string;
  column: number;
  span: number;
  continuesLeft: boolean;
  continuesRight: boolean;
  startDate: string;
  endDate: string;
}
export type PlacedSegment = Segment & { lane: number };
export function calendarGrid(ym: YearMonth): { weeks: (string | null)[][] } {
  const b = monthBounds(ym),
    first = toOrdinal(b.start),
    last = toOrdinal(b.end),
    start = first - ((first - 1) % 7);
  return {
    weeks: Array.from(
      { length: Math.ceil((((first - 1) % 7) + last - first + 1) / 7) },
      (_, w) =>
        Array.from({ length: 7 }, (_, c) => {
          const d = start + w * 7 + c;
          return d < 1 || d > 3652059 ? null : fromOrdinal(d);
        }),
    ),
  };
}
export function calendarSegments(
  schedules: readonly Schedule[],
  ym: YearMonth,
): Segment[] {
  const b = monthBounds(ym),
    first = toOrdinal(b.start),
    last = toOrdinal(b.end),
    gridStart = first - ((first - 1) % 7),
    result: Segment[] = [];
  for (const s of schedules) {
    if (s.endDate < b.start || s.startDate > b.end) continue;
    const originalStart = toOrdinal(s.startDate),
      originalEnd = toOrdinal(s.endDate),
      start = Math.max(first, originalStart),
      end = Math.min(last, originalEnd);
    for (
      let week = gridStart + Math.floor((start - gridStart) / 7) * 7;
      week <= end;
      week += 7
    ) {
      const a = Math.max(start, week),
        z = Math.min(end, week + 6);
      result.push({
        scheduleId: s.id,
        projectId: s.projectId,
        weekStart: fromOrdinal(week),
        column: a - week,
        span: z - a + 1,
        continuesLeft: originalStart < a,
        continuesRight: originalEnd > z,
        startDate: s.startDate,
        endDate: s.endDate,
      });
    }
  }
  return result;
}
export function placeWeek(segments: readonly Segment[]): PlacedSegment[] {
  const sorted = [...segments].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate) ||
      compareIds(a.projectId, b.projectId) ||
      compareIds(a.scheduleId, b.scheduleId),
  );
  const free: number[] = [],
    ends: number[][] = Array.from({ length: 7 }, () => []),
    result: PlacedSegment[] = [];
  const push = (n: number) => {
    free.push(n);
    let i = free.length - 1;
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (free[p] <= n) break;
      free[i] = free[p];
      i = p;
    }
    free[i] = n;
  };
  const pop = () => {
    const min = free[0],
      last = free.pop()!;
    if (free.length) {
      let i = 0;
      while (i * 2 + 1 < free.length) {
        let child = i * 2 + 1;
        if (child + 1 < free.length && free[child + 1] < free[child]) child++;
        if (free[child] >= last) break;
        free[i] = free[child];
        i = child;
      }
      free[i] = last;
    }
    return min;
  };
  let nextLane = 0,
    released = -1;
  for (const s of sorted) {
    while (released < s.column - 1) {
      released++;
      for (const lane of ends[released]) push(lane);
    }
    const lane = free.length ? pop() : nextLane++;
    ends[s.column + s.span - 1].push(lane);
    result.push({ ...s, lane });
  }
  return result;
}
// The input is one placed week. Count each ID once per column, including overlapping duplicate segments.
export function hiddenCountsForWeek(placed: readonly PlacedSegment[]): number[] {
  const hidden = Array.from({ length: 7 }, () => new Set<string>());
  for (const segment of placed) {
    if (segment.lane < 3) continue;
    for (
      let column = segment.column;
      column < segment.column + segment.span;
      column++
    )
      hidden[column].add(segment.scheduleId);
  }
  return hidden.map((ids) => ids.size);
}
export function hiddenCount(
  placed: readonly PlacedSegment[],
  date: string,
): number {
  const ordinal = toOrdinal(date),
    hidden = new Set<string>();
  for (const s of placed)
    if (s.lane >= 3) {
      const start = toOrdinal(s.weekStart) + s.column;
      if (ordinal >= start && ordinal < start + s.span)
        hidden.add(s.scheduleId);
    }
  return hidden.size;
}
export function schedulesOnDate(
  snapshot: TimelineSnapshot,
  date: string,
): Schedule[] {
  return snapshot.schedules
    .filter((s) => s.startDate <= date && s.endDate >= date)
    .sort(compareSchedules);
}
