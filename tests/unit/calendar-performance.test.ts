import { it, expect } from "vitest";
import {
  calendarSegments,
  placeWeek,
  hiddenCount,
  hiddenCountsForWeek,
} from "../../src/visualization/calendar";
import { schedule } from "../fixtures/timeline";

it("preserves weekly counts for 10000 overlapping schedules", () => {
  const placed = placeWeek(calendarSegments(
    Array.from({ length: 10000 }, (_, i) =>
      schedule(String(i + 1), "1", "2026-12-14", "2026-12-20"),
    ),
    { year: 2026, month: 12 },
  ));
  const dates = Array.from({ length: 7 }, (_, i) => `2026-12-${14 + i}`);
  const old = () => dates.map((date) => hiddenCount(placed, date));
  const next = () => hiddenCountsForWeek(placed);
  expect(next()).toEqual([9997, 9997, 9997, 9997, 9997, 9997, 9997]);
  expect(next()).toEqual(old());

  // Timing is opt-in evidence, never a machine-dependent CI threshold.
  if (process.env.ST_BENCHMARK !== "1") return;
  for (let i = 0; i < 5; i++) { old(); next(); }
  const measure = (fn: () => unknown) => {
    const samples = Array.from({ length: 15 }, () => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    return samples[7];
  };
  console.log(JSON.stringify({
    oldMedianMs: measure(old),
    newMedianMs: measure(next),
    schedules: placed.length,
  }));
});
