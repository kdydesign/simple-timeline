import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { load } from "js-yaml";
import { releaseIdentity } from "../../scripts/release/source-identity.mjs";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "simple-timeline-source-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "--quiet");
  await writeFile(join(dir, ".gitignore"), "/release/\n");
  await writeFile(join(dir, "app.txt"), "committed");
  git("add", ".");
  git(
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
  return { dir, sha: git("rev-parse", "HEAD").trim() };
}
test("attributes a clean build to its exact committed source", async (t) => {
  const { dir, sha } = await fixture(t);
  assert.equal(
    await releaseIdentity({ directory: dir, output: "release" }),
    sha,
  );
});
test("refuses to label uncommitted code as the committed SHA", async (t) => {
  const { dir } = await fixture(t);
  await writeFile(join(dir, "app.txt"), "changed");
  await assert.rejects(
    () => releaseIdentity({ directory: dir, output: "release" }),
    /clean|uncommitted|dirty/i,
  );
});
test("refuses to mix existing installer outputs into a new release", async (t) => {
  const { dir } = await fixture(t);
  await mkdir(join(dir, "release"));
  await writeFile(join(dir, "release/old.exe"), "older installer");
  await assert.rejects(
    () => releaseIdentity({ directory: dir, output: "release" }),
    /empty|previous|output/i,
  );
});
test("Actions names each distribution artifact for the exact build source", async () => {
  const workflow = load(await readFile(".github/workflows/app.yml", "utf8"));
  const uploads = workflow.jobs.app.steps.filter(step => step.uses === "actions/upload-artifact@v4");
  const artifactFor = path => uploads.find(step => step.with.path.split("\n").includes(path))?.with.name;
  assert.deepEqual([
    artifactFor("release/*-update.zip"),
    artifactFor("release/latest.yml"),
    artifactFor("artifacts/windows-update/*.exe"),
  ], [
    "WorkRail-Windows11-x64-unsigned-${{ github.sha }}",
    "WorkRail-LAN-UPDATE-${{ github.sha }}",
    "WorkRail-UPDATE-TEST-ONLY-${{ github.sha }}",
  ]);
});
