import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface MaintenancePreparation {
  runtimeDirectory: string
  buildDirectory: string
  maintenanceRoot: string
  version: string
}
export interface PreparedMaintenance {
  directory: string
  executable: string
  appDirectory: string
  artifactId: string
}
type FileEntry = { path: string; sha256: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const inside = (root: string, file: string) => {
  const rel = relative(resolve(root), resolve(file))
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel)
}
async function digest(path: string) {
  const item = await lstat(path)
  if (!item.isFile() || item.isSymbolicLink()) throw Error('Maintenance integrity: expected a regular file')
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
async function files(root: string, prefix = ''): Promise<string[]> {
  if ((await lstat(root)).isSymbolicLink()) throw Error('Maintenance source symbolic link is unsupported')
  const result: string[] = []
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('Maintenance source symbolic link is unsupported')
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.isDirectory()) result.push(...await files(join(root, item.name), path))
    else if (item.isFile()) result.push(path)
    else throw Error('Unsupported maintenance source file')
  }
  return result.sort()
}

/** No system Node, package manager, shell or development environment is inherited. */
export function cleanMaintenanceEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'USERNAME', 'USERDOMAIN', 'SESSIONNAME'])
  return Object.fromEntries(Object.entries(env).filter(([name, value]) => allowed.has(name.toUpperCase()) && typeof value === 'string'))
}

/** Walk the emitted CommonJS graph, refusing any dependency on project node_modules. */
async function maintenanceGraph(build: string): Promise<string[]> {
  const visited = new Set<string>()
  const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`), 'electron'])
  async function visit(path: string) {
    if (!inside(build, path)) throw Error('Maintenance dependency escapes build directory')
    const name = relative(build, path).replaceAll('\\', '/')
    if (visited.has(name)) return
    visited.add(name)
    if ((await lstat(path)).isSymbolicLink()) throw Error('Maintenance dependency symbolic link is unsupported')
    const code = await readFile(path, 'utf8')
    for (const match of code.matchAll(/(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.')) await visit(resolve(dirname(path), specifier))
      else if (!builtins.has(specifier)) throw Error(`Unsupported maintenance dependency: ${specifier}`)
    }
  }
  await visit(join(build, 'main', 'node-maintenance.cjs'))
  await visit(join(build, 'preload', 'node-maintenance.cjs'))
  for (const name of ['index.html', 'app.js', 'style.css']) visited.add(`main/maintenance-ui/${name}`)
  return [...visited].sort()
}

export async function verifyMaintenance(directory: string): Promise<string> {
  if ((await lstat(directory)).isSymbolicLink()) throw Error('Maintenance integrity: linked directory')
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { artifactId: string; files: FileEntry[] }
  if (!Array.isArray(manifest.files) || hash(JSON.stringify(manifest.files)) !== manifest.artifactId) throw Error('Maintenance manifest integrity mismatch')
  const actualFiles = await files(directory)
  const expectedFiles = [...manifest.files.map(file => file.path), 'manifest.json'].sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw Error('Maintenance artifact integrity: unexpected or missing files')
  for (const file of manifest.files) {
    const path = resolve(directory, file.path)
    if (!inside(directory, path) || await digest(path) !== file.sha256) throw Error('Maintenance artifact integrity mismatch')
  }
  return manifest.artifactId
}

export async function prepareMaintenance(options: MaintenancePreparation): Promise<PreparedMaintenance> {
  const { runtimeDirectory, buildDirectory, maintenanceRoot, version } = options
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw Error('Invalid maintenance version')
  if (inside(runtimeDirectory, maintenanceRoot) || inside(buildDirectory, maintenanceRoot) || /(?:^|[\\/])node_modules(?:[\\/]|$)/i.test(maintenanceRoot)) throw Error('Maintenance directory must be independent of development files')
  const sources = [
    ...(await files(runtimeDirectory)).map(name => ({ path: `runtime/${name}`, source: join(runtimeDirectory, name) })),
    ...(await maintenanceGraph(buildDirectory)).map(name => ({ path: `app/${name}`, source: join(buildDirectory, name) })),
  ].sort((a, b) => a.path.localeCompare(b.path, 'en'))
  if (!sources.some(file => file.path === 'runtime/electron.exe')) throw Error('Standalone Windows Electron runtime is required')
  const packageJson = JSON.stringify({ name: 'workrail-node-maintenance', version, main: 'main/node-maintenance.cjs' })
  const entries: FileEntry[] = []
  for (const source of sources) entries.push({ path: source.path, sha256: await digest(source.source) })
  entries.push({ path: 'app/package.json', sha256: hash(packageJson) })
  const artifactId = hash(JSON.stringify(entries))
  await mkdir(maintenanceRoot, { recursive: true, mode: 0o700 })
  const directory = join(maintenanceRoot, `${version}-${artifactId}`)
  const prepared = { directory, executable: join(directory, 'runtime', 'electron.exe'), appDirectory: join(directory, 'app'), artifactId }
  const existing = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error })
  if (existing) {
    if (await verifyMaintenance(directory) !== artifactId) throw Error('Maintenance artifact integrity mismatch')
    return prepared
  }
  const staging = await mkdtemp(join(maintenanceRoot, '.preparing-'))
  try {
    for (const source of sources) {
      const target = join(staging, source.path)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(source.source, target)
    }
    await writeFile(join(staging, 'app', 'package.json'), packageJson, { flag: 'wx' })
    await writeFile(join(staging, 'manifest.json'), JSON.stringify({ artifactId, files: entries }), { flag: 'wx' })
    await verifyMaintenance(staging)
    try { await rename(staging, directory) } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error
      if (await verifyMaintenance(directory) !== artifactId) throw Error('Maintenance artifact integrity mismatch')
    }
    return prepared
  } finally { await rm(staging, { recursive: true, force: true }) }
}

export function validateReadyMessage(message: unknown, expected: { pid: number; session: string; artifactId: string }): message is { recoveryShortcut: string } {
  if (!message || typeof message !== 'object') return false
  const value = message as Record<string, unknown>
  return value.type === 'ready' && value.pid === expected.pid && value.session === expected.session && value.artifactId === expected.artifactId
    && value.rendererReady === true && value.shortcutReady === true && typeof value.recoveryShortcut === 'string' && value.recoveryShortcut.length > 0
}

export function validateMaintenanceStateMessage(message: unknown, expected: { pid: number; session: string; artifactId: string }): message is { busy: boolean } {
  if (!message || typeof message !== 'object') return false
  const value = message as Record<string, unknown>
  return value.type === 'state' && value.pid === expected.pid && value.session === expected.session && value.artifactId === expected.artifactId && typeof value.busy === 'boolean'
}
