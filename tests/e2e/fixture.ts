import { test as base, expect } from "@playwright/test";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { mkdtemp, rm, mkdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(resolve("package.json"));
export interface Desktop {
  app: ElectronApplication;
  page: Page;
  profile: string;
  restart(): Promise<void>;
  launchMs: number;
  launchedAt: number;
}
export const test = base.extend<{
  desktop: Desktop;
  fault: string;
  seed: string;
}>({
  fault: ["", { option: true }],
  seed: ["", { option: true }],
  desktop: async ({ fault, seed }, use, info) => {
    const profile = await mkdtemp(join(tmpdir(), "simple-timeline-e2e-"));
    const log = info.outputPath("electron.log");
    await mkdir(info.outputDir, { recursive: true });
    const launch = async () => {
      const began = Date.now();
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
      delete env.ELECTRON_RUN_AS_NODE;
      const app = await _electron.launch({
        chromiumSandbox: true,
        executablePath: require("electron"),
        args: [resolve("artifacts/test-app/main/index.cjs"), ...(fault.startsWith("autostart") ? ["--planrail-autostart"] : [])],
        env: {
          ...env,
          SIMPLE_TIMELINE_TEST_PROFILE: profile,
          SIMPLE_TIMELINE_TEST_FAULT: fault,
          SIMPLE_TIMELINE_TEST_SEED: seed,
        },
        timeout: 30000,
      });
      app.process().stderr?.on("data", (chunk) => {
        void appendFile(log, chunk);
      });
      const page = await app.firstWindow();
      await page
        .getByRole("button", { name: "프로젝트 추가", exact: true })
        .waitFor();
      return { app, page, launchMs: Date.now() - began, launchedAt: began };
    };
    const first = await launch();
    const desktop: Desktop = {
      ...first,
      profile,
      async restart() {
        await desktop.app.close();
        Object.assign(desktop, await launch());
      },
    };
    try {
      await use(desktop);
    } finally {
      if (info.status !== info.expectedStatus) {
        await desktop.page
          .screenshot({ path: info.outputPath("failure.png") })
          .catch(() => {});
      }
      await desktop.app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await desktop.app.close().catch(() => {});
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
});
export { expect };
