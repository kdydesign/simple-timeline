import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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
