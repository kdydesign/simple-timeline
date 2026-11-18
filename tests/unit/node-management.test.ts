import { describe, expect, it } from 'vitest'
import { parseNodeCatalog } from '../../src/main/node-management/catalog'
import { discoverWindowsNode, type WindowsDiscovery } from '../../src/main/node-management/discovery'
import { createNodeManagementService, type WindowsNodeAdapter } from '../../src/main/node-management/service'
import { buildNvmInvocation, createElevationCommand, mergeWindowsEnvironment, readElevatedExit } from '../../src/main/node-management/windows'
import { createMutationBarrier } from '../../src/main/updates/installer'
import type { NodeManagementState } from '../../src/shared/node-management'

const releases = [
  { version: 'v22.9.0', date: '2024-09-17', files: ['win-x64-zip'], npm: '10.8.3', lts: false, security: false },
  { version: 'v24.11.0', date: '2025-10-28', files: ['win-x64-zip', 'win-x64-msi'], npm: '11.6.1', lts: 'Krypton', security: true },
  { version: 'v25.0.0-nightly20250101', date: '2025-01-01', files: ['win-x64-zip'], npm: '11.0.0', lts: false, security: false },
  { version: 'v25.0.1', date: '2025-10-30', files: ['win-arm64-zip'], npm: '11.6.1', lts: false, security: false },
  { version: 'v24.11.0 & whoami', date: '2025-10-30', files: ['win-x64-zip'], npm: '11.6.1', lts: false, security: false },
  { version: 'v24.10.0', date: '2025-02-31', files: ['win-x64-zip'], npm: '11.6.1', lts: false, security: false },
]
const home = 'C:\\Users\\Kim\\AppData\\Local\\nvm'
const symlink = 'C:\\nvm4w\\nodejs'
const exe = home + '\\nvm.exe'
const ready: WindowsDiscovery = {
  manager: { status: 'ready', version: '1.2.2' },
  activeVersion: '22.9.0',
  activeSource: 'nvm',
  installedVersions: ['22.9.0'],
  conflicts: [],
  installation: { exe, home, root: home, symlink },
}
const standalone = 'C:\\Program Files\\nodejs'
const files = new Map([
  [exe.toLowerCase(), 'file'],
  [(home + '\\settings.txt').toLowerCase(), 'file'],
  [(home + '\\v22.9.0').toLowerCase(), 'directory'],
  [(home + '\\v22.9.0\\node.exe').toLowerCase(), 'file'],
  [(symlink + '\\node.exe').toLowerCase(), 'file'],
  [symlink.toLowerCase(), 'symlink'],
])
function local(overrides: { settings?: string; path?: string[]; changes?: [string, string][]; env?: Record<string,string>; linkedVersion?: string } = {}) {
  const entries = new Map([...files, ...(overrides.changes ?? []).map(([path, kind]) => [path.toLowerCase(), kind] as const)])
  return discoverWindowsNode({
    readEnvironment: async () => overrides.env ?? { Path: [home, ...(overrides.path ?? []), symlink].join(';'), NVM_HOME: home, NVM_SYMLINK: symlink },
    pathKind: async path => entries.get(path.toLowerCase()) as 'file' | 'directory' | 'symlink' ?? 'missing',
    resolvePath: async path => path.toLowerCase() === symlink.toLowerCase() ? home + '\\v22.9.0' : path,
    listDirectories: async () => ['v22.9.0', 'v24.11.0', 'external'],
    readSettings: async () => overrides.settings ?? 'root: ' + home + '\r\npath: ' + symlink + '\r\narch: 64\r\nproxy: none\r\n',
    getManagerVersion: async () => '1.2.2',
    getNodeVersion: async path => path.toLowerCase() === (symlink + '\\node.exe').toLowerCase() ? overrides.linkedVersion ?? '22.9.0' : '20.12.2',
    isX64Node: async () => true,
  })
}
function adapter(overrides: Partial<WindowsNodeAdapter> = {}): WindowsNodeAdapter {
  return {
    discover: async () => ready,
    changeVersion: async () => { throw Error('unexpected elevation') },
    installManager: async () => { throw Error('unexpected installer') },
    ...overrides,
  }
}
function makeService(windows: WindowsNodeAdapter, extras: Partial<Parameters<typeof createNodeManagementService>[0]> = {}) {
  const changes: NodeManagementState[] = []
  const service = createNodeManagementService({
    platform: 'win32', arch: 'x64', windows,
    loadCatalog: async () => parseNodeCatalog(releases),
    changed: state => changes.push(state),
    ...extras,
  })
  return { service, changes }
}

describe('official Windows x64 Node releases', () => {
  it('only offers exact stable versions with Windows x64 ZIPs and valid dates', () => {
    expect(parseNodeCatalog(releases)).toEqual([
      { version: '24.11.0', date: '2025-10-28', npm: '11.6.1', lts: 'Krypton', security: true },
      { version: '22.9.0', date: '2024-09-17', npm: '10.8.3', lts: null, security: false },
    ])
  })

  it('rejects an unusable catalog', () => {
    expect(() => parseNodeCatalog([releases[2], releases[3]])).toThrow()
  })
})

