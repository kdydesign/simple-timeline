import { it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GanttView } from "../../src/renderer/components/GanttView";
import { hotfix, project, schedule } from "../fixtures/timeline";
const callbacks = {
  onEditProject: () => {},
  onEditSchedule: () => {},
  onAddSchedule: () => {},
};
it("bounds date DOM and CSS coordinates even when moving to the last year", async () => {
  const u = userEvent.setup();
  render(
    <GanttView
      snapshot={{
        projects: [project()],
        schedules: [schedule("1", "1", "0001-01-01", "9999-12-31")],
      }}
      selectedMonth={{ year: 1, month: 1 }}
      {...callbacks}
    />,
  );
  expect(document.querySelector("[data-range]")).toHaveTextContent(
    "0001-01-01 — 9999-12-31",
  );
  const slider = screen.getByRole("slider", { name: "간트 가로 이동" });
  slider.focus();
  await u.keyboard("{End}");
  expect(slider).toHaveAttribute(
    "aria-valuetext",
    expect.stringContaining("9999-12"),
  );
  expect(document.querySelectorAll("[data-day]").length).toBeLessThan(110);
  const bar = document.querySelector<HTMLElement>("[data-bar]")!;
  expect(Math.abs(parseFloat(bar.style.left))).toBeLessThan(2000);
  expect(parseFloat(bar.style.width)).toBeLessThan(3000);
  await u.keyboard("{Home}{ArrowRight}");
  expect(slider).toHaveValue("28");
});
it("shows empty projects and outside selection, and preserves anchors on range changes", () => {
  const { rerender } = render(
    <GanttView
      snapshot={hotfix}
      selectedMonth={{ year: 2027, month: 3 }}
      {...callbacks}
    />,
  );
  expect(screen.getByText("선택 월은 전체 일정 범위 밖입니다")).toBeVisible();
  expect(screen.getByRole("button", { name: "일정 없음 편집" })).toBeVisible();
  const slider = screen.getByRole("slider", { name: "간트 가로 이동" });
  fireEvent.change(slider, { target: { value: "280" } });
  const changed = {
    ...hotfix,
    schedules: [
      ...hotfix.schedules,
      schedule("4", "1", "2026-10-01", "2026-10-01"),
    ],
  };
  rerender(
    <GanttView
      snapshot={changed}
      selectedMonth={{ year: 2027, month: 3 }}
      {...callbacks}
    />,
  );
  expect(slider).toHaveValue("1148");
});
it("keeps offscreen focused rows mounted and reaches every row by keyboard", async () => {
  const u = userEvent.setup(),
    schedules = Array.from({ length: 120 }, (_, i) => ({
      ...schedule(String(i + 1)),
      name: `일정 ${i + 1}`,
    }));
  const { container } = render(
    <GanttView
      snapshot={{ projects: [project()], schedules }}
      selectedMonth={{ year: 2026, month: 11 }}
      {...callbacks}
    />,
  );
  const first = screen.getByRole("button", { name: "일정 1 편집" });
  first.focus();
  const body = container.querySelector(".gantt-body")!;
  fireEvent.scroll(body, { target: { scrollTop: 4000 } });
  expect(first).toHaveFocus();
  first.focus();
  await u.keyboard("{ArrowDown}");
  await new Promise((r) => requestAnimationFrame(r));
  expect(screen.getByRole("button", { name: "일정 2 편집" })).toHaveFocus();
  expect(container.querySelectorAll("[data-row]").length).toBeLessThan(25);
});
it("clamps an anchor when deleting the last schedule without changing selected month", () => {
  const { rerender } = render(
    <GanttView
      snapshot={hotfix}
      selectedMonth={{ year: 2027, month: 3 }}
      {...callbacks}
    />,
  );
  rerender(
    <GanttView
      snapshot={{ projects: hotfix.projects, schedules: [] }}
      selectedMonth={{ year: 2027, month: 3 }}
      {...callbacks}
    />,
  );
  expect(document.querySelector("[data-range]")).toHaveTextContent(
    "2027-03-01 — 2027-03-31",
  );
  expect(screen.getByRole("slider", { name: "간트 가로 이동" })).toHaveValue(
    "0",
  );
  expect(
    screen.queryByText("선택 월은 전체 일정 범위 밖입니다"),
  ).not.toBeInTheDocument();
});
