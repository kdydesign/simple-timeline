import { it, expect } from "vitest";
import {
  colorText,
  indexSnapshot,
  scheduleDescription,
} from "../../src/visualization/presentation";
import { project, schedule } from "../fixtures/timeline";
it("chooses readable text and distinguishes duplicate names without merging IDs", () => {
  expect(colorText("#000000")).toBe("#FFFFFF");
  expect(colorText("#FFFFFF")).toBe("#000000");
  const p = project("1", "같음"),
    q = project("2", "같음"),
    a = schedule("9"),
    b = schedule("10"),
    idx = indexSnapshot({ projects: [q, p], schedules: [b, a] });
  expect(idx.projects.map((p) => p.id)).toEqual(["1", "2"]);
  expect(idx.projectLabel(p)).toBe("같음 · #1");
  expect(idx.scheduleLabel(b)).toBe("개발 · #10");
  expect(idx.byProject.get("1")?.map((s) => s.id)).toEqual(["9", "10"]);
  expect(scheduleDescription(a, p)).toBe(
    "같음 · 개발 · #9 · 2026-11-11 — 2026-12-11 · 31일",
  );
});