describe('Windows Node discovery', () => {
  it('resolves nvm installation, complete local versions, and the effective version from the link', async () => {
    expect(await local()).toEqual(ready)
  })

  it('finds a PATH installation with a safe settings-defined link when nvm variables are absent', async () => {
    expect(await local({ env: { Path: home + ';' + symlink } })).toEqual(ready)
  })

  it('reports the executable version if the contents of a version directory disagree with its name', async () => {
    expect(await local({ linkedVersion: '20.12.2' })).toMatchObject({
      activeSource: 'nvm', activeVersion: '20.12.2',
      conflicts: [expect.objectContaining({ code: 'manager-configuration', path: symlink + '\\node.exe' })],
    })
  })

  it('reports the existing standalone Node ahead of the nvm link', async () => {
    const state = await local({ path: [standalone], changes: [[standalone + '\\node.exe', 'file']] })
    expect(state).toMatchObject({
      activeVersion: '20.12.2', activeSource: 'standalone',
      conflicts: [{ code: 'path-priority', path: standalone + '\\node.exe' }],
    })
  })

  it('detects when a physical Node directory occupies the configured link', async () => {
    const state = await local({ changes: [[symlink, 'directory']] })
    expect(state.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'link-occupied', path: symlink })]))
  })

  it('treats custom mirrors as unsafe for elevated downloads', async () => {
    const state = await local({ settings: 'root: ' + home + '\npath: ' + symlink + '\nnode_mirror: https://nodejs.org.evil.test/dist/' })
    expect(state.conflicts).toEqual([expect.objectContaining({ code: 'mirror', path: null })])
  })

  it('does not prepare an elevated command for an unsafe shell path or a replaced settings file', async () => {
    const unsafe = 'C:\\nvm\\%TEMP%'
    const state = await local({ env: { Path: home + ';' + unsafe, NVM_HOME: home, NVM_SYMLINK: unsafe }, settings: 'root: ' + home + '\npath: ' + unsafe })
    expect(state.installation).toBeNull()
    expect(state.conflicts[0]?.code).toBe('manager-configuration')
    expect((await local({ changes: [[home + '\\settings.txt', 'symlink']] })).installation).toBeNull()
  })

  it('reports Node on the root of a Windows drive as the first PATH result', async () => {
    const state = await local({ path: ['C:\\'], changes: [['C:\\node.exe', 'file']] })
    expect(state.conflicts).toEqual([expect.objectContaining({ code: 'path-priority', path: 'C:\\node.exe' })])
  })

  it('uses the refreshed machine and user environment after a new installation', () => {
    expect(mergeWindowsEnvironment(
      { PATH: 'C:\\Windows\\System32' }, { path: '%NVM_HOME%;%NVM_SYMLINK%', nvm_home: '%LOCALAPPDATA%\\nvm', NVM_SYMLINK: symlink },
      { Path: 'C:\\legacy', LOCALAPPDATA: 'C:\\Users\\Kim\\AppData\\Local', NVM_HOME: 'C:\\old-nvm' },
    )).toEqual({ Path: ['C:\\Windows\\System32', home, symlink].join(';'), NVM_HOME: home, NVM_SYMLINK: symlink })
  })
})

