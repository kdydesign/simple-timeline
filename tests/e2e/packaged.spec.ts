import { probeNetwork } from "./network-probe";
import { test, expect } from "@playwright/test";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { release, arch } from "node:os";
const ps = (args: string[]) =>
  execFileSync("pwsh.exe", ["-NoProfile", "-NonInteractive", ...args], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
const run = (file: string, args: string[]) => {
  const r = spawnSync(file, args, { encoding: "utf8", timeout: 90000 });
  if (r.status !== 0)
    throw Error(`Installer failed (${r.status}): ${r.stderr ?? ""}`);
};
async function waitUntil(condition: () => Promise<boolean>) {
  await expect.poll(condition, { timeout: 30000 }).toBe(true);
}
test("real production package installs, works offline, updates and retains DB after uninstall", async ({}, info) => {
  if (
    process.platform !== "win32" ||
    arch() !== "x64" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw Error(
      "Use a fresh disposable GitHub-hosted Windows VM, never an ordinary user profile",
    );
  const appData = ps([
      "-Command",
      "[Environment]::GetFolderPath('ApplicationData')",
    ]),
    profile = join(appData, "SimpleTimeline");
  if (existsSync(profile))
    throw Error("Refusing to touch an existing production profile");
  const installDir = join(
      process.env.RUNNER_TEMP!,
      "SimpleTimeline-installed-" + Date.now(),
    ),
    legacyDir = join(process.env.RUNNER_TEMP!, "SimpleTimeline-legacy-" + Date.now()),
    legacyInstalled = join(legacyDir, "Simple Timeline.exe"),
    db = join(profile, "data/timeline.sqlite3");
  const base = JSON.parse(
      await readFile("release/release-manifest.json", "utf8"),
    ),
    update = JSON.parse(
      await readFile("artifacts/windows-update/release-manifest.json", "utf8"),
    );
  const legacy = JSON.parse(await readFile("artifacts/windows-legacy/release-manifest.json", "utf8"));
  expect(legacy.version).toBe("0.2.1");
  expect(legacy.sourceSha).toBe("5c41982ee23e1f0f76f1aa0875c5361bd94a865b");
  const installed = join(installDir, "Planrail.exe"),
    rules: { name: string; exe: string }[] = [],
    evidence: Record<string, unknown> = {
      legacySourceSha: legacy.sourceSha,
      legacyInstallerSha256: legacy.sha256,
      legacyVersion: legacy.version,
      sourceSha: base.sourceSha,
      version: base.version,
      updateVersion: update.version,
      arch: arch(),
      osRelease: release(),
      platform: process.platform,
      profile,
      installerSha256: base.sha256,
      updateInstallerSha256: update.sha256,
      installed: false,
      offline: false,
      updated: false,
      uninstallPreserved: false,
      reinstalled: false,
    };
  await mkdir(info.outputDir, { recursive: true });
  let app: ElectronApplication | null = null;
  const launch = async (exe: string, version: string) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] => typeof p[1] === "string",
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    // The real entry must ignore these test/development variables; no product override is introduced.
    env.SIMPLE_TIMELINE_TEST_PROFILE = join(
      process.env.RUNNER_TEMP!,
      "must-not-be-used",
    );
    env.ELECTRON_RENDERER_URL = "http://127.0.0.1:1";
    env.NODE_ENV = "development";
    const instance = await _electron.launch({
      chromiumSandbox: true,
      executablePath: exe,
      env,
      timeout: 30000,
    });
    app = instance;
    const page = await instance.firstWindow();
    await expect(
      page.getByRole("button", { name: "프로젝트 추가", exact: true }),
    ).toBeEnabled();
    const actual = await instance.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      version: app.getVersion(),
      profile: app.getPath("userData"),
      appPath: app.getAppPath(),
      modules: process.versions.modules,
    }));
    expect(actual.packaged).toBe(true);
    expect(actual.version).toBe(version);
    expect(actual.profile.toLowerCase()).toBe(profile.toLowerCase());
    expect(actual.modules).toBe("150");
    expect(page.url()).toMatch(/^file:/);
    expect(page.url()).toContain("app.asar");
    evidence.runtime = actual;
    return page;
  };
  const close = async () => {
    if (app) {
      await app.close();
      app = null;
    }
  };
  const canConnect = async () =>
    app!.evaluate(probeNetwork, "https://example.com");
  const offline = async (exe: string) => {
    expect(await canConnect()).toBe(true);
    const name = "SimpleTimeline-offline-" + Date.now();
    ps([
      "-File",
      resolve("scripts/testing/windows-offline.ps1"),
      "-Program",
      exe,
      "-Action",
      "Add",
      "-RuleName",
      name,
    ]);
    rules.push({ name, exe });
    await app!.evaluate(({ session }) =>
      session.defaultSession.closeAllConnections(),
    );
    expect(await canConnect()).toBe(false);
  };
  const snapshot = async (page: Page) => {
    const result = await page.evaluate(() =>
      window.simpleTimeline.getSnapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("Packaged DB unavailable");
    return result.data;
  };
  try {
    run(resolve("artifacts/windows-legacy", legacy.installer), ["/S", "/D=" + legacyDir]);
    await waitUntil(async () => existsSync(legacyInstalled));
    let page = await launch(legacyInstalled, legacy.version);
    await page
      .getByRole("button", { name: "프로젝트 추가", exact: true })
      .click();
    await page
      .getByLabel("프로젝트 이름", { exact: true })
      .fill("1.1.1 핫픽스");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    for (const [name, start, end] of [
      ["개발", "2026-11-11", "2026-12-11"],
      ["QA", "2026-12-12", "2026-12-17"],
      ["운영 배포", "2026-12-18", "2026-12-18"],
    ]) {
      await page.locator('[data-focus="schedule-add"]').click();
      await page.getByLabel("일정 이름", { exact: true }).fill(name);
      await page.getByLabel("시작일", { exact: true }).fill(start);
      await page.getByLabel("종료일", { exact: true }).fill(end);
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(
        page.getByRole("button", { name: name + " 편집", exact: true }),
      ).toBeVisible();
    }
    // Preserve legacy light/collapse preferences; the new version migrates theme to dark.

    await page.getByRole('button', { name: '1.1.1 핫픽스 접기', exact: true }).click();
    const preferences = await page.evaluate(() => localStorage.getItem('simple-timeline.preferences.v1'));
    expect(preferences).not.toBeNull();
    const before = await snapshot(page);
    expect(before.schedules).toHaveLength(3);
    await close();
    page = await launch(
      legacyInstalled,
      legacy.version,
    );
    expect(await snapshot(page)).toEqual(before);
    await close();
    run(resolve("release", base.installer), ["/S", "/D=" + installDir]);
    await waitUntil(async () => existsSync(installed));
    await waitUntil(async () => !existsSync(legacyInstalled));
    evidence.legacyUpgradeWithChangedDirectory = true;
    evidence.installed = true;
    const system = JSON.parse(
      ps([
        "-File",
        resolve("scripts/testing/windows-release-info.ps1"),
        "-Installer",
        resolve("release", base.installer),
      ]),
    );
    expect(system.installerSignature).toBe("NotSigned");
    expect(system.userInstalls).toHaveLength(1);
    expect(system.userInstalls[0].DisplayVersion).toBe(base.version);
    expect(system.machineInstallCount).toBe(0);
    expect(system.shortcuts.length).toBeGreaterThanOrEqual(2);
    for (const shortcut of system.shortcuts) {
      expect(shortcut.name).toBe('Planrail');
      expect(shortcut.target.toLowerCase()).toBe(installed.toLowerCase());
    }
    evidence.system = system;
    console.log("Packaged Windows environment: "+JSON.stringify(system));

    page = await launch(installed, base.version);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('simple-timeline.preferences.v1')))!) ).toEqual({...JSON.parse(preferences!),theme:"dark",dayWidth:28});
    expect(await snapshot(page)).toEqual({...before,schedules:before.schedules.map(s=>({...s,reminder:{daysBefore:2,time:'09:00',start:false,end:false}}))});
    expect((await readFile(db)).readUInt32BE(60)).toBe(3);
    evidence.schemaVersion = 3;
    evidence.legacyReminderDefaultsOff = true;
    await offline(installed);
    evidence.offline = true;
    await page.getByLabel("선택 날짜", { exact: true }).fill("2026-12-01");
    await page.getByLabel("선택 날짜", { exact: true }).press("Enter");
    await expect(page.locator("[data-range]")).toHaveText(
      "2026-11-01 — 2026-12-31",
    );
    await page.getByRole("button", { name: "달력", exact: true }).click();
    await expect(page.locator('[data-segment="1"]')).toHaveCount(2);
    await page.locator('[data-segment="2"]').first().click();
    await page
      .getByLabel("일정 이름", { exact: true })
      .fill("QA 오프라인 수정");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator('[data-segment="2"]').first()).toContainText(
      "QA 오프라인 수정",
    );
    await page.locator('[data-segment="3"]').click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("button", { name: "일정 삭제", exact: true }).click();
    await expect(page.locator('[data-segment="3"]')).toHaveCount(0);
    const persisted = await snapshot(page);
    expect(persisted.schedules).toHaveLength(2);
    await page.screenshot({
      path: info.outputPath("installed-offline-calendar.png"),
    });
    await close();
    page = await launch(installed, base.version);
    expect(await snapshot(page)).toEqual(persisted);
    expect(await canConnect()).toBe(false);
    await close();
    run(resolve("artifacts/windows-update", update.installer), [
      "/S",
      "/D=" + installDir,
    ]);
    page = await launch(installed, update.version);
    expect(await snapshot(page)).toEqual(persisted);
    expect(await canConnect()).toBe(false);
    evidence.updated = true;
    await close();
    const hashBefore = createHash("sha256")
        .update(await readFile(db))
        .digest("hex"),
      uninstaller = (await readdir(installDir)).find(
        (s) => s.startsWith("Uninstall") && s.endsWith(".exe"),
      );
    if (!uninstaller) throw Error("Actual NSIS uninstaller missing");
    run(join(installDir, uninstaller), ["/S"]);
    await waitUntil(async () => !existsSync(installed));
    expect(
      createHash("sha256")
        .update(await readFile(db))
        .digest("hex"),
    ).toBe(hashBefore);
    const removedSystem = JSON.parse(ps(['-File',resolve('scripts/testing/windows-release-info.ps1'),'-Installer',resolve('release',base.installer)]));
    expect(removedSystem.shortcuts).toHaveLength(0);
    expect(removedSystem.userInstalls).toHaveLength(0);
    evidence.uninstallShortcutsRemoved = true;
    evidence.uninstallPreserved = true;
    run(resolve("artifacts/windows-update", update.installer), [
      "/S",
      "/D=" + installDir,
    ]);
    page = await launch(installed, update.version);
    expect(await snapshot(page)).toEqual(persisted);
    evidence.reinstalled = true;
    await close();
    evidence.dbBytes = (await stat(db)).size;
    evidence.pass = true;
  } finally {
    await close().catch(() => {});
    for (const r of rules)
      ps([
        "-File",
        resolve("scripts/testing/windows-offline.ps1"),
        "-Program",
        r.exe,
        "-Action",
        "Remove",
        "-RuleName",
        r.name,
      ]);
    await writeFile(
      info.outputPath("windows-validation.json"),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    // This suite created the fresh profile itself on a disposable VM and already verified preservation before cleanup.
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
    await rm(legacyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    await rm(installDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
