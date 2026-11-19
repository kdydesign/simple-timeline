import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, realpath, rm, symlink as createSymlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchBoundedAsset, parseNodeCatalog } from '../../src/main/node-management/catalog'
import { discoverWindowsNode, type WindowsDiscovery } from '../../src/main/node-management/discovery'
import { createNodeManagementService, type WindowsNodeAdapter } from '../../src/main/node-management/service'
import { buildNvmInvocation, createWindowsNodeAdapter, createElevationCommand, mergeWindowsEnvironment, readElevatedExit } from '../../src/main/node-management/windows'
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
const officialDigest = '665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13'
const settings = 'root: ' + home + '\r\npath: ' + symlink + '\r\narch: 64\r\nproxy: none\r\n'
const settingsDigest = createHash('sha256').update(settings).digest('hex')
const ready: WindowsDiscovery = {
  manager: { status: 'ready', version: '1.2.2' },
  activeVersion: '22.9.0',
  activeSource: 'nvm',
  installedVersions: ['22.9.0'],
  conflicts: [],
  installation: { family: 'classic', version: '1.2.2', executableDigest: officialDigest, exe, home, root: home, symlink, settingsDigest },
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
function local(overrides: { settings?: string; path?: string[]; changes?: [string, string][]; env?: Record<string,string>; linkedVersion?: string; diskVersion?: string; digest?: string; helperDigests?: Record<string, string>; onExecute?: () => void } = {}) {
  const entries = new Map([...files, ...(overrides.changes ?? []).map(([path, kind]) => [path.toLowerCase(), kind] as const)])
  const probe = {
    readEnvironment: async () => overrides.env ?? { Path: [home, ...(overrides.path ?? []), symlink].join(';'), NVM_HOME: home, NVM_SYMLINK: symlink },
    pathKind: async path => entries.get(path.toLowerCase()) as 'file' | 'directory' | 'symlink' ?? 'missing',
    resolvePath: async path => path.toLowerCase() === symlink.toLowerCase() ? home + '\\v22.9.0' : path,
    listDirectories: async () => ['v22.9.0', 'v24.11.0', 'external'],
    readSettings: async () => Buffer.from(overrides.settings ?? settings),
    getManagerDigest: async (path: string) => overrides.helperDigests?.[path] ?? overrides.digest ?? officialDigest,
    getManagerVersion: async () => { overrides.onExecute?.(); return '1.2.2' },
    getNodeVersion: async (path: string) => path.toLowerCase().startsWith(home.toLowerCase())
      ? overrides.diskVersion ?? '22.9.0'
      : path.toLowerCase() === (symlink + '\\node.exe').toLowerCase() ? overrides.linkedVersion ?? '22.9.0' : '20.12.2',
    isX64Node: async () => true,
  } satisfies Parameters<typeof discoverWindowsNode>[0] & {getManagerVersion(): Promise<string>}
  return discoverWindowsNode(probe)
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
  it('recognizes a foreign nvm executable without starting it to learn its version', async () => {
    let executions = 0
    const state = await local({ digest: '0'.repeat(64), onExecute: () => { executions++ } })
    expect({ executions, installation: state.installation, status: state.manager.status }).toEqual({ executions: 0, installation: null, status: 'error' })
    expect(state.capabilities?.use.available).toBe(false)
    expect(state.activeSource).toBeNull()
  })

  it('recognizes 1.1.11 and refuses use when its link helpers are missing', async () => {
    const digest = 'a49764cb5cae51d0a31f7bbeda22bc6eab4b2952f2638d543bb38877a6670791'
    const state = await local({ digest })
    expect(state).toMatchObject({
      manager: { status: 'ready', kind: 'nvm-windows', version: '1.1.11', path: exe },
      installation: { family: 'classic', executableDigest: digest },
      capabilities: { list: { available: true }, install: { available: true }, use: { available: false } },
    })
    expect(buildNvmInvocation(state.installation!, 'install', '22.9.0').executableDigest).toBe(digest)
  })

  it('enables 1.1.11 switching only with both original elevation helpers', async () => {
    const cmd = home + '\\elevate.cmd'
    const vbs = home + '\\elevate.vbs'
    const digest = 'a49764cb5cae51d0a31f7bbeda22bc6eab4b2952f2638d543bb38877a6670791'
    const helperDigests = {
      [cmd]: '792d6a485d26b3ae1c926d1d4915e5eaf9a40113afd623212d1a9591e56bb1d5',
      [vbs]: '3219b67d6c49d02b832026d13ece959c85d64690326d6b3f10923790c8a5f130',
    }
    const original = await local({ digest, changes: [[cmd, 'file'], [vbs, 'file']], helperDigests })
    expect(original.capabilities?.use.available).toBe(true)
    const changed = await local({ digest, changes: [[cmd, 'file'], [vbs, 'file']], helperDigests: { ...helperDigests, [vbs]: '0'.repeat(64) } })
    expect(changed.capabilities?.use.available).toBe(false)
  })

  it('allows local use with a custom mirror but refuses downloads with a precise reason', async () => {
    const current = await local({ settings: settings + 'node_mirror: https://custom.example/dist/' })
    const { service } = makeService(adapter({ discover: async () => current }))
    expect((await service.install('24.11.0')).error?.message).toContain('미러')
    expect((await service.use('22.9.0')).error).toBeNull()
    expect((await service.getState()).removal?.status).toBe('unavailable')
  })

  it.each(['${MIRROR_FIELD}: https://evil.test/', 'root : C:\\mismatch'])('rejects an ambiguous raw settings line %s', async line => {
    const state = await local({ settings: 'root: ' + home + '\npath: ' + symlink + '\n' + line })
    expect(state).toMatchObject({ installation: null, conflicts: [expect.objectContaining({ code: 'manager-configuration' })] })
  })

  it('omits a directory whose Node executable reports a different version', async () => {
    expect((await local({ diskVersion: '23.1.0' })).installedVersions).toEqual([])
  })

  it.each(['\\\\server\\share', '.\\tools'])('does not report Node from a later link when an earlier PATH entry cannot be inspected: %s', async unsafe => {
    const state = await local({ path: [unsafe] })
    expect(state).toMatchObject({ activeVersion: null, activeSource: null, conflicts: [expect.objectContaining({ code: 'path-priority', path: unsafe })] })
  })

  it('treats an alternate Node executable in the link directory as a priority conflict', async () => {
    const state = await local({ changes: [[symlink + '\\node.com', 'file']] })
    expect(state.conflicts).toEqual([expect.objectContaining({ code: 'path-priority', path: symlink + '\\node.com' })])
  })
  it('resolves nvm installation, complete local versions, and the effective version from the link', async () => {
    expect(await local()).toMatchObject(ready)
  })

  it('finds a PATH installation with a safe settings-defined link when nvm variables are absent', async () => {
    expect(await local({ env: { Path: home + ';' + symlink } })).toMatchObject(ready)
  })

  it('reports the executable version if the contents of a version directory disagree with its name', async () => {
    expect(await local({ linkedVersion: '20.12.2' })).toMatchObject({
      activeSource: 'nvm', activeVersion: '20.12.2',
      conflicts: [expect.objectContaining({ code: 'manager-configuration', path: symlink + '\\node.exe' })],
    })
  })

  it.each(['nvm.exe', 'nvm.cmd'])('blocks changes when PATH resolves an earlier competing %s', async filename => {
    const other = 'C:\\other'
    const state = await local({ env: { Path: [other, home, symlink].join(';'), NVM_HOME: home, NVM_SYMLINK: symlink }, changes: [[other + '\\' + filename, 'file']] })
    expect(state.capabilities).toMatchObject({ list: { available: true }, install: { available: false }, use: { available: false } })
    expect(state.conflicts).toContainEqual(expect.objectContaining({ code: 'path-priority', path: other + '\\' + filename }))
    const duplicate = await local({ env: { Path: [home.toUpperCase(), home, symlink].join(';'), NVM_HOME: home, NVM_SYMLINK: symlink } })
    expect(duplicate.capabilities?.use.available).toBe(true)
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

  it('does not interpret a non-default proxy as the unset value', async () => {
    const state = await local({ settings: 'root: ' + home + '\npath: ' + symlink + '\nproxy: none/' })
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
      executableDigest: officialDigest,
      args: ['use', '22.9.0', '64'],
      nvmHome: home,
      nvmSymlink: symlink,
      settingsDigest,
    })
    expect(() => buildNvmInvocation(ready.installation!, 'install', '24.11.0\nRemove-Item C:\\')).toThrow()
    expect(() => buildNvmInvocation(ready.installation!, 'uninstall' as 'install', '24.11.0')).toThrow()
  })

  it('keeps a 1.1.11 helper-verified use within the Windows process argument limit', () => {
    const directory = 'C:\\Users\\' + 'a'.repeat(170) + '\\AppData\\Local\\nvm'
    const installation = { ...ready.installation!, family: 'classic' as const, version: '1.1.11' as const, home: directory, root: directory,
      exe: directory + '\\nvm.exe', executableDigest: 'a49764cb5cae51d0a31f7bbeda22bc6eab4b2952f2638d543bb38877a6670791' }
    const invocation = buildNvmInvocation(installation, 'use', '22.9.0')
    expect(invocation).toMatchObject({ legacyHelperRoot: directory })
    const args = createElevationCommand('C:\\Windows\\System32', invocation)
    expect(args.join(' ').length + 100).toBeLessThan(32767)
  })

  it('keeps trusted commands encoded and distinguishes unknown completion from a cancelled UAC prompt', () => {
    const args = createElevationCommand('C:\\Windows\\System32', buildNvmInvocation(ready.installation!, 'install', '24.11.0'))
    expect(args.slice(0, -1)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(Buffer.from(args.at(-1)!, 'base64').toString('utf16le')).toContain('-Verb RunAs')
    expect(readElevatedExit('WORKRAIL_ELEVATION_CANCELLED', 0)).toEqual({ status: 'cancelled' })
    expect(readElevatedExit('WORKRAIL_EXIT:5', 0)).toEqual({ status: 'failed' })
    expect(readElevatedExit('WORKRAIL_EXIT:0', 0)).toEqual({ status: 'success' })
    expect(readElevatedExit('WORKRAIL_STARTED', 1)).toEqual({ status: 'unknown' })
  })

  it('hands off the installer through a worker that verifies a read-locked file under elevation', () => {
    const invocation = { executable: 'C:\\Temp\\nvm-setup.exe', args: [] as [], executableDigest: 'a'.repeat(64) }
    const outer = Buffer.from(createElevationCommand('C:\\Windows\\System32', invocation).at(-1)!, 'base64').toString('utf16le')
    const encoded = outer.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)?.[1]
    expect(encoded).toBeTruthy()
    const worker = Buffer.from(encoded!, 'base64').toString('utf16le')
    expect(worker).toMatch(/FileShare\]::Read[\s\S]+ComputeHash[\s\S]+Start-Process[\s\S]+Dispose/)
    expect(worker).toContain(invocation.executableDigest)
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

  it('retains the last inventory from the same manager when the storage read fails', async () => {
    const current = await local()
    let readable = true
    const { service } = makeService(adapter({ discover: async () => readable ? current : {
      ...current, manager: { ...current.manager, status: 'error' },
      installedVersions: [], installation: null, capabilities: { ...current.capabilities!, list: { available: false, reason: '읽기 실패' } },
    } }))
    await service.getState()
    readable = false
    expect(await service.getState()).toMatchObject({ installedVersions: ['22.9.0'], capabilities: { list: { available: false } } })
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
    ['success', 'verification-failed'],
  ] as const)('reports %s when the requested version is still missing', async (status, code) => {
    const { service } = makeService(adapter({ changeVersion: async () => ({ status }) }))
    await service.refreshCatalog()
    expect(await service.install('24.11.0')).toMatchObject({ error: { code }, busy: null, installedVersions: ['22.9.0'] })
  })

  it('returns an unknown result while retaining the quit/update barrier even if the files later look changed', async () => {
    let changed = false
    const barrier = createMutationBarrier()
    const { service } = makeService(adapter({
      discover: async () => changed ? { ...ready, installedVersions: ['24.11.0', '22.9.0'] } : ready,
      changeVersion: async () => { changed = true; return { status: 'unknown' } },
    }), { barrier })
    await service.refreshCatalog()
    expect(await service.install('24.11.0')).toMatchObject({ busy: { kind: 'install' }, error: { code: 'operation-unknown' } })
    expect(service.isBusy()).toBe(true)
    expect(await service.getState()).toMatchObject({ error: { code: 'operation-unknown' } })
    expect((await service.use('22.9.0')).error?.code).toBe('operation-unknown')
    const shutdown = barrier.freezeForShutdown()
    expect(await Promise.race([shutdown.then(() => 'drained'), new Promise(resolve => setTimeout(() => resolve('blocked'), 20))])).toBe('blocked')
  })

  it('rechecks configuration changed while the official install catalog was loading', async () => {
    let changed = false
    const { service } = makeService(adapter({
      discover: async () => changed ? { ...ready, conflicts: [{ code: 'mirror', path: null, message: 'custom mirror' }] } : ready,
    }), { loadCatalog: async () => { changed = true; return parseNodeCatalog(releases) } })
    expect(await service.install('24.11.0')).toMatchObject({ error: { code: 'environment-conflict' }, busy: null })
  })

  it('reports verification failure when the newly installed manager has a blocking conflict', async () => {
    let installed = false
    const { service } = makeService(adapter({
      discover: async () => installed
        ? { ...ready, conflicts: [{ code: 'link-not-on-path', path: symlink, message: 'PATH requires repair' }] }
        : { ...ready, installation: null, manager: { status: 'missing', version: null } },
      installManager: async () => { installed = true; return { status: 'success' } },
    }))
    expect(await service.installManager()).toMatchObject({ error: { code: 'verification-failed' } })
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

  it('reports verification failure if a 2.0.1 install unexpectedly switches the default', async () => {
    let installed = false
    const { service } = makeService(adapter({
      discover: async () => ({
        ...ready, manager: { status: 'ready', version: '2.0.1' },
        installation: { ...ready.installation!, family: 'modern', version: '2.0.1', mode: 'shim' },
        activeVersion: installed ? '24.11.0' : '22.9.0',
        installedVersions: installed ? ['24.11.0', '22.9.0'] : ['22.9.0'],
      }),
      changeVersion: async () => { installed = true; return { status: 'success' } },
    }))
    expect(await service.install('24.11.0')).toMatchObject({ error: { code: 'verification-failed' }, activeVersion: '24.11.0' })
  })

  it('reports a failed direct 1.1.11 link when the CLI exits normally without switching', async () => {
    const { service } = makeService(adapter({
      discover: async () => ({
        ...ready, manager: { status: 'ready', version: '1.1.11' },
        installation: { ...ready.installation!, family: 'classic', version: '1.1.11', executableDigest: 'a49764cb5cae51d0a31f7bbeda22bc6eab4b2952f2638d543bb38877a6670791' },
        installedVersions: ['24.11.0', '22.9.0'],
      }),
      changeVersion: async () => ({ status: 'success' }),
    }))
    expect(await service.use('24.11.0')).toMatchObject({ busy: null, error: { code: 'verification-failed' }, activeVersion: '22.9.0' })
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

it('streams an allowed HTTP redirect through the real Node fetch transport', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/initial') response.writeHead(302, { location: '/asset' }).end()
    else response.end('bounded official asset')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('No loopback address')
    const origin = 'http://127.0.0.1:' + address.port
    expect((await fetchBoundedAsset(globalThis.fetch, origin + '/initial', new Set([origin]), 100)).toString()).toBe('bounded official asset')
    await expect(fetchBoundedAsset(globalThis.fetch, origin + '/initial', new Set(), 100)).rejects.toThrow()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

it('keeps the observed machine reservation through an unavailable lock check until a verified clear', async () => {
  let lock: 'unknown' | 'failed' | 'clear' = 'unknown'
  const { service } = makeService(adapter({ mutationStatus: async () => {
    if (lock === 'failed') throw Error('lock unavailable')
    return lock === 'clear' ? 'clear' : 'operation-unknown'
  } }))
  await service.getState()
  lock = 'failed'
  expect((await service.getState()).error?.code).toBe('operation-unknown')
  expect(service.isBusy()).toBe(true)
  lock = 'clear'
  expect((await service.getState()).error).toBeNull()
  expect(service.isBusy()).toBe(false)
})

it('releases an observed operation when its owner records terminal reboot-required and keeps mutations blocked', async () => {
  let record: 'operation-unknown' | 'unreadable' | 'reboot-required' = 'operation-unknown'
  let attempts = 0
  const { service } = makeService(adapter({
    mutationStatus: async () => { if (record === 'unreadable') throw Error('read failed'); return record },
    acquireMutation: async () => { attempts++; throw Error('unexpected acquisition') },
  }))
  for (const status of ['operation-unknown', 'unreadable', 'operation-unknown'] as const) {
    record = status
    expect((await service.getState()).error?.code).toBe('operation-unknown')
    expect(service.isBusy()).toBe(true)
  }
  record = 'reboot-required'
  expect(await service.getState()).toMatchObject({ busy: null, error: { code: 'reboot-required' }, removal: { rebootRequired: true } })
  expect(service.isBusy()).toBe(false)
  expect((await service.install('22.9.0')).error?.code).toBe('reboot-required')
  expect(attempts).toBe(0)
})

it('honours terminal evidence when an acquisition failure and its recovery inspection straddle completion', async () => {
  let attempts = 0
  const { service } = makeService(adapter({
    acquireMutation: async () => { attempts++; throw Error('operation-unknown') },
    mutationStatus: async () => 'reboot-required',
  }))
  expect(await service.use('22.9.0')).toMatchObject({ busy: null, error: { code: 'reboot-required' }, removal: { rebootRequired: true } })
  expect(service.isBusy()).toBe(false)
  expect((await service.installManager()).error?.code).toBe('reboot-required')
  expect(attempts).toBe(1)
})

it.each(['classic', 'modern'] as const)('rechecks the %s data root independently of the executable and refuses a changed or missing directory', async family => {
  const install = { ...ready.installation!, root: 'D:\\versions' }
  const verified = family === 'modern'
    ? { ...install, family: 'modern' as const, version: '2.0.1' as const, mode: 'shim' as const }
    : { ...install, family: 'classic' as const, version: '1.2.2' as const }
  let current = verified
  let exists = true
  const { service } = makeService(adapter({ discover: async () => ({ ...ready, installation: current }), verifiedDirectory: async () => exists }))
  await service.getState()
  expect(await service.verifiedManagerFolder()).toBe('D:\\versions')
  exists = false
  expect(await service.verifiedManagerFolder()).toBeNull()
  exists = true
  current = { ...verified, root: 'D:\\different' }
  expect(await service.verifiedManagerFolder()).toBeNull()
})

it.runIf(process.platform === 'win32')('accepts an existing local Windows folder and rejects files and redirected parent junctions', async () => {
  // Windows TEMP may use an 8.3 alias or a redirected parent. The positive
  // case represents a canonical root already identified by manager discovery.
  const temp = await mkdtemp(join(await realpath(tmpdir()), 'workrail-folder-'))
  const verify = createWindowsNodeAdapter(fetch).verifiedDirectory!
  try {
    const root = join(temp, 'store')
    await mkdir(join(root, 'versions'), { recursive: true })
    await writeFile(join(temp, 'plain.txt'), '')
    await createSymlink(root, join(temp, 'link'), 'junction')
    expect(await verify(root), 'Expected canonical directory ' + root + ' (real path ' + await realpath(root) + ')').toBe(true)
    expect(await verify(join(temp, 'plain.txt'))).toBe(false)
    expect(await verify(join(temp, 'link', 'versions'))).toBe(false)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
