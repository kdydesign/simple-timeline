import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { NtExecutable, NtExecutableResource } from 'resedit';
import { shellIconName } from '../../scripts/release/shell-icon-name.mjs';
import { finished } from "node:stream/promises";
import {
  inspectPackage,
  normalizeArchivePath,
} from "../../scripts/testing/packaged-smoke.mjs";
const require = createRequire(import.meta.url),
  asar = require("@electron/asar");
function pe(machine = 0x8664) {
  const b = Buffer.alloc(128);
  b.write("MZ");
  b.writeUInt32LE(64, 60);
  b.write("PE\0\0", 64);
  b.writeUInt16LE(machine, 68);
  return b;
}
async function fixture(
  t,
  {
    staleIcon = false,
    addon = true,
    machine = 0x8664,
    testEntry = false,
    preload = true,
    layout = "prebuild",
    unpack = true,
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "simple-timeline-package-check-")),
    source = join(root, "source"),
    unpacked = join(root, "win-unpacked");
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["out/main", "out/preload", "out/renderer"])
    await mkdir(join(source, dir), { recursive: true });
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "simple-timeline",
      version: "0.1.0",
      main: "out/main/index.cjs",
    }),
  );
  await writeFile(
    join(source, "out/main/index.cjs"),
    'require("better-sqlite3")',
  );
  if (preload) await writeFile(join(source, "out/preload/index.cjs"), "bridge");
  await writeFile(join(source, "out/renderer/index.html"), "<html></html>");
  if (testEntry) {
    await mkdir(join(source, "tests/e2e"), { recursive: true });
    await writeFile(join(source, "tests/e2e/main.js"), "test");
  }
  const module = join(source, "node_modules/better-sqlite3");
  await mkdir(join(module, "lib"), { recursive: true });
  await writeFile(
    join(module, "package.json"),
    JSON.stringify({
      name: "better-sqlite3",
      version: "13.0.3",
      main: "lib/index.js",
    }),
  );
  await writeFile(join(module, "lib/index.js"), "module.exports={}");
  if (addon) {
    const member =
      layout === "prebuild"
        ? "prebuilds/win32-x64.node"
        : "build/Release/better_sqlite3.node";
    const parts = member.split("/");
    await mkdir(join(module, ...parts.slice(0, -1)), { recursive: true });
    await writeFile(join(module, ...parts), pe(machine));
  }
  await mkdir(join(unpacked, "resources"), { recursive: true });
  const archiveStream = await asar.createPackageWithOptions(
    source,
    join(unpacked, "resources/app.asar"),
    unpack ? { unpack: "**/*.node" } : {},
  );
  // ASAR returns the ended stream before its pending writes have finished.
  await finished(archiveStream);
  const ico = await readFile("resources/icon.ico");
  await writeFile(join(unpacked, "resources", shellIconName), ico);
  const exe = join(unpacked, "Planrail.exe");
  await writeFile(exe, Buffer.from(NtExecutable.createEmpty(false, false).generate()));
  const {editWindowsResources} = require("app-builder-lib/out/util/resEdit.js");
  await editWindowsResources({file: exe, iconPath: "resources/icon.ico", versionStrings: {},
    fileVersion: "0.1.0", productVersion: "0.1.0"});
  if (staleIcon) {
    const binary = NtExecutable.from(await readFile(exe));
    const resources = NtExecutableResource.from(binary);
    const frame = resources.entries.filter(entry => entry.type === 3).at(-1);
    new Uint8Array(frame.bin)[0] ^= 1;
    resources.outputResource(binary);
    await writeFile(exe, Buffer.from(binary.generate()));
  }
  return unpacked;
}
test("recognizes an x64 native addon outside ASAR and the production entry", async (t) => {
  const result = await inspectPackage(await fixture(t));
  assert.equal(result.arch, "x64");
  assert.equal(result.version, "0.1.0");
  assert.equal(result.main, "out/main/index.cjs");
});
test("expands the NSIS distribution name with the version and full source SHA", async (t) => {
  const { load } = require("js-yaml");
  const { expandMacro } = require("app-builder-lib/out/util/macroExpander.js");
  const config = load(await readFile("electron-builder.yml", "utf8"));
  const originalSha = process.env.ST_SOURCE_SHA;
  t.after(() => {
    if (originalSha === undefined) delete process.env.ST_SOURCE_SHA;
    else process.env.ST_SOURCE_SHA = originalSha;
  });
  process.env.ST_SOURCE_SHA = "abcdef0123".repeat(4);
  const pattern = config.nsis.artifactName ?? config.win.artifactName ?? config.artifactName;
  for (const version of ["1.0.0", "1.0.1"]) {
    const name = expandMacro(pattern, "x64", { version }, { ext: "exe" });
    assert.equal(name, `WorkRail-${version}-win-x64-abcdef0123abcdef0123abcdef0123abcdef0123.exe`);
  }
});
test("rejects a missing native binding before offering a successful packaged smoke", async (t) => {
  await assert.rejects(
    () => fixture(t, { addon: false }).then(inspectPackage),
    /native.*missing/i,
  );
});
test("rejects an addon compiled for the wrong architecture", async (t) => {
  await assert.rejects(
    () => fixture(t, { machine: 0xaa64 }).then(inspectPackage),
    /x64|architecture/i,
  );
});
test("rejects a test entry bundled with the production app", async (t) => {
  await assert.rejects(
    () => fixture(t, { testEntry: true }).then(inspectPackage),
    /test.*entry|test.*file/i,
  );
});
test("rejects a package without its actual preload", async (t) => {
  await assert.rejects(
    () => fixture(t, { preload: false }).then(inspectPackage),
    /preload/i,
  );
});

test("normalizes ASAR members returned with native Windows separators", () => {
  assert.equal(
    normalizeArchivePath("\\out\\main\\index.cjs"),
    "out/main/index.cjs",
  );
  assert.equal(
    normalizeArchivePath("/out/preload/index.cjs"),
    "out/preload/index.cjs",
  );
});

test("accepts a loader-compatible Release build when no prebuild is present", async (t) => {
  const result = await inspectPackage(await fixture(t, { layout: "release" }));
  assert.equal(result.arch, "x64");
  assert.match(result.nativeBinding, /better_sqlite3\.node$/);
});
test("rejects a selected native binding that is still packed inside ASAR", async (t) => {
  await assert.rejects(
    () => fixture(t, { unpack: false }).then(inspectPackage),
    /native/i,
  );
});

test("rejects one stale frame in the first executable icon group", async (t) => {
  await assert.rejects(() => fixture(t, {staleIcon: true}).then(inspectPackage), /icon frame/i);
});
