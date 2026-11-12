import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["packaged.spec.ts", "packaged.startup.spec.ts", "packaged.update.spec.ts"],
  workers: 1,
  timeout: 180000,
  expect: { timeout: 10000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/packaged/results.json" }],
  ],
  outputDir: "artifacts/packaged/output",
});
