import { it, expect } from "vitest";
import { render, screen, within, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarView } from "../../src/renderer/components/CalendarView";
import { overlaps, hotfix, project } from "../fixtures/timeline";
const callbacks = {
  onEditProject: () => {},
  onEditSchedule: () => {},
  onAddSchedule: () => {},
};
it("exposes all same-name schedules from date-specific more and restores focus", async () => {
  const u = userEvent.setup();
  render(
    <CalendarView
      snapshot={{ projects: [project()], schedules: overlaps }}
      selectedMonth={{ year: 2026, month: 12 }}
      {...callbacks}
    />,
  );
  const more = screen.getByRole("button", { name: "2026-12-15 +2 더 보기" });
  expect(
    screen.getAllByRole("button", { name: /개발.*2026-12-15.*1일/ }),
  ).toHaveLength(3);
  await u.click(more);
  const dialog = screen.getByRole("dialog", {
    name: "2026-12-15 전체 일정 5개",
  });
  expect(
    within(dialog).getAllByRole("button", { name: /개발.*2026-12-15/ }),
  ).toHaveLength(5);
  await u.keyboard("{Escape}");
  await waitFor(() => expect(more).toHaveFocus());
});
it("renders only selected-month segments and full project/date accessible labels", () => {
  render(
    <CalendarView
      snapshot={hotfix}
      selectedMonth={{ year: 2026, month: 12 }}
      {...callbacks}
    />,
  );
  expect(
    screen.getAllByRole("button", {
      name: /1.1.1 핫픽스.*개발.*2026-11-11.*2026-12-11.*31일/,
    }),
  ).toHaveLength(2);
  expect(document.querySelector('[data-date="2026-11-30"] button')).toBeNull();
  expect(document.querySelectorAll('[data-segment="3"]').length).toBe(1);
});
import { App } from "../../src/renderer/App";
import { memoryApi } from "./fake-api";
it("keeps month and draft through mode changes and returns from day editing to more", async () => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    writable: true,
    configurable: true,
  });
  const u = userEvent.setup(),
    m = memoryApi({ projects: [project()], schedules: overlaps });
  render(<App api={m.api} today={new Date(2026, 11, 3)} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "프로젝트 추가" })).toBeEnabled(),
  );
  await u.click(screen.getByRole("button", { name: "달력" }));
  const more = screen.getByRole("button", { name: "2026-12-15 +2 더 보기" });
  await u.click(more);
  const dialog = screen.getByRole("dialog", {
    name: "2026-12-15 전체 일정 5개",
  });
  await u.click(within(dialog).getAllByRole("button", { name: /개발/ })[4]);
  expect(screen.getByLabelText("일정 이름")).toHaveValue("개발");
  await u.click(screen.getByRole("button", { name: "간트" }));
  expect(screen.getByLabelText("일정 이름")).toHaveValue("개발");
  expect(screen.getByLabelText("선택 날짜")).toHaveValue("2026-12-03");
  await u.click(screen.getByRole("button", { name: "달력" }));
  await u.click(screen.getByRole("button", { name: "편집 닫기" }));
  await waitFor(() => expect(more).toHaveFocus());
});
it("keeps all overflow items reachable without creating a DOM node per schedule", async () => {
  const u = userEvent.setup(),
    many = Array.from({ length: 250 }, (_, i) => ({
      ...overlaps[0],
      id: String(i + 1),
      name: `순서 ${i + 1}`,
    }));
  render(
    <CalendarView
      snapshot={{ projects: [project()], schedules: many }}
      selectedMonth={{ year: 2026, month: 12 }}
      {...callbacks}
    />,
  );
  await u.click(
    screen.getByRole("button", { name: "2026-12-15 +247 더 보기" }),
  );
  const dialog = screen.getByRole("dialog"),
    first = within(dialog).getByRole("button", { name: /순서 1 ·/ });
  first.focus();
  await u.keyboard("{End}");
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: /순서 250 ·/ }),
    ).toHaveFocus(),
  );
  expect(within(dialog).getAllByRole("button").length).toBeLessThan(15);
});
it("keeps a usable focus path when day selection meets an unsaved editor", async () => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    writable: true,
    configurable: true,
  });
  const u = userEvent.setup(),
    m = memoryApi({ projects: [project()], schedules: overlaps });
  render(<App api={m.api} today={new Date(2026, 11, 3)} />);
  await u.click(
    await screen.findByRole("button", { name: "1.1.1 핫픽스 편집" }),
  );
  await u.type(screen.getByLabelText("프로젝트 이름"), " 변경");
  await u.click(screen.getByRole("button", { name: "달력" }));
  const more = screen.getByRole("button", { name: "2026-12-15 +2 더 보기" });
  await u.click(more);
  await u.click(
    within(screen.getByRole("dialog")).getAllByRole("button", {
      name: /개발/,
    })[4],
  );
  await u.click(screen.getByRole("button", { name: "계속 편집" }));
  await waitFor(() =>
    expect(screen.getByLabelText("프로젝트 이름")).toHaveFocus(),
  );
  await u.click(more);
  await u.click(
    within(screen.getByRole("dialog")).getAllByRole("button", {
      name: /개발/,
    })[4],
  );
  await u.click(screen.getByRole("button", { name: "변경 버리기" }));
  await u.click(screen.getByRole("button", { name: "편집 닫기" }));
  await waitFor(() => expect(more).toHaveFocus());
});
it("keeps reverse tab from the initially focused day title inside the modal", async () => {
  const u = userEvent.setup();
  render(
    <CalendarView
      snapshot={{ projects: [project()], schedules: overlaps }}
      selectedMonth={{ year: 2026, month: 12 }}
      {...callbacks}
    />,
  );
  await u.click(screen.getByRole("button", { name: "2026-12-15 +2 더 보기" }));
  const dialog = screen.getByRole("dialog");
  await u.tab({ shift: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
});
it("uses the current mode and month when an outstanding save completes", async () => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    writable: true,
    configurable: true,
  });
  const u = userEvent.setup(),
    m = memoryApi({ projects: [project()], schedules: [] }),
    original = m.api.createSchedule;
  let finish: () => Promise<void> = async () => {};
  m.api.createSchedule = (input) =>
    new Promise((resolve) => {
      finish = async () => resolve(await original(input));
    });
  render(<App api={m.api} today={new Date(2026, 10, 3)} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "프로젝트 추가" })).toBeEnabled(),
  );
  await u.click(
    document.querySelector<HTMLElement>('[data-focus="schedule-add"]')!,
  );
  await u.type(screen.getByLabelText("일정 이름"), "저장 대기 중");
  await u.click(screen.getByRole("button", { name: "저장" }));
  await u.click(screen.getByRole("button", { name: "달력" }));
  const month = screen.getByLabelText("선택 날짜");
  fireEvent.change(month, {target:{value:"2027-03-01"}});
  fireEvent.keyDown(month, {key:"Enter"});
  await act(async () => {
    await finish();
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "현재 월 표시 대상 아님",
    ),
  );
  expect(month).toHaveValue("2027-03-01");
  await waitFor(()=>expect(document.querySelector('[data-focus="schedule-add"]')).toHaveFocus());
});
