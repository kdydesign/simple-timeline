import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const steps = [
  "typecheck",
  "test:release",
  "test:tz",
  "test:ui",
  "build",
  "test:native",
  "test:e2e",
];
const npm = process.env.npm_execpath;
if (!npm) throw Error("Run npm run verify:app");
mkdirSync("artifacts/app", { recursive: true });
const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
const status = spawnSync("git", ["status", "--porcelain=v1"], {
  encoding: "utf8",
});
const report = {
  scope: "application-tests",
  state: "running",
  passed: false,
  startedAt: new Date().toISOString(),
  head: git.stdout?.trim(),
  dirty: !!status.stdout?.trim(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  checks: [],
};
const save = () =>
  writeFileSync(
    "artifacts/app/latest.json",
    JSON.stringify(report, null, 2) + "\n",
  );
save();
for (const step of steps) {
  // E2E: Windows run43135614492 passed82/93 cases before the240s aggregate cap.
  // Native Windows first 50/70 cases took 92.8s; budget the remaining real DB/network work.
  // Keep individual test/request deadlines; only whole-suite allocations differ.
  const timeoutMs = step === "test:native" ? 360000 : step === "test:e2e" ? 360000 : 180000;
  const result = spawnSync(process.execPath, [npm, "run", step], {
    env: process.env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  const log = `${result.stdout || ""}\n${result.stderr || ""}`;
  const file = step.replaceAll(":", "-");
  writeFileSync(`artifacts/app/${file}.log`, log);
  const passed = !result.error && result.status === 0;
  report.checks.push({
    name: step,
    timeoutMs,
    passed,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  console.log(`${passed ? "PASS" : "FAIL"} ${step}`);
  save();
  if (!passed) {
    console.error(log.split("\n").slice(-45).join("\n"));
    break;
  }
}
for (const step of steps.slice(report.checks.length))
  report.checks.push({ name: step, passed: false, state: "not-run" });
report.passed = report.checks.every((c) => c.passed);
report.state = "completed";
report.finishedAt = new Date().toISOString();
save();
console.log("Application evidence: artifacts/app/latest.json");
if (!report.passed) process.exitCode = 1;