describe('elevated Windows commands', () => {
  it('builds only precise x64 nvm actions and refuses injection', () => {
    expect(buildNvmInvocation(ready.installation!, 'use', '22.9.0')).toEqual({
      executable: exe,
      args: ['use', '22.9.0', '64'],
      nvmHome: home,
      nvmSymlink: symlink,
    })
    expect(() => buildNvmInvocation(ready.installation!, 'install', '24.11.0\nRemove-Item C:\\')).toThrow()
    expect(() => buildNvmInvocation(ready.installation!, 'uninstall' as 'install', '24.11.0')).toThrow()
  })

  it('keeps trusted commands encoded and distinguishes unknown completion from a cancelled UAC prompt', () => {
    const args = createElevationCommand('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', buildNvmInvocation(ready.installation!, 'install', '24.11.0'))
    expect(args.slice(0, -1)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(Buffer.from(args.at(-1)!, 'base64').toString('utf16le')).toContain('-Verb RunAs')
    expect(readElevatedExit('WORKRAIL_ELEVATION_CANCELLED', 0)).toEqual({ status: 'cancelled' })
    expect(readElevatedExit('WORKRAIL_EXIT:5', 0)).toEqual({ status: 'failed' })
    expect(readElevatedExit('WORKRAIL_EXIT:0', 0)).toEqual({ status: 'success' })
    expect(readElevatedExit('WORKRAIL_STARTED', 1)).toEqual({ status: 'unknown' })
  })
})

describe('Node operations', () => {
  it('retains local installs and the cached list when the index goes offline', async () => {
    let online = true
    const { service } = makeService(adapter(), {
      loadCatalog: async () => { if (!online) throw Error('offline'); return parseNodeCatalog(releases) },
    })
    expect((await service.refreshCatalog()).catalog.status).toBe('ready')
    online = false
    const state = await service.refreshCatalog()
    expect(state.installedVersions).toEqual(['22.9.0'])
    expect(state.catalog).toMatchObject({ status: 'error', releases: [expect.objectContaining({ version: '24.11.0' }), expect.objectContaining({ version: '22.9.0' })] })
  })

  it('never elevates an install absent from the official list or with a custom download source', async () => {
    const { service } = makeService(adapter())
    await service.refreshCatalog()
    expect((await service.install('27.9.0')).error?.code).toBe('version-unavailable')
    const { service: custom } = makeService(adapter({ discover: async () => ({
      ...ready, conflicts: [{ code: 'mirror', path: null, message: 'custom mirror' }],
    }) }))
    await custom.refreshCatalog()
    expect((await custom.install('24.11.0')).error?.code).toBe('environment-conflict')
    expect((await custom.use('22.9.0')).error?.code).toBe('environment-conflict')
  })

  it('keeps the operation active across menu and quit checks until the result is verified', async () => {
    let resolve!: (result: { status: 'success' }) => void
    const elevated = new Promise<{ status: 'success' }>(done => { resolve = done })
    let started!: () => void
    const launched = new Promise<void>(done => { started = done })
    let changed = false
    const barrier = createMutationBarrier()
    const { service, changes } = makeService(adapter({
      discover: async () => changed ? { ...ready, installedVersions: ['24.11.0', '22.9.0'] } : ready,
      changeVersion: async () => { started(); return elevated },
    }), { barrier })
    await service.refreshCatalog()
    const work = service.install('24.11.0')
    await launched
    expect(service.isBusy()).toBe(true)
    expect((await service.use('22.9.0')).error?.code).toBe('busy')
    const frozen = barrier.freeze()
    let drained = false
    void frozen.then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    changed = true
    resolve({ status: 'success' })
    expect(await work).toMatchObject({ busy: null, error: null, installedVersions: ['24.11.0', '22.9.0'] })
    await frozen
    expect((await service.installManager()).error?.code).toBe('shutdown')
    expect(changes.some(state => state.busy?.phase === 'verifying')).toBe(true)
  })

  it.each([
    ['cancelled', 'cancelled'],
    ['failed', 'operation-failed'],
    ['unknown', 'operation-unknown'],
    ['success', 'verification-failed'],
  ] as const)('reports %s when the requested version is still missing', async (status, code) => {
    const { service } = makeService(adapter({ changeVersion: async () => ({ status }) }))
    await service.refreshCatalog()
    expect(await service.install('24.11.0')).toMatchObject({ error: { code }, busy: null, installedVersions: ['22.9.0'] })
  })

  it('warns when an elevation runs long and keeps the shutdown barrier active until the process settles', async () => {
    let resolve!: (result: { status: 'cancelled' }) => void
    const elevated = new Promise<{ status: 'cancelled' }>(done => { resolve = done })
    let reportSlow!: () => void
    const slow = new Promise<void>(done => { reportSlow = done })
    const { service } = makeService(adapter({ changeVersion: async () => elevated }), {
      slowAfterMs: 1,
      changed: state => { if (state.error?.code === 'operation-slow') reportSlow() },
    })
    await service.refreshCatalog()
    const work = service.install('24.11.0')
    await slow
    expect(service.isBusy()).toBe(true)
    expect(await service.getState()).toMatchObject({ busy: { kind: 'install' }, error: { code: 'operation-slow' } })
    resolve({ status: 'cancelled' })
    expect(await work).toMatchObject({ busy: null, error: { code: 'cancelled' } })
  })

  it('uses a locally installed version offline and verifies the effective version after elevation', async () => {
    let activeVersion = '24.11.0'
    const { service } = makeService(adapter({
      discover: async () => ({ ...ready, activeVersion, installedVersions: ['24.11.0', '22.9.0'] }),
      changeVersion: async (_installation, command, version) => {
        if (command === 'use') activeVersion = version
        return { status: 'success' }
      },
    }), { loadCatalog: async () => { throw Error('offline') } })
    await service.refreshCatalog()
    expect(await service.use('22.9.0')).toMatchObject({ error: null, activeVersion: '22.9.0' })
  })

  it('runs the manager installer only when requested and rechecks the newly installed environment', async () => {
    let installed = false
    const { service } = makeService(adapter({
      discover: async () => installed ? ready : { ...ready, manager: { status: 'missing', version: null }, installation: null, installedVersions: [], activeVersion: null, activeSource: null },
      installManager: async phase => {
        phase('waiting')
        installed = true
        return { status: 'success' }
      },
    }))
    expect((await service.getState()).manager.status).toBe('missing')
    expect(await service.installManager()).toMatchObject({ error: null, manager: { status: 'ready', version: '1.2.2' } })
  })

  it('never reads Windows or the network on an unsupported platform', async () => {
    const { service } = makeService(adapter({ discover: async () => { throw Error('unexpected probe') } }), { platform: 'linux' })
    expect(await service.refreshCatalog()).toMatchObject({ supported: false, catalog: { status: 'idle' }, checkedAt: null })
    expect((await service.installManager()).error?.code).toBe('unsupported')
  })
})
