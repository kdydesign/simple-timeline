import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  testIgnore: "packaged.spec.ts",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 7000 },
  reporter: [["list"], ["json", { outputFile: "artifacts/e2e/results.json" }]],
  outputDir: "artifacts/e2e/output",
});
