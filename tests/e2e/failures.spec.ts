import { test, expect } from "./fixture";
for (const [fault, message] of [
  ["refresh", "저장은 완료했지만"],
  ["lost", "저장 결과를 확인할 수 없습니다"],
]) {
  test.describe(fault, () => {
    test.use({ fault });
    test("preserves draft and does not duplicate committed creates after failed responses", async ({
      desktop: d,
    }) => {
      await d.page
        .getByRole("button", { name: "프로젝트 추가", exact: true })
        .click();
      await d.page
        .getByLabel("프로젝트 이름", { exact: true })
        .fill("한 번만 저장");
      await d.page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(d.page.getByRole("alert")).toContainText(message);
      await expect(
        d.page.getByLabel("프로젝트 이름", { exact: true }),
      ).toHaveValue("한 번만 저장");
      await expect(
        d.page.getByRole("button", { name: "저장", exact: true }),
      ).toBeDisabled();
      await d.page.getByRole("button", { name: "다시 조회" }).click();
      const saved = await d.page.evaluate(() =>
        window.simpleTimeline.getSnapshot(),
      );
      expect(saved.ok && saved.data.projects).toHaveLength(1);
    });
  });
}
for (const fault of ["schedule-full", "schedule-lost", "schedule-refresh"])
  test.describe(fault, () => {
    test.use({ fault, seed: "single" });
    test("preserves both views and the draft without automatically repeating a schedule create", async ({
      desktop: d,
    }) => {
      const p = d.page;
      await p.setViewportSize({ width: 1280, height: 800 });
      await p.getByLabel("선택 날짜", { exact: true }).fill("2026-12-01");
      await p.getByLabel("선택 날짜", { exact: true }).press("Enter");
      await p.locator('[data-focus="schedule-add"]').click();
      await p
        .getByLabel("일정 이름", { exact: true })
        .fill("중복 없이 새 일정");
      await p.getByLabel("시작일", { exact: true }).fill("2026-12-20");
      await p.getByLabel("종료일", { exact: true }).fill("2026-12-20");
      await p.getByRole("button", { name: "저장", exact: true }).click();
      await expect(p.getByRole("alert")).toContainText(
        fault === "schedule-full"
          ? "저장 공간"
          : fault === "schedule-lost"
            ? "저장 결과"
            : "저장은 완료했지만",
      );
      await expect(p.getByLabel("일정 이름", { exact: true })).toHaveValue(
        "중복 없이 새 일정",
      );
      await p.getByRole("button", { name: "달력", exact: true }).click();
      const calendar = p.getByRole("region", { name: "월간 달력" });
      await expect(calendar.locator('[data-segment="2"]')).toHaveCount(0);
      if (fault !== "schedule-full") {
        await expect(
          p.getByRole("button", { name: "저장", exact: true }),
        ).toBeDisabled();
        await p.getByRole("button", { name: "다시 조회" }).click();
        await expect(calendar.locator('[data-segment="2"]')).toHaveCount(1);
        const snapshot = await p.evaluate(() =>
          window.simpleTimeline.getSnapshot(),
        );
        expect(
          snapshot.ok &&
            snapshot.data.schedules.filter(
              (s) => s.name === "중복 없이 새 일정",
            ),
        ).toHaveLength(1);
        if (fault === "schedule-lost") {
          await expect(p.getByLabel("일정 이름", { exact: true })).toHaveValue(
            "중복 없이 새 일정",
          );
          await p.getByRole("button", { name: "편집 닫기" }).click();
          await p.getByRole("button", { name: "변경 버리기" }).click();
        }
        await p.getByRole("button", { name: "간트", exact: true }).click();
        await expect(
          p.getByRole("button", {
            name: "중복 없이 새 일정 편집",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        const snapshot = await p.evaluate(() =>
          window.simpleTimeline.getSnapshot(),
        );
        expect(snapshot.ok && snapshot.data.schedules).toHaveLength(1);
        await p.getByRole("button", { name: "저장", exact: true }).click();
        await expect(calendar.locator('[data-segment="2"]')).toHaveCount(1);
      }
    });
  });
