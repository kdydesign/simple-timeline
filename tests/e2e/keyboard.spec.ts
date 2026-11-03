import { test, expect } from "./fixture";
import type { Locator, Page } from "playwright";
async function tabTo(page: Page, target: Locator) {
  for (let n = 0; n < 80; n++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw Error(
    "Keyboard could not reach " + (await target.getAttribute("aria-label")),
  );
}
test("keyboard CRUD remains usable at a 200 percent equivalent viewport with long Unicode names", async ({
  desktop: d,
}, info) => {
  const p = d.page;
  await p.setViewportSize({ width: 640, height: 400 });
  const add = p.getByRole("button", { name: "프로젝트 추가", exact: true });
  await expect(add).toBeEnabled();
  await tabTo(p, add);
  await p.keyboard.press("Enter");
  const name = "긴 프로젝트 👩‍💻 가나 é ".repeat(100);
  await p.keyboard.insertText(name);
  const save = p.getByRole("button", { name: "저장", exact: true });
  await tabTo(p, save);
  await p.keyboard.press("Enter");
  const project = p.getByRole("button", {
    name: name.trim() + " 편집",
    exact: true,
  });
  await expect(project).toBeFocused();
  await p.keyboard.press("Enter");
  await expect(p.getByLabel("프로젝트 이름", { exact: true })).toBeFocused();
  await p.keyboard.press("ControlOrMeta+A");
  await p.keyboard.insertText("키보드 프로젝트");
  await tabTo(p, p.getByRole("button", { name: "저장", exact: true }));
  await p.keyboard.press("Enter");
  await expect(
    p.getByRole("button", { name: "키보드 프로젝트 편집", exact: true }),
  ).toBeFocused();
  await tabTo(p, p.locator('[data-focus="schedule-add"]'));
  await p.keyboard.press("Enter");
  await tabTo(p, p.getByLabel("일정 이름", { exact: true }));
  await p.keyboard.insertText("키보드 일정");
  await tabTo(p, p.getByRole("button", { name: "저장", exact: true }));
  await p.keyboard.press("Enter");
  const schedule = p.getByRole("button", {
    name: "키보드 일정 편집",
    exact: true,
  });
  await expect(schedule).toBeFocused();
  await p.keyboard.press("Enter");
  await tabTo(p, p.getByRole("button", { name: "삭제", exact: true }));
  await p.keyboard.press("Enter");
  await expect(
    p.getByRole("button", { name: "취소", exact: true }),
  ).toBeFocused();
  await p.keyboard.press("Tab");
  await p.keyboard.press("Enter");
  await expect(schedule).toHaveCount(0);
  await tabTo(p, p.getByRole("button", { name: "달력", exact: true }));
  await p.keyboard.press("Enter");
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await p.screenshot({
    path: info.outputPath("keyboard-200-percent-equivalent.png"),
  });
});
