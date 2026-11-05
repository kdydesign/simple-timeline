import { it, expect } from "vitest";
import { hotfix, project, schedule } from "../fixtures/timeline";
import {
  ganttRange,
  ganttRect,
  monthOffset,
} from "../../src/visualization/gantt";
import { viewportWindow, visibleRows } from "../../src/visualization/viewport";
it("places inclusive hotfix bars and fills empty months without project bars", () => {
  const r = ganttRange(hotfix, { year: 2026, month: 12 });
  expect(r).toEqual({ start: "2026-11-01", end: "2026-12-31" });
  expect(hotfix.schedules.map((s) => ganttRect(s, r))).toEqual([
    { x: 280, width: 868 },
    { x: 1148, width: 168 },
    { x: 1316, width: 28 },
  ]);
  expect(
    ganttRange(
      { projects: [project()], schedules: [] },
      { year: 2028, month: 2 },
    ),
  ).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  expect(
    ganttRange(
      {
        projects: [],
        schedules: [schedule("1", "1", "2026-11-30", "2027-02-01")],
      },
      { year: 2026, month: 12 },
    ),
  ).toEqual({ start: "2026-11-01", end: "2027-02-28" });
});
it("keeps the entire date range and clamps movement without changing selection", () => {
  const r = ganttRange(
    {
      projects: [],
      schedules: [schedule("1", "1", "0001-01-01", "9999-12-31")],
    },
    { year: 2026, month: 12 },
  );
  expect(ganttRect(schedule("1", "1", "0001-01-01", "9999-12-31"), r)).toEqual({
    x: 0,
    width: 102257652,
  });
  expect(monthOffset({ year: 9999, month: 12 }, r, 1000)).toEqual({
    offset: 102256652,
    outside: false,
  });
  expect(
    monthOffset(
      { year: 2027, month: 3 },
      { start: "2026-11-01", end: "2026-12-31" },
      1000,
    ),
  ).toEqual({ offset: 708, outside: true });
  expect(
    monthOffset(
      { year: 2026, month: 11 },
      { start: "2026-11-01", end: "2026-11-30" },
      1000,
    ),
  ).toEqual({ offset: 0, outside: false });
});
it("rebases date windows to nearby coordinates and finds variable-height rows", () => {
  for (const offset of [0, 100000000]) {
    const w = viewportWindow({
      logicalOffset: offset,
      viewportSize: 1000,
      unitSize: 28,
      overscan: 31,
    });
    expect(w.lastExclusive - w.first).toBeLessThanOrEqual(99);
    expect(offset - w.origin).toBeLessThan(900);
  }
  expect(visibleRows([0, 56, 100, 144, 200], 60, 40, 0)).toEqual({
    first: 1,
    lastExclusive: 2,
  });
  expect(visibleRows([0, 56, 100, 144, 200], 100, 44, 1)).toEqual({
    first: 1,
    lastExclusive: 4,
  });
});

it('uses the supplied day width for bar position, inclusive duration and month navigation', () => {
  const s = schedule('1', '1', '2026-12-18', '2026-12-19')
  for (const dayWidth of [14,28,84]) {
    expect(ganttRect(s, {start:'2026-12-01',end:'2027-01-31'}, dayWidth)).toEqual({x:17*dayWidth,width:2*dayWidth})
    expect(monthOffset({year:2027,month:1},{start:'2026-12-01',end:'2027-12-31'},100,dayWidth).offset).toBe(31*dayWidth)
  }
})
