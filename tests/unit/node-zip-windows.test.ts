import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { createWindowsNodeAdapter } from '../../src/main/node-management/windows'
import { createNodeManagementService } from '../../src/main/node-management/service'
import { inspectNodeZipInstallation } from '../../src/main/node-management/zip-install'
import { capabilities, classicDigests } from '../../src/main/node-management/manager-support'

const version = '24.22.1'
const npmVersion = '11.19.1'
const release = { version, date: '2026-10-20', npm: npmVersion, security: false, lts: 'Krypton' }
const directory = process.env.WORKRAIL_TEST_NVM_DIRECTORY
const hostedWindows = process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_OS === 'Windows' && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
const runner = hostedWindows && !!directory
it.skipIf(!runner)('installs the signed Windows ZIP and switches using official nvm 1.1.10, 1.1.11 and 1.2.2', async () => {
  for (const manager of ['1.1.10', '1.1.11', '1.2.2'] as const) {
    const home = join(directory!, manager), link = join(directory!, 'node-' + manager)
    const root = manager === '1.2.2' ? join(directory!, 'Node 저장소') : home
    await mkdir(root, { recursive: true })
    const exe = join(home, 'nvm.exe')
    expect(createHash('sha256').update(await readFile(exe)).digest('hex')).toBe(classicDigests[manager])
    await writeFile(join(home, 'settings.txt'), ['root: ' + root, 'path: ' + link, 'arch: 64', 'proxy: none', ''].join('\r\n'))
    const env = { ...process.env, NVM_HOME: home, NVM_SYMLINK: link }
    const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: home, env, encoding: 'utf8', timeout: 30_000 }).trim()
    // Select the disposable manager directly without changing the runner's registered nvm.
    const windows = createWindowsNodeAdapter(fetch, async () => fetch)
    windows.discover = async () => ({
      manager: { status: 'ready', version: manager, path: exe },
      installation: {
        family: 'classic', version: manager, home, root, symlink: link, exe,
        executableDigest: createHash('sha256').update(await readFile(exe)).digest('hex'),
        settingsDigest: createHash('sha256').update(await readFile(join(home, 'settings.txt'))).digest('hex'),
      },
      installedVersions: await inspectNodeZipInstallation(root, version) === 'complete' ? [version] : [],
      activeVersion: null, activeSource: null, conflicts: [], capabilities: capabilities(null),
    })
    const service = createNodeManagementService({
      platform: 'win32', arch: 'x64', changed: () => {},
      loadCatalog: async () => [release],
      windows: {
        discover: windows.discover, changeVersion: windows.changeVersion.bind(windows),
        recognizesVersion: windows.recognizesVersion, installManager: windows.installManager,
      },
    })
    expect(await service.install(version)).toMatchObject({ installedVersions: [version], activeVersion: null, error: null })
    await expect(lstat(link)).rejects.toMatchObject({ code: 'ENOENT' })
    run(exe, ['use', version, '64'])
    expect((await realpath(link)).toLowerCase()).toBe((await realpath(join(root, 'v' + version))).toLowerCase())
    const node = join(link, 'node.exe')
    expect(run(node, ['-v'])).toBe('v' + version)
    expect(run(node, [join(link, 'node_modules/npm/bin/npm-cli.js'), '-v'])).toBe(npmVersion)
  }
}, 360_000)

const modernMode = process.env.WORKRAIL_TEST_NVM_MODERN_MODE
const modernRunner = hostedWindows && (modernMode === 'shim' || modernMode === 'link')

it.skipIf(!modernRunner)('installs the first ZIP on official nvm 2.0.1 and activates it on request', async () => {
  const windows = createWindowsNodeAdapter(fetch, async () => fetch)
  const initial = await windows.discover()
  expect(initial).toMatchObject({
    manager: { status: 'ready', version: '2.0.1' },
    installation: { family: 'modern', mode: modernMode },
    installedVersions: [], activeVersion: null, conflicts: [],
    capabilities: { install: { available: true }, use: { available: true } },
  })
  const manager = initial.installation!
  const readTarget = (path: string) => readlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const linkTargets = () => Promise.all([manager.symlink, join(dirname(manager.root), '.link', 'nodejs')].map(readTarget))
  const shell = join(process.env.SystemRoot!, 'System32', 'cmd.exe')
  const env = { ...process.env }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'Path'
  env[pathKey] = [manager.symlink, manager.home, dirname(shell)].join(';')
  const run = (exe: string, args: string[]) => execFileSync(exe, args, {
    cwd: process.env.TEMP, env,
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
  }).trim()
  const userPath = () => execFileSync(join(dirname(shell), 'reg.exe'), ['query', 'HKCU\\Environment', '/v', 'Path'], { encoding: 'utf8' })
  const originalPath = userPath()
  const originalTargets = await linkTargets()
  const phases = new Set<string>()
  const service = createNodeManagementService({
    platform: 'win32', arch: 'x64', windows,
    changed: state => { if (state.busy) phases.add(state.busy.phase) },
    loadCatalog: async () => [release],
  })
  expect(await service.install(version)).toMatchObject({ installedVersions: [version], activeVersion: null, error: null })
  for (const phase of ['downloading', 'authenticating', 'extracting', 'verifying']) expect(phases.has(phase)).toBe(true)
  expect(await linkTargets()).toEqual(originalTargets)
  expect(userPath()).toBe(originalPath)
  expect(await service.getState('recheck')).toMatchObject({ activeVersion: null, installedVersions: [version], error: null })
  expect(run(manager.exe, ['list', 'installed'])).toContain(version)
  expect(await service.use(version)).toMatchObject({ activeVersion: version, activeSource: 'nvm', error: null })
  expect(run(join(manager.symlink, 'node.exe'), ['-v'])).toBe('v' + version)
  expect(run(shell, ['/d', '/c', 'npm -v'])).toBe(npmVersion)
}, 360_000)
