import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createWindowsNodeAdapter } from '../../src/main/node-management/windows'
import { createNodeManagementService } from '../../src/main/node-management/service'
import { inspectNodeZipInstallation } from '../../src/main/node-management/zip-install'
import { capabilities } from '../../src/main/node-management/manager-support'
import { classicDigests } from '../../src/main/node-management/manager-support'

const directory = process.env.WORKRAIL_TEST_NVM_DIRECTORY
const runner = process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' && !!directory
it.skipIf(!runner)('installs the signed Windows ZIP and switches using official nvm 1.1.10 and 1.1.11', async () => {
  const version = '24.22.1'
  for (const manager of ['1.1.10', '1.1.11'] as const) {
    const root = join(directory!, manager), link = join(directory!, 'node-' + manager)
    const exe = join(root, 'nvm.exe')
    expect(createHash('sha256').update(await readFile(exe)).digest('hex')).toBe(classicDigests[manager])
    await writeFile(join(root, 'settings.txt'), ['root: ' + root, 'path: ' + link, 'arch: 64', 'proxy: none', ''].join('\r\n'))
    const env = { ...process.env, NVM_HOME: root, NVM_SYMLINK: link }
    const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout: 30_000 }).trim()
    // Select the disposable manager directly without changing the runner's registered nvm.
    const windows = createWindowsNodeAdapter(fetch, async () => fetch)
    windows.discover = async () => ({
      manager: { status: 'ready', version: manager, path: exe },
      installation: {
        family: 'classic', version: manager, home: root, root, symlink: link, exe,
        executableDigest: createHash('sha256').update(await readFile(exe)).digest('hex'),
        settingsDigest: createHash('sha256').update(await readFile(join(root, 'settings.txt'))).digest('hex'),
      },
      installedVersions: await inspectNodeZipInstallation(root, version) === 'complete' ? [version] : [],
      activeVersion: null, activeSource: null, conflicts: [], capabilities: capabilities(null),
    })
    const service = createNodeManagementService({
      platform: 'win32', arch: 'x64', changed: () => {},
      loadCatalog: async () => [{ version, date: '2026-11-18', npm: '11.19.1', security: false, lts: 'Krypton' }],
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
    expect(run(node, [join(link, 'node_modules/npm/bin/npm-cli.js'), '-v'])).toBe('11.19.1')
  }
}, 240_000)
