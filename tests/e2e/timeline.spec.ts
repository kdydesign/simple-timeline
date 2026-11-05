import { test, expect } from "./fixture";
async function choose(page: import("playwright").Page, month: string) {
  await page.getByLabel("선택 날짜", { exact: true }).fill(month.length === 7 ? month+'-01' : month);
  await page.getByLabel("선택 날짜", { exact: true }).press("Enter");
}
test.describe("two-mode hotfix", () => {
  test.use({ seed: "hotfix" });
  test("shares dates/colors, preserves navigation and edits/deletes both modes across restart", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await choose(p, "2026-12-01");
    const gantt = p.getByRole("region", { name: "간트", exact: true }),
      bar = gantt.locator('[data-bar="1"]');
    await expect(bar).toHaveAttribute("data-logical-x", "280");
    await expect(bar).toHaveAttribute("data-days", "31");
    const color = await bar.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const slider = gantt.getByRole("slider");
    await slider.focus();
    await p.keyboard.press("Home");
    await p.keyboard.press("ArrowRight");
    const offset = await slider.inputValue();
    await p.getByRole("button", { name: "달력", exact: true }).click();
    const calendar = p.getByRole("region", { name: "월간 달력" }),
      development = calendar.locator('[data-segment="1"]');
    await expect(development).toHaveCount(2);
    expect(
      await development
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(color);
    await p.getByRole("button", { name: "간트", exact: true }).click();
    await expect(slider).toHaveValue(offset);
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await choose(p, "2027-03-01");
    await expect(p.getByText("이 달에 표시할 일정이 없습니다.")).toBeVisible();
    await p.getByRole("button", { name: "간트", exact: true }).click();
    await expect(
      p.locator('[data-day="2027-03-01"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(p.getByLabel("선택 날짜", { exact: true })).toHaveValue(
      "2027-03-01",
    );
    await choose(p, "2026-12-01");
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await calendar.locator('[data-segment="2"]').first().click();
    await p.getByLabel("일정 이름", { exact: true }).fill("QA 수정");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(calendar.locator('[data-segment="2"]').first()).toContainText(
      "QA 수정",
    );
    await p.getByRole("button", { name: "간트", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "QA 수정 편집", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await calendar.locator('[data-segment="3"]').click();
    await p.getByRole("button", { name: "삭제", exact: true }).click();
    await p.getByRole("button", { name: "일정 삭제", exact: true }).click();
    await expect(calendar.locator('[data-segment="3"]')).toHaveCount(0);
    await p.getByRole("button", { name: "간트", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "운영 배포 편집", exact: true }),
    ).toHaveCount(0);
    await d.restart();
    const now = await d.page.evaluate(() => {
      const d = new Date();
      return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2,"0")}`;
    });
    await expect(d.page.getByLabel("선택 날짜", { exact: true })).toHaveValue(
      now,
    );
    await expect(
      d.page.getByRole("button", { name: "QA 수정 편집", exact: true }),
    ).toBeVisible();
  });
  test("keeps an out-of-month save explicit and returns keyboard focus to add", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await choose(p, "2027-03-01");
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await p.locator('[data-focus="schedule-add"]').click();
    await p.getByLabel("일정 이름", { exact: true }).fill("다른 달 일정");
    await p.getByLabel("시작일", { exact: true }).fill("2026-12-20");
    await p.getByLabel("종료일", { exact: true }).fill("2026-12-20");
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(p.getByRole("status")).toContainText("현재 월 표시 대상 아님");
    await expect(p.locator('[data-focus="schedule-add"]')).toBeFocused();
    await expect(p.getByLabel("선택 날짜", { exact: true })).toHaveValue(
      "2027-03-01",
    );
  });
});
test.describe("one remaining schedule", () => {
  test.use({ seed: "single" });
  test("returns the gantt to selected month after last deletion, keeping the empty project", async ({
    desktop: d,
  }) => {
    const p = d.page;
    await choose(p, "2027-03-01");
    await p.getByRole("button", { name: "간트", exact: true }).click();
    await p.getByRole("button", { name: "개발 편집", exact: true }).click();
    await p.getByRole("button", { name: "삭제", exact: true }).click();
    await p.getByRole("button", { name: "일정 삭제", exact: true }).click();
    await expect(p.locator("[data-range]")).toHaveText(
      `${(await p.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`}))} — 2027-03-31`,
    );
    await expect(
      p.getByRole("button", { name: "1.1.1 핫픽스 편집", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "달력", exact: true }).click();
    await p.getByRole("button", { name: "프로젝트 목록", exact: true }).click();
    await expect(
      p.getByRole("region", { name: "프로젝트 목록" }),
    ).toContainText("일정 0개");
  });
});
