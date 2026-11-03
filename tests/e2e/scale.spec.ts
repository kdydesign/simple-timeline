import { test, expect } from "./fixture";
import { writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
test.describe("scale and extreme years", () => {
  test.use({ seed: "scale" });
  test("reaches both years and all 10000 schedules with bounded DOM and nearby CSS", async ({
    desktop: d,
  }, info) => {
    const p = d.page;
    await p.setViewportSize({ width: 1280, height: 800 });
    await expect(
      p.getByRole("button", { name: "프로젝트 추가", exact: true }),
    ).toBeEnabled();
    const firstReadyMs = Date.now() - d.launchedAt;
    const session = await p.context().newCDPSession(p);
    await session.send("Performance.enable");
    const snapshot = await p.evaluate(() =>
      window.simpleTimeline.getSnapshot(),
    );
    expect(snapshot.ok && snapshot.data.schedules).toHaveLength(10000);
    const slider = p.getByRole("slider", { name: "간트 가로 이동" });
    await slider.focus();
    await p.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", /0001-01/);
    const start = Date.now();
    await p.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", /9999-12/);
    const scrollMs = Date.now() - start;
    expect(await p.locator("[data-day]").count()).toBeLessThan(110);
    expect(await p.locator("[data-row]").count()).toBeLessThan(40);
    await p.locator(".gantt-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      p.getByRole("button", { name: "마지막 연도 편집", exact: true }),
    ).toBeVisible();
    const bar = p.locator('[data-bar="2"]');
    await expect(bar).toHaveAttribute("data-days", "1");
    const coordinates = await p
      .locator(".gantt-bar,.day-tick,.month-tick")
      .evaluateAll((els) =>
        els.map((el) => {
          const s = (el as HTMLElement).style;
          return {
            left: parseFloat(s.left) || 0,
            width: parseFloat(s.width) || 0,
          };
        }),
      );
    expect(
      coordinates.every((v) => Math.abs(v.left) < 3000 && v.width < 4000),
    ).toBe(true);
    const firstSchedule = p.getByRole("button", {
      name: "마지막 연도 편집",
      exact: true,
    });
    await firstSchedule.focus();
    await p.keyboard.press("ArrowUp");
    await expect(
      p.getByRole("button", { name: "대량 일정 9998 편집", exact: true }),
    ).toBeFocused();
    await p.getByLabel("선택 연월", { exact: true }).fill("2026-12");
    await p.getByLabel("선택 연월", { exact: true }).press("Enter");
    const calendarStart = Date.now();
    await p.getByRole("button", { name: "달력", exact: true }).click();
    const more = p.getByRole("button", { name: "2026-12-15 +9995 더 보기" });
    await expect(more).toBeVisible();
    const calendarMs = Date.now() - calendarStart;
    await more.click();
    const dialog = p.getByRole("dialog", {
      name: "2026-12-15 전체 일정 9998개",
    });
    const first = dialog.getByRole("button", { name: /대량 일정 1 ·/ });
    await first.focus();
    await p.keyboard.press("End");
    const last = dialog.getByRole("button", { name: /대량 일정 9998 ·/ });
    await expect(last).toBeFocused();
    expect(await dialog.locator("[data-list-index]").count()).toBeLessThan(20);
    await p.keyboard.press("Enter");
    await expect(p.getByLabel("일정 이름", { exact: true })).toHaveValue(
      "대량 일정 9998",
    );
    await p.getByRole("button", { name: "편집 닫기" }).click();
    await expect(more).toBeFocused();
    const perf = await session.send("Performance.getMetrics");
    const processes = await d.app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .map((p) => ({ type: p.type, cpu: p.cpu, memory: p.memory })),
    );
    await writeFile(
      info.outputPath("scale-metrics.json"),
      JSON.stringify(
        {
          os: platform(),
          release: release(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          hostMemoryBytes: totalmem(),
          viewport: { width: 1280, height: 800 },
          fixtureSchedules: 10000,
          launchToFirstWindowMs: d.launchMs,
          firstReadyMs,
          scrollToEndMs: scrollMs,
          calendarMs,
          rendererPerformance: perf.metrics,
          processes,
        },
        null,
        2,
      ),
    );
    await p.screenshot({ path: info.outputPath("calendar-10000.png") });
  });
});
