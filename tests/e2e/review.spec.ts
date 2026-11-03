import { test, expect } from "./fixture";
test.describe("final-review gantt interactions", () => {
  test.use({ seed: "focus" });
  test("Tab to an offscreen schedule never scrolls a row independently of date ticks", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await p.setViewportSize({ width: 1280, height: 800 });
    const input = p.getByLabel("선택 연월", { exact: true });
    await input.fill("2026-11");
    await input.press("Enter");
    const slider = p.getByRole("slider", { name: "간트 가로 이동" });
    await slider.focus();
    await p.keyboard.press("Home");
    await p.getByRole("button", { name: "QA 편집", exact: true }).focus();
    await p.keyboard.press("Tab");
    const offsets = await p
      .locator(".gantt-track")
      .evaluateAll((els) => els.map((el) => el.scrollLeft));
    expect(offsets.every((x) => x === 0)).toBe(true);
    await expect(slider).toHaveValue("0");
  });
  test("horizontal movement hands a disappearing focused bar back to its persistent name", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await p.setViewportSize({ width: 1280, height: 800 });
    const input = p.getByLabel("선택 연월", { exact: true });
    await input.fill("2026-11");
    await input.press("Enter");
    const slider = p.getByRole("slider", { name: "간트 가로 이동" });
    await slider.focus();
    await p.keyboard.press("Home");
    const bar = p.locator('[data-bar="1"]');
    await bar.focus();
    await p.locator(".gantt-body").hover();
    await p.mouse.wheel(4000, 0);
    await expect(
      p.getByRole("button", { name: "개발 편집", exact: true }),
    ).toBeFocused();
    await expect(p.locator('[data-bar="1"]')).toHaveCount(0);
  });
});
test.describe("final-review responsive layers", () => {
  test.use({ seed: "overlaps" });
  test("keeps the top day list operable when resizing over an open editor", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await p.setViewportSize({ width: 1280, height: 800 });
    const input = p.getByLabel("선택 연월", { exact: true });
    await input.fill("2026-12");
    await input.press("Enter");
    await p
      .getByRole("button", { name: "1.1.1 핫픽스 편집", exact: true })
      .click();
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await p.getByRole("button", { name: "2026-12-15 +2 더 보기" }).click();
    await p.setViewportSize({ width: 800, height: 600 });
    await p.keyboard.press("Escape");
    await expect(
      p.getByRole("dialog", { name: "2026-12-15 전체 일정 5개" }),
    ).toHaveCount(0);
    await expect(p.getByLabel("프로젝트 이름", { exact: true })).toBeFocused();
    await p.keyboard.press("Escape");
    await expect(p.getByRole("dialog")).toHaveCount(0);
  });
});
