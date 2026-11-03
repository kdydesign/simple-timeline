import { test, expect } from "./fixture";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve("package.json"));
test("UI → IPC → SQLite CRUD persists across restart and cascades atomically", async ({
  desktop: d,
}) => {
  const p = d.page;
  await expect(
    p.getByRole("button", { name: "프로젝트 추가", exact: true }),
  ).toBeEnabled();
  await p.getByRole("button", { name: "프로젝트 추가", exact: true }).click();
  await p.getByLabel("프로젝트 이름", { exact: true }).fill(" 1.1.1 핫픽스 ");
  await p.getByRole("button", { name: "참여자 이름 추가" }).click();
  await p.getByLabel("참여자 1", { exact: true }).fill(" 민수 ");
  await p.getByRole("button", { name: "저장", exact: true }).click();
  const project = p.getByRole("region", { name: "1.1.1 핫픽스", exact: true });
  await expect(project).toBeVisible();
  await expect(project).toContainText("민수");
  for (const [name, start, end] of [
    ["개발", "2026-11-11", "2026-12-11"],
    ["QA", "2026-12-12", "2026-12-17"],
    ["운영 배포", "2026-12-18", "2026-12-18"],
  ]) {
    await project
      .getByRole("button", { name: "일정 추가", exact: true })
      .click();
    await p.getByLabel("일정 이름", { exact: true }).fill(name);
    await p.getByLabel("시작일", { exact: true }).fill(start);
    await p.getByLabel("종료일", { exact: true }).fill(end);
    await p.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      p.getByRole("button", { name: `${name} 편집`, exact: true }),
    ).toBeVisible();
  }
  const before = await p.evaluate(() => window.simpleTimeline.getSnapshot());
  expect(before.ok).toBe(true);
  await p.getByRole("button", { name: "QA 편집", exact: true }).click();
  await p.getByLabel("일정 이름", { exact: true }).fill("QA 수정");
  await p.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "QA 수정 편집", exact: true }),
  ).toBeVisible();
  await d.restart();
  await expect(
    d.page.getByRole("button", { name: "QA 수정 편집", exact: true }),
  ).toBeVisible();
  const after = await d.page.evaluate(() =>
    window.simpleTimeline.getSnapshot(),
  );
  if (before.ok && after.ok) {
    expect(after.data.projects).toEqual(before.data.projects);
    expect(after.data.schedules.map((s) => s.id)).toEqual(
      before.data.schedules.map((s) => s.id),
    );
  }
  await d.page
    .getByRole("button", { name: "운영 배포 편집", exact: true })
    .click();
  await d.page.getByRole("button", { name: "삭제", exact: true }).click();
  await d.page.getByRole("button", { name: "일정 삭제", exact: true }).click();
  await expect(
    d.page.getByRole("button", { name: "운영 배포 편집", exact: true }),
  ).toHaveCount(0);
  await d.page
    .getByRole("button", { name: "1.1.1 핫픽스 편집", exact: true })
    .click();
  await d.page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(d.page.getByRole("alertdialog")).toContainText("일정 2개");
  await d.page.getByRole("button", { name: "함께 삭제", exact: true }).click();
  await expect(
    d.page.getByText("프로젝트를 추가해 일정을 관리하세요"),
  ).toBeVisible();
  const empty = await d.page.evaluate(() =>
    window.simpleTimeline.getSnapshot(),
  );
  expect(empty).toEqual({ ok: true, data: { projects: [], schedules: [] } });
});
test("a second process focuses the first instead of opening a second database", async ({
  desktop: d,
}) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SIMPLE_TIMELINE_TEST_PROFILE: d.profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const second = spawn(
    require("electron"),
    [resolve("artifacts/test-app/main/index.cjs")],
    { env, stdio: "ignore" },
  );
  const exit = await new Promise<number | null>((done, reject) => {
    const timer = setTimeout(() => {
      second.kill();
      reject(Error("Second instance did not exit"));
    }, 15000);
    second.on("error", reject);
    second.on("exit", (code) => {
      clearTimeout(timer);
      done(code);
    });
  });
  expect(exit).toBe(0);
  await expect(
    d.page.getByRole("button", { name: "프로젝트 추가", exact: true }),
  ).toBeEnabled();
  expect(d.app.windows()).toHaveLength(1);
});
