import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  asar = require("@electron/asar");
async function requireX64(path, label) {
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    throw Error(`${label} missing: ${path}`);
  }
  if (bytes.length < 70 || bytes.toString("ascii", 0, 2) !== "MZ")
    throw Error(`${label} is not a Windows x64 PE binary`);
  const header = bytes.readUInt32LE(60);
  if (
    header + 6 > bytes.length ||
    bytes.toString("ascii", header, header + 4) !== "PE\0\0" ||
    bytes.readUInt16LE(header + 4) !== 0x8664
  )
    throw Error(`${label} architecture must be x64`);
}
export const normalizeArchivePath = (value) =>
  value.replaceAll("\\", "/").replace(/^\/+/, "");
export async function inspectPackage(directory, { sourceSha, version } = {}) {
  const root = resolve(directory),
    archive = join(root, "resources/app.asar"),
    exe = join(root, "Simple Timeline.exe"),
    native = join(
      root,
      "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    );
  await stat(archive);
  await requireX64(exe, "Executable");
  await requireX64(native, "Native binding");
  const files = asar.listPackage(archive).map(normalizeArchivePath),
    has = new Set(files),
    pkg = JSON.parse(asar.extractFile(archive, "package.json").toString());
  if (pkg.main !== "out/main/index.cjs" || !has.has(pkg.main))
    throw Error("Production main entry missing");
  if (!has.has("out/preload/index.cjs"))
    throw Error("Production preload missing");
  if (!has.has("out/renderer/index.html"))
    throw Error("Production renderer missing");
  if (
    files.some(
      (p) =>
        /^(tests|artifacts|src)\//.test(p) || /\.(sqlite3?|db)(-|$)/i.test(p),
    )
  )
    throw Error("Test entry/file or database bundled in production");
  const main = asar.extractFile(archive, join(...pkg.main.split("/"))).toString();
  if (
    /SIMPLE_TIMELINE_TEST_|Test profile required|artifacts\/test-app/.test(main)
  )
    throw Error("Test entry or profile override bundled in production");
  if (sourceSha && pkg.sourceSha !== sourceSha)
    throw Error("Packaged source SHA mismatch");
  if (version && pkg.version !== version)
    throw Error("Packaged application version mismatch");
  return {
    arch: "x64",
    version: pkg.version,
    sourceSha: pkg.sourceSha ?? null,
    main: pkg.main,
    executable: exe,
    nativeBinding: native,
    archive,
    files: files.length,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await inspectPackage(
      process.argv[2] ?? "release/win-unpacked",
    );
    await mkdir("artifacts/packaged", { recursive: true });
    await writeFile(
      "artifacts/packaged/package-inspection.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
