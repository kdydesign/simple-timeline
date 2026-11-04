import { it, expect } from "vitest";
import { schedule, overlaps, project } from "../fixtures/timeline";
import {
  calendarGrid,
  calendarSegments,
  placeWeek,
  hiddenCount,
  hiddenCountsForWeek,
  schedulesOnDate,
} from "../../src/visualization/calendar";
it("builds Monday grids with only necessary weeks and no unsupported years", () => {
  expect([
    calendarGrid({ year: 2021, month: 2 }).weeks.length,
    calendarGrid({ year: 2026, month: 11 }).weeks.length,
    calendarGrid({ year: 2026, month: 12 }).weeks.length,
  ]).toEqual([4, 6, 5]);
  expect(calendarGrid({ year: 1, month: 1 }).weeks[0][0]).toBe("0001-01-01");
  expect(calendarGrid({ year: 9999, month: 12 }).weeks.at(-1)).toEqual([
    "9999-12-27",
    "9999-12-28",
    "9999-12-29",
    "9999-12-30",
    "9999-12-31",
    null,
    null,
  ]);
});
it("clips to month then splits at weeks while retaining full dates and continuation", () => {
  const parts = calendarSegments([schedule()], { year: 2026, month: 12 });
  expect(
    parts.map((p) => [
      p.weekStart,
      p.column,
      p.span,
      p.continuesLeft,
      p.continuesRight,
    ]),
  ).toEqual([
    ["2026-11-30", 1, 6, true, true],
    ["2026-12-07", 0, 5, true, false],
  ]);
  for (const [a, b, ym, want] of [
    [
      "2026-12-13",
      "2026-12-14",
      { year: 2026, month: 12 },
      [
        [6, 1, false, true],
        [0, 1, true, false],
      ],
    ],
    [
      "2026-11-30",
      "2026-12-01",
      { year: 2026, month: 12 },
      [[1, 1, true, false]],
    ],
    [
      "2026-12-31",
      "2027-01-01",
      { year: 2027, month: 1 },
      [[4, 1, true, false]],
    ],
    [
      "2028-02-28",
      "2028-03-01",
      { year: 2028, month: 2 },
      [[0, 2, false, true]],
    ],
    [
      "9999-12-31",
      "9999-12-31",
      { year: 9999, month: 12 },
      [[4, 1, false, false]],
    ],
  ] as const)
    expect(
      calendarSegments([schedule("1", "1", a, b)], ym).map((p) => [
        p.column,
        p.span,
        p.continuesLeft,
        p.continuesRight,
      ]),
    ).toEqual(want);
  expect(
    calendarSegments([schedule("1", "1", "2026-11-01", "2026-11-01")], {
      year: 2026,
      month: 12,
    }),
  ).toEqual([]);
});
it("shows three lanes and counts hidden IDs per date, with the full same-name list", () => {
  const placed = placeWeek(
    calendarSegments(overlaps, { year: 2026, month: 12 }),
  );
  expect(placed.map((s) => s.lane)).toEqual([0, 1, 2, 3, 4]);
  expect(hiddenCount(placed, "2026-12-15")).toBe(2);
  expect(hiddenCount(placed, "2026-12-16")).toBe(0);
  expect(
    schedulesOnDate(
      { projects: [project()], schedules: overlaps },
      "2026-12-15",
    ).map((s) => s.id),
  ).toEqual(["1", "2", "3", "4", "5"]);
});
it("reuses the lowest free lane and compares large numeric IDs correctly", () => {
  const items = [
    schedule("1", "1", "2026-12-14", "2026-12-16"),
    schedule("2", "1", "2026-12-14", "2026-12-14"),
    schedule("3", "1", "2026-12-14", "2026-12-15"),
    schedule("4", "1", "2026-12-15", "2026-12-15"),
  ];
  expect(
    placeWeek(calendarSegments(items, { year: 2026, month: 12 })).map((s) => [
      s.scheduleId,
      s.lane,
    ]),
  ).toEqual([
    ["2", 0],
    ["3", 1],
    ["1", 2],
    ["4", 0],
  ]);
  const big = ["9007199254740993", "9007199254740992"].map((id) =>
    schedule(id, "1", "2026-12-15", "2026-12-15"),
  );
  expect(
    placeWeek(calendarSegments(big, { year: 2026, month: 12 })).map(
      (s) => s.scheduleId,
    ),
  ).toEqual(["9007199254740992", "9007199254740993"]);
});

it("counts hidden schedules independently for seven columns without counting duplicate IDs twice", () => {
  const base = calendarSegments([schedule("1", "1", "2026-12-14", "2026-12-16")], { year: 2026, month: 12 })[0];
  const placed = [
    { ...base, lane: 3 },
    { ...base, lane: 4 },
    { ...base, scheduleId: "2", column: 2, span: 2, lane: 5 },
    { ...base, scheduleId: "3", column: 6, span: 1, lane: 3 },
    { ...base, scheduleId: "4", lane: 0 },
  ];
  expect(hiddenCountsForWeek(placed)).toEqual([1, 1, 2, 1, 0, 0, 1]);
  expect(hiddenCountsForWeek([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
});
