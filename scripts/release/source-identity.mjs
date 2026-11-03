import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
export async function releaseIdentity({
  directory = process.cwd(),
  output = "release",
} = {}) {
  const run = (args) =>
    spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  const head = run(["rev-parse", "HEAD"]),
    sha = head.stdout?.trim();
  if (head.status !== 0 || !sha || !/^[0-9a-f]{40}$/.test(sha))
    throw Error("Committed source SHA required");
  const status = run(["status", "--porcelain=v1"]);
  if (status.status !== 0 || status.stdout.trim())
    throw Error(
      "Release requires a clean tree; commit or preserve uncommitted changes first",
    );
  let files = [];
  try {
    files = await readdir(resolve(directory, output));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (files.length)
    throw Error(
      "Release output must be empty; preserve previous build explicitly",
    );
  return sha;
}
