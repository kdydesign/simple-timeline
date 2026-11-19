import { expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, chmod, rm, readFile, access, rename, symlink } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { parseNodeCatalog } from '../../src/main/node-management/catalog'
import * as guest from '../../src/main/node-management/wsl-guest'
import * as host from '../../src/main/node-management/wsl-host'
import * as windows from '../../src/main/node-management/windows'

const run = promisify(execFile)
const id = 'wsl:12345678-1234-1234-1234-123456789abc'
const env = { id, kind: 'wsl2' as const, label: 'Ubuntu Dev', distro: 'Ubuntu Dev', running: true }
const user = userInfo().username

it('retains source-only Linux releases, excludes unrelated archives, and distinguishes unknown LTS metadata', () => {
  const rows = [
    { version: 'v20.1.0', files: ['src'], date: '2024-01-01', lts: '??' },
    { version: 'v20.2.0', files: ['linux-x64'], date: '2024-01-01', lts: false },
    { version: 'v20.3.0', files: ['win-x64-zip'], date: '2024-01-01', lts: false },
  ]
  const releases = parseNodeCatalog(rows, { linuxArch: 'x64' })
  expect(releases.map(r => r.version)).toEqual(['20.2.0', '20.1.0'])
  expect(releases[1]).toMatchObject({ sourceOnly: true, ltsKnown: false })
  expect(parseNodeCatalog(rows).map(r => r.version)).toEqual(['20.3.0'])
})

it('uses host registry WSL2 identities and exact running names, without entering any guest', async () => {
  const registry = vi.fn(async () => [{ id: id.slice(4), name: 'Ubuntu Dev', version: 2 }, { id: id.slice(4), name: 'Legacy', version: 1 }])
  const running = vi.fn(async () => Buffer.from('Ubuntu Dev\r\n', 'utf16le'))
  expect(await host.listWsl(registry, running)).toEqual([env])
  running.mockResolvedValueOnce(Buffer.from('', 'utf16le'))
  expect(await host.listWsl(registry, running)).toEqual([{ ...env, running: false }])
  registry.mockRejectedValueOnce(Error('denied'))
  await expect(host.listWsl(registry, running)).rejects.toThrow()
})

it('guards the running state again just before any guest command and checks default-user identity', async () => {
  const call = vi.fn(async () => Buffer.from('tester\n'))
  const discover = vi.fn(async () => [{ ...env, running: false }])
  const runner = host.createWslRunner(discover, call)
  await expect(runner.defaultUser(env)).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  await runner.start(env)
  expect(call.mock.calls[0]).toEqual([['--distribution', 'Ubuntu Dev', '--exec', '/bin/true']])
  discover.mockResolvedValue([{ ...env, running: true }])
  await expect(runner.probe(env, 'previous-user')).rejects.toThrow()
  expect(call).toHaveBeenCalledTimes(2)
})

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'workrail-guest-'))
  const root = join(home, '.nodenv')
  const bin = join(root, 'bin')
  const plugin = join(root, 'plugins/node-build/bin')
  await Promise.all([mkdir(bin, { recursive: true }), mkdir(plugin, { recursive: true }), mkdir(join(root, 'versions/20.1.0/bin'), { recursive: true }), mkdir(join(root, 'shims'), { recursive: true })])
  const definitions = join(dirname(plugin), 'share/node-build')
  await mkdir(definitions, { recursive: true })
  await writeFile(join(definitions, '22.1.0'), '# trusted definition')
  const tool = async (path: string, script: string) => { await writeFile(path, '#!/bin/sh\n' + script, { mode: 0o755 }) }
  const manager = join(bin, 'nodenv')
  await tool(join(root, 'versions/20.1.0/bin/node'), 'echo v20.1.0')
  await tool(join(root, 'shims/node'), 'echo shim')
  await tool(manager, `case "$1" in
--version) echo nodenv 1.6.2;;
root) echo "$NODENV_ROOT";;
versions) echo 20.1.0;;
global) if [ "$#" = 2 ]; then echo "$2" > "$NODENV_ROOT/version"; else cat "$NODENV_ROOT/version"; fi;;
esac`)
  await tool(join(plugin, 'node-build'), 'echo 20.1.0; echo 22.1.0; echo iojs-3.0.0')
  await writeFile(join(root, 'version'), '20.1.0\n')
  const variables = { ...process.env, HOME: home, NODENV_ROOT: root, PATH: [bin, join(root, 'shims'), '/usr/bin', '/bin'].join(':') }
  const inspect = async (credentials: { uid?: number; gid?: number } = {}) =>
    guest.parseGuestProbe((await run('/bin/sh', ['-c', guest.probeScript, 'workrail'], { env: variables, ...credentials })).stdout)
  return { home, root, manager, plugin, definitions, variables, inspect }
}

it.runIf(process.platform === 'linux')('executes the guest probe against a temporary Linux manager and rejects an unsafe executable before version invocation', async () => {
  const f = await fixture()
  try {
    const info = await f.inspect()
    expect(info).toMatchObject({ user, manager: { status: 'ready', version: '1.6.2' }, installedVersions: ['20.1.0'], activeVersion: '20.1.0', definitions: ['20.1.0','22.1.0'] })
    expect(info.capabilities.install.available).toBe(true)
    await rm(join(f.plugin, 'node-build'))
    expect((await f.inspect()).capabilities).toMatchObject({ list: { available: true }, use: { available: true }, install: { available: false } })
    await writeFile(f.manager, '#!/bin/sh\ntouch "$HOME/executed"\n')
    await chmod(f.manager, 0o777)
    expect((await f.inspect()).manager.status).toBe('error')
    await expect(access(join(f.home, 'executed'))).rejects.toThrow()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('checks ancestors of both the configured and resolved manager path', async () => {
  const f = await fixture()
  try {
    const directory = join(f.home, '다른 경로\n[bin]')
    const target = join(directory, 'nodenv')
    await mkdir(directory)
    await rename(f.manager, target)
    await symlink(target, f.manager)
    expect((await f.inspect()).manager.status).toBe('ready')
    await chmod(directory, 0o777)
    expect((await f.inspect()).manager.status).toBe('error')
    await chmod(directory, 0o755)
    await chmod(dirname(f.manager), 0o777)
    expect((await f.inspect()).manager.status).toBe('error')
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('runs a global change in the pinned user root and leaves project-local selection intact', async () => {
  const f = await fixture()
  try {
    const project = join(f.home, '.node-version')
    await writeFile(project, '18.0.0')
    await run('/bin/sh', ['-c', guest.changeScript, 'workrail', 'use', '20.1.0', user, f.manager, f.root, ''], { env: f.variables })
    expect((await readFile(join(f.root, 'version'), 'utf8')).trim()).toBe('20.1.0')
    expect(await readFile(project, 'utf8')).toBe('18.0.0')
    await expect(run('/bin/sh', ['-c', guest.changeScript, 'workrail', 'use', '20.1.0', 'other', f.manager, f.root, ''], { env: f.variables })).rejects.toThrow()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('cancels only the owned guest process group through its private stdin', async () => {
  const sibling = spawn('/bin/sleep', ['30'])
  const child = spawn('/usr/bin/setsid', ['--wait', '/bin/sh', '-c', guest.superviseScript, 'workrail', '/bin/sh', '-c', 'echo ready; sleep 30'])
  try {
    await new Promise<void>((resolve,reject) => { child.stdout.once('data', () => resolve()); child.once('error',reject); child.once('exit', () => reject(Error('ended before ready'))) })
    const done = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
    child.stdin.end('cancel\n')
    expect(await done).not.toEqual({ code: 0, signal: null })
    expect(sibling.exitCode).toBeNull()
  } finally { sibling.kill(); child.kill() }
})

import * as services from '../../src/main/node-management/wsl'
import { capabilities } from '../../src/main/node-management/manager-support'
import { createMutationBarrier } from '../../src/main/updates/installer'
import type { NodeManagementState } from '../../src/shared/node-management'

function setupService(openLog?: () => ReturnType<typeof services.openWslLog>) {
  let snapshot: guest.WslInspection = {
    user: 'tester', arch: 'x64', root: '/home/tester/.nodenv', builder: '/opt/node-build', definitions: ['22.1.0','18.0.0'], buildTools: false,
    global: '20.1.0', manager: { kind: 'nodenv', path: '/opt/nodenv', status: 'ready', version: '1.6.2' },
    capabilities: capabilities(null), installedVersions: ['20.1.0'], activeVersion: '20.1.0', conflicts: [],
  }
  const loadCatalog = vi.fn(async () => ['22.1.0','20.1.0','18.0.0'].map(version => ({ version, lts: null, date: '2024-01-01', security: false, npm: null, sourceOnly: version === '18.0.0' })))
  const runner = { verifiedFolder: vi.fn(async () => null), isStopped: vi.fn(async () => false), defaultUser: vi.fn(async () => snapshot.user), probe: vi.fn(async () => snapshot), change: vi.fn<ReturnType<typeof host.createWslRunner>['change']>(async () => 'success') }
  const changed = vi.fn<(s: NodeManagementState, user?: string | null) => void>(), barrier = createMutationBarrier()
  const service = services.createWslService({ environment: env, runner, loadCatalog, changed, barrier, openLog })
  return { service, runner, loadCatalog, changed, barrier, update: (patch: Partial<guest.WslInspection>) => { snapshot = { ...snapshot, ...patch } } }
}

it('marks Linux definition and source-tool restrictions per release and checks actual post-install inventory and default', async () => {
  const { service, runner, update } = setupService()
  const state = await service.refreshCatalog()
  expect(state.catalog.releases.map(v => !!v.installReason)).toEqual([false,true,true])
  expect((await service.install('18.0.0')).error?.message).toContain('C++')
  expect(runner.change).not.toHaveBeenCalled()
  expect((await service.install('22.1.0')).error?.code).toBe('verification-failed')
  runner.change.mockImplementationOnce(async () => {
    update({ installedVersions: ['20.1.0', '22.1.0'], activeVersion: '22.1.0', global: '22.1.0' })
    return 'success'
  })
  expect((await service.install('22.1.0')).error?.code).toBe('verification-failed')
})

it('publishes compilation, waits for confirmed cancellation, re-inspects and releases the lifecycle barrier', async () => {
  const { service, runner, changed, barrier } = setupService()
  await service.refreshCatalog()
  let markStarted!: () => void
  const started = new Promise<void>(resolve => { markStarted = resolve })
  runner.change.mockImplementationOnce(async (_env, _info, _kind, _version, signal, line) => {
    line('g++ -o Release/obj.target/node.o'); markStarted()
    return await new Promise(resolve => signal.addEventListener('abort', () => resolve('cancelled')))
  })
  const operation = service.install('22.1.0')
  await started
  expect(changed.mock.calls.some(([s]) => s.busy?.phase === 'compiling')).toBe(true)
  const drain = barrier.freeze()
  expect(service.isBusy()).toBe(true)
  const result = await service.cancelOperation()
  expect(result).toMatchObject({ busy: null, error: { code: 'cancelled' }, installedVersions: ['20.1.0'] })
  expect(result.operationLog?.join(' ')).toContain('g++')
  expect((await operation).error?.code).toBe('cancelled')
  expect(runner.probe.mock.calls.length).toBeGreaterThanOrEqual(3)
  await drain
})

it('rejects a changed default user before mutation and drops the previous inventory and release cache', async () => {
  const { service, runner, update } = setupService()
  await service.refreshCatalog()
  update({ user: 'another', root: '/home/another/.nodenv', installedVersions: ['18.0.0'], activeVersion: null })
  const result = await service.use('20.1.0')
  expect(result).toMatchObject({ installedVersions: ['18.0.0'], catalog: { status: 'idle' }, error: { code: 'environment-conflict' } })
  expect(runner.change).not.toHaveBeenCalled()
})

it('latches an uncertain guest process lifetime and prevents a second mutation', async () => {
  const { service, runner } = setupService()
  await service.refreshCatalog()
  runner.change.mockResolvedValueOnce('unknown')
  const result = await service.install('22.1.0')
  expect(result.error?.code).toBe('operation-unknown')
  expect(service.isBusy()).toBe(true)
  await service.install('22.1.0')
  expect(runner.change).toHaveBeenCalledTimes(1)
})

it.runIf(process.platform === 'linux')('keeps a failed private prefix out of inventory and permits retrying only a prefix reserved by WorkRail', async () => {
  const f = await fixture()
  try {
    const builder = join(f.plugin, 'node-build')
    await writeFile(builder, `#!/bin/sh
if [ "$1" = --definitions ]; then echo 22.1.0; exit; fi
mkdir -p "$3/bin"
printf '#!/bin/sh\\necho v22.1.0\\n' > "$3/bin/node"; chmod +x "$3/bin/node"
[ -f "$HOME/succeed" ]`)
    await writeFile(f.manager, (await readFile(f.manager, 'utf8')).replace('versions) echo 20.1.0', 'versions) echo 20.1.0; echo 22.1.0'))
    const install = () => run('/bin/sh', ['-c', guest.changeScript, 'workrail', 'install', '22.1.0', user, f.manager, f.root, builder], { env: f.variables })
    await expect(install()).rejects.toThrow()
    expect((await f.inspect()).installedVersions).toEqual(['20.1.0'])
    await writeFile(join(f.home, 'succeed'), '')
    await install()
    expect((await f.inspect()).installedVersions).toEqual(['20.1.0','22.1.0'])
    expect(await readFile(join(f.root,'version'),'utf8')).toBe('20.1.0\n')
    await expect(install()).rejects.toThrow()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('rejects an unsafe nodenv subcommand before the manager can delegate to it', async () => {
  const f = await fixture()
  try {
    const helper = join(f.root, 'bin', 'nodenv---version')
    await writeFile(helper, '#!/bin/sh\ntouch "$HOME/helper-ran"; echo nodenv 1.6.2', { mode: 0o755 })
    await chmod(helper, 0o777)
    await writeFile(f.manager, (await readFile(f.manager,'utf8')).replace('echo nodenv 1.6.2', 'nodenv---version'))
    expect((await f.inspect()).manager.status).toBe('error')
    await expect(access(join(f.home, 'helper-ran'))).rejects.toThrow()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('treats an unrecognized host running-list response as an inspection failure', async () => {
  const registry = async () => [{ id: id.slice(4), name: 'Ubuntu Dev', version: 2 }]
  await expect(host.listWsl(registry, async () => Buffer.from('WSL cannot be initialized'))).rejects.toThrow()
})

it('keeps a bounded operation log under the profile with output and exit status', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workrail-build-log-'))
  try {
    const log = await services.openWslLog(profile)
    log.line('Downloading node')
    log.line('g++ -c node.cc')
    await log.close('failed')
    expect(dirname(dirname(log.path))).toBe(profile)
    expect(await readFile(log.path, 'utf8')).toContain('Downloading node\ng++ -c node.cc\nfailed')
  } finally { await rm(profile, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('separates a Windows-style Node on PATH from a verified Linux nodenv inventory', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'bin/node.exe'), '#!/bin/sh\ntouch "$HOME/win-ran"', { mode: 0o755 })
    f.variables.PATH = join(f.root, 'bin')
    const info = await f.inspect()
    expect(info).toMatchObject({ manager: { status: 'ready' }, capabilities: { list: { available: true }, use: { available: false } }, conflicts: [{ code: 'path-priority' }] })
    await expect(access(join(f.home,'win-ran'))).rejects.toThrow()
    await rm(f.manager)
    expect((await f.inspect()).capabilities.list.reason).toContain('github.com/nodenv/nodenv')
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('preserves the guest command as arguments when executing through the default login shell', async () => {
  const calls: string[][] = []
  const call = async (args: string[]) => {
    calls.push(args)
    if (args.includes('/usr/bin/id')) return Buffer.from(user)
    throw Error('capture probe')
  }
  await expect(host.createWslRunner(async () => [env], call).probe(env)).rejects.toThrow('capture probe')
  const argv = calls.at(-1)!
  expect(argv.slice(0,7)).toEqual(['--distribution', env.distro, '--user', user, '--cd', '~', '--exec'])
  expect(argv.some(arg => arg.includes('getent passwd'))).toBe(true)
  expect(argv).toContain(guest.probeScript)
})

type Fixture = Awaited<ReturnType<typeof fixture>>
const installArgs = (f: Fixture) => ['-c', guest.changeScript, 'workrail', 'install', '22.1.0', user, f.manager, f.root, join(f.plugin, 'node-build')]
async function installFixture(f: Fixture) {
  await writeFile(join(f.plugin, 'node-build'), `#!/bin/sh
if [ "$1" = --definitions ]; then echo 22.1.0; exit; fi
printf '%s' "$2" > "$HOME/selected-definition"
mkdir -p "$3/bin"
printf '#!/bin/sh\\necho v22.1.0\\n' > "$3/bin/node"
chmod +x "$3/bin/node"`)
  await writeFile(f.manager, (await readFile(f.manager, 'utf8')).replace('versions) echo 20.1.0', 'versions) echo 20.1.0; echo 22.1.0'))
}

it.runIf(process.platform === 'linux')('passes an absolute trusted definition from the first configured directory despite a same-name HOME file', async () => {
  const f = await fixture()
  try {
    await installFixture(f)
    const custom = join(f.home, 'custom definitions')
    await mkdir(custom)
    await writeFile(join(custom,'22.1.0'), '# first configured definition')
    await writeFile(join(f.home,'22.1.0'), '# unrelated local file')
    await run('/bin/sh', installArgs(f), { env: { ...f.variables, NODE_BUILD_DEFINITIONS: custom } })
    expect(await readFile(join(f.home,'selected-definition'),'utf8')).toBe(join(custom,'22.1.0'))
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('distinguishes an accessible empty inventory from an unreadable versions directory or version bin', async () => {
  const f = await fixture(), versions = join(f.root, 'versions'), bin = join(versions,'20.1.0/bin')
  // Even a root-owned CI runner must exercise the Linux user's permission checks.
  const credentials = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {}
  try {
    if (credentials.uid !== undefined) await run('/bin/chown', ['-R', '65534:65534', f.home])
    await chmod(bin, 0)
    expect((await f.inspect(credentials)).capabilities.list.available).toBe(false)
    await chmod(bin, 0o755)
    await chmod(versions, 0)
    expect((await f.inspect(credentials)).capabilities.list.available).toBe(false)
    await chmod(versions, 0o755)
    await rm(join(versions,'20.1.0'), { recursive: true })
    await writeFile(f.manager, (await readFile(f.manager,'utf8')).replace('versions) echo 20.1.0','versions) true'))
    expect(await f.inspect(credentials)).toMatchObject({ installedVersions: [], capabilities: { list: { available: true } } })
  } finally {
    await chmod(versions, 0o755); await chmod(bin, 0o755).catch(() => {})
    await rm(f.home, { recursive: true, force: true })
  }
})

it.runIf(process.platform === 'linux')('keeps a prefix private through a failed or cancelled rehash and publishes it after a successful retry', async () => {
  const f = await fixture()
  try {
    await installFixture(f)
    const original = await readFile(f.manager, 'utf8')
    await writeFile(f.manager, original.replace('esac', 'rehash) exit 1;;\nesac'))
    await expect(run('/bin/sh', installArgs(f), { env: f.variables })).rejects.toThrow()
    expect((await f.inspect()).installedVersions).not.toContain('22.1.0')
    await writeFile(f.manager, original.replace('esac','rehash) echo ready; sleep 30;;\nesac'))
    const child = spawn('/usr/bin/setsid', ['--wait','/bin/sh','-c', guest.superviseScript,'workrail','/bin/sh',...installArgs(f)], { env: f.variables })
    const done = new Promise(resolve => child.once('close', resolve))
    try {
      await new Promise<void>((resolve,reject) => { child.stdout.once('data', () => resolve()); child.once('exit', () => reject(Error('ended before rehash'))) })
      child.stdin.end('cancel\n')
      await done
      expect((await f.inspect()).installedVersions).not.toContain('22.1.0')
    } finally { child.stdin.end(); child.kill() }
    await writeFile(f.manager, original)
    await run('/bin/sh', installArgs(f), { env: f.variables })
    expect((await f.inspect()).installedVersions).toContain('22.1.0')
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it.runIf(process.platform === 'linux')('requires shims on the original PATH and allows a prepared shim PATH before the first binary exists', async () => {
  const f = await fixture()
  try {
    await rm(join(f.root, 'shims/node'))
    f.variables.PATH = join(f.root, 'bin')
    const missing = await f.inspect()
    expect(missing.capabilities.use).toMatchObject({ available: false, reason: expect.stringContaining('shims') })
    await expect(run('/bin/sh', ['-c',guest.changeScript,'workrail','use','20.1.0',user,f.manager,f.root,''],{ env:f.variables })).rejects.toThrow()
    f.variables.PATH += ':' + join(f.root,'shims')
    expect((await f.inspect()).capabilities.install.available).toBe(true)
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('keeps a same-target catalog refresh through a concurrent focus inspection', async () => {
  const { service, loadCatalog } = setupService()
  const rows = await loadCatalog()
  let finish!: (v: typeof rows) => void
  loadCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const refresh = service.refreshCatalog()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await service.getState()
  finish(rows)
  expect((await refresh).catalog).toMatchObject({ status: 'ready', releases: expect.anything() })
  expect((await service.getState()).catalog.releases).toHaveLength(3)
})

it.each(['CXX(target) Release/obj.o', 'CC(target) Release/obj.o', 'make[1]: Entering directory /tmp/build', './configure --prefix=/tmp/prefix'])('publishes compiling on %s', async raw => {
  const { service, runner, changed } = setupService()
  await service.refreshCatalog()
  runner.change.mockImplementationOnce(async (_env, _info, _kind, _version, _signal, line) => { line(raw); return 'failed' })
  await service.install('22.1.0')
  expect(changed.mock.calls.some(([s]) => s.busy?.phase === 'compiling')).toBe(true)
})

it('holds the update barrier on missing or inconclusive termination evidence and releases after a verified stop', async () => {
  const { service, runner, barrier } = setupService()
  await service.refreshCatalog()
  runner.change.mockResolvedValueOnce('unknown')
  await service.install('22.1.0')
  const probes = runner.probe.mock.calls.length
  runner.isStopped.mockRejectedValueOnce(Error('host read failed'))
  expect((await service.getState()).error?.code).toBe('operation-unknown')
  expect((await service.getState()).busy).toBeTruthy()
  const drain = barrier.freeze()
  runner.isStopped.mockResolvedValue(true)
  expect((await service.getState()).busy).toBeNull()
  expect(service.isBusy()).toBe(false)
  await drain
  expect(runner.probe).toHaveBeenCalledTimes(probes)
})

it('requires positive Stopped status for the exact WSL2 registration without entering the guest', async () => {
  const discover = vi.fn(async () => [{ ...env, running: false }])
  const call = vi.fn(async (_args: string[]) => Buffer.from('* Ubuntu Dev  Converting  2\n'))
  const runner = host.createWslRunner(discover, call)
  expect(await runner.isStopped(env)).toBe(false)
  call.mockResolvedValueOnce(Buffer.from('* Ubuntu Dev  Stopped  2\n','utf16le'))
  expect(await runner.isStopped(env)).toBe(true)
  discover.mockResolvedValueOnce([])
  expect(await runner.isStopped(env)).toBe(false)
  expect(call.mock.calls.every(([args]) => args.join(' ') === '--list --verbose')).toBe(true)
})

it.runIf(process.platform === 'linux')('rejects a definition symlink ending outside the verified definition root', async () => {
  const f = await fixture()
  try {
    await installFixture(f)
    const definition = join(f.definitions, '22.1.0')
    await rm(definition)
    await writeFile(join(f.home,'external-definition'), '# outside verified root')
    await symlink(join(f.home,'external-definition'), definition)
    await expect(run('/bin/sh', installArgs(f), { env: f.variables })).rejects.toThrow()
    await expect(access(join(f.home,'selected-definition'))).rejects.toThrow()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('discards a pending catalog for a changed user or a newer mutation', async () => {
  for (const changedUser of [true, false]) {
    const { service, loadCatalog, update } = setupService()
    const rows = await loadCatalog()
    let finish!: (v: typeof rows) => void
    loadCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const refresh = service.refreshCatalog()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    if (changedUser) {
      update({ user: 'another' })
      await service.getState()
    } else {
      await service.use('20.1.0')
    }
    finish(rows)
    expect((await refresh).catalog).toMatchObject({ status: 'idle', releases: [] })
  }
})

it.runIf(process.platform === 'linux')('keeps a missing configured global for verification without claiming it as usable', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'version'), '22.1.0')
    const info = await f.inspect()
    expect(info).toMatchObject({ global: '22.1.0', activeVersion: null, installedVersions: ['20.1.0'],
      capabilities: { list: { available: true }, install: { available: true } } })
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('allows only unambiguous local WSL Explorer path components', () => {
  expect(host.wslExplorerPath('Ubuntu Dev', '/opt/team nodes')).toBe('\\\\wsl.localhost\\Ubuntu Dev\\opt\\team nodes')
  for (const distro of ['..', 'a/b', 'a\\b', 'con', 'Ubuntu.', 'wsl:Ubuntu']) expect(host.wslExplorerPath(distro, '/root')).toBeNull()
  for (const path of ['/', '/path/..', '/path/./files', '//remote/share', '/home/a\\b', '/path/desktop.ini:zone',
    '/etc/trailing ', '/etc/foo.', '/dev/NUL.txt', '/dev/COM¹', '/dev/CONOUT$', '/root/\npath']) {
    expect(host.wslExplorerPath('Ubuntu', path)).toBeNull()
  }
})

it.runIf(process.platform === 'linux')('opens the actual guest root only while its owner, canonical directory and registration still match', async () => {
  const f = await fixture()
  try {
    const before = await f.inspect()
    expect(before.folderRoot).toBe(f.root)
    let running = true
    let defaultUser = before.user
    const discover = async () => [{ ...env, running }]
    const call = vi.fn(async (args: string[]) => {
      if (args.includes('/usr/bin/id')) return Buffer.from(defaultUser)
      return Buffer.from((await run('/bin/sh', ['-c', guest.probeScript], { env: f.variables })).stdout)
    })
    const runner = host.createWslRunner(discover, call)
    expect(await runner.verifiedFolder(env, before)).toBe(host.wslExplorerPath(env.distro, f.root))
    await chmod(f.root, 0o777)
    expect(await runner.verifiedFolder(env, before)).toBeNull()
    await chmod(f.root, 0o700)
    defaultUser = 'different'
    await expect(runner.verifiedFolder(env, before)).rejects.toThrow()
    running = false
    call.mockClear()
    await expect(runner.verifiedFolder(env, before)).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  } finally { await rm(f.home, { recursive: true, force: true }) }
})

it('retains build diagnostics and removes downloader credentials from every published state and the saved log', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workrail-proxy-log-'))
  try {
    const { service, runner, changed } = setupService(() => services.openWslLog(profile))
    runner.change.mockImplementationOnce(async (_env, _info, _kind, _version, _signal, line) => {
      for (const output of [
        'Downloading node-v22.1.0.tar.gz...',
        '-> http://fixture-account:fixture-password@fixture.invalid/node',
        "* Proxy auth using Basic with user 'fixture-account'",
        '> Proxy-Authorization: Basic Zml4dHVyZS10b2tlbg==',
        'HTTP/1.1 407 Proxy Authentication Required',
        'https_proxy=' + 'x'.repeat(1600) + 'fixture-password@fixture.invalid',
        'curl -U "fixture-account:fixture-password" https://nodejs.org/',
        'curl --user=fixture-account:fixture-password https://nodejs.org/',
        'g++ -UDEBUG -x c++ -c node.cc',
        'g++ -c node.cc',
      ]) line(output)
      return 'failed'
    })
    const state = await service.install('22.1.0')
    const disk = await readFile(state.operationLogPath!, 'utf8')
    for (const log of [disk, JSON.stringify(changed.mock.calls)]) {
      expect(log).not.toMatch(/fixture-account|fixture-password|fixture\.invalid|Zml4dHVyZS10b2tlbg==/)
      expect(log).toContain('g++ -c node.cc')
      expect(log).toContain('407')
      expect(log).toContain('g++ -UDEBUG -x c++ -c node.cc')
    }
  } finally { await rm(profile, { recursive: true, force: true }) }
})

it('reports a node-build download failure separately from catalog and compile errors', async () => {
  const { service, runner } = setupService()
  const installWith = (output: string[]) => {
    runner.change.mockImplementationOnce(async (_env, _info, _kind, _version, _signal, line) => {
      output.forEach(line)
      return 'failed'
    })
    return service.install('22.1.0')
  }
  expect((await installWith(['error: failed to download node-v22.1.0.tar.gz'])).error)
    .toMatchObject({ code: 'download-failed', message: expect.stringContaining('node-build') })
  expect((await installWith(['Downloading node-v22.1.0.tar.gz...', 'curl: (5) Could not resolve proxy: fixture.invalid'])).error?.code)
    .toBe('download-failed')
  expect((await installWith(['error: failed to download node-v22.1.0.tar.gz', 'Installing node-v22.1.0...', 'make[1]: *** Error 1'])).error?.code)
    .toBe('operation-failed')
})

it.runIf(process.platform === 'linux')('frames split and oversized WSL output without publishing credential fragments', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workrail-wsl-stream-'))
  const systemShell = vi.spyOn(windows, 'resolveSystemPowerShell')
  try {
    // The Linux executable stands in for wsl.exe at the OS boundary and writes
    // bytes through the same stdout/stderr pipes as the Windows child.
    const executable = join(profile, 'wsl.exe')
    await writeFile(executable, `#!${process.execPath}
process.stdout.write('Proxy-Authoriz')
setTimeout(() => {
  process.stdout.write('ation: Basic ' + 'x'.repeat(12000))
  process.stderr.write('g++ -c node.cc\\n')
  setTimeout(() => {
    process.stdout.write('fixture-private-token\\r\\n\\tfixture-private-continuation\\r\\n')
    process.stderr.write('WORKRAIL_JOB_EXIT 1\\n')
    process.exitCode = 1
  }, 20)
}, 20)`, { mode: 0o755 })
    const childEnv = { SystemRoot: '.', windir: '.', SystemDrive: '', Path: profile, PATH: profile, ComSpec: '', PSModulePath: '' }
    systemShell.mockResolvedValue({ system: '.', powershell: '', options: { cwd: profile, shell: false, windowsHide: true, maxBuffer: 65536, env: childEnv } })
    const { service, runner, changed } = setupService(() => services.openWslLog(profile))
    runner.change.mockImplementationOnce((_env, _info, _kind, _version, signal, line) => host.runWslJob([], signal, line))
    const result = await service.install('22.1.0')
    expect(result.error?.code).toBe('operation-failed')
    for (const log of [await readFile(result.operationLogPath!, 'utf8'), JSON.stringify(changed.mock.calls)]) {
      expect(log).toContain('g++ -c node.cc')
      expect(log).not.toContain('fixture-private')
    }
  } finally {
    systemShell.mockRestore()
    await rm(profile, { recursive: true, force: true })
  }
})

it.runIf(process.platform === 'linux')('uses each selected login profile for proxied downloads and its own bypass list', async () => {
  const releases = [await fixture(), await fixture()]
  const distros = [env, { ...env, id: 'wsl:22345678-1234-1234-1234-123456789abc', distro: 'Second Linux' }]
  const requests: string[][] = [[], [], []]
  const servers = requests.map(seen => createServer((req, res) => {
    seen.push(req.url!)
    res.end('ok')
  }).on('connect', (req, socket) => {
    seen.push('CONNECT ' + req.url)
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n')
  }))
  try {
    const addresses = await Promise.all(servers.map(async server => {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
    }))
    async function enter(args: string[]) {
      const index = distros.findIndex(target => target.distro === args[1])
      const guestArgs = args.slice(args.indexOf('--exec') + 1)
      // No proxy or nodenv variables in the outer process. Only the selected
      // guest's login profile can supply its routes and toolchain.
      return (await run(guestArgs[0], guestArgs.slice(1), { env: { HOME: releases[index].home, PATH: '/usr/bin:/bin' } })).stdout
    }
    const runner = host.createWslRunner(async () => distros, async args => Buffer.from(await enter(args)), async args => {
      await enter(args)
      return 'success'
    })
    for (const [i, f] of releases.entries()) {
      await installFixture(f)
      const bypass = i === 0 ? 'NO_PROXY' : 'no_proxy'
      const profile = [
        'export NODENV_ROOT="$HOME/.nodenv"',
        'export PATH="$NODENV_ROOT/shims:$NODENV_ROOT/bin:/usr/bin:/bin"',
        `export http_proxy=${addresses[i]}`,
        `export ${i === 0 ? 'HTTPS_PROXY' : 'https_proxy'}=${addresses[i]}`,
        `export ${bypass}=127.0.0.1`,
      ].join('\n')
      await mkdir(join(f.home, '.config/fish'), { recursive: true })
      for (const name of ['.bash_profile', '.profile', '.zprofile', '.config/fish/config.fish'])
        await writeFile(join(f.home, name), profile)
      const builder = join(f.plugin, 'node-build')
      const download = `curl -qfsS --max-time 3 http://download.invalid/node-${i ? 'source' : 'binary'} >/dev/null || exit 1
curl -qfsS --max-time 3 ${addresses[2]}/bypass-${i} >/dev/null || exit 1
[ "$(curl -qs --max-time 3 -o /dev/null -w '%{http_connect}' https://download.invalid/)" = 407 ] || exit 1`
      await writeFile(builder, (await readFile(builder, 'utf8')).replace('mkdir -p', download + '\nmkdir -p'))
      const info = await runner.probe(distros[i])
      expect(info.capabilities.install.available).toBe(true)
      expect(await runner.change(distros[i], info, 'install', '22.1.0', new AbortController().signal, () => {})).toBe('success')
      expect(await runner.probe(distros[i])).toMatchObject({ global: '20.1.0', installedVersions: ['20.1.0', '22.1.0'] })
    }
    expect(requests).toEqual([
      ['http://download.invalid/node-binary', 'CONNECT download.invalid:443'],
      ['http://download.invalid/node-source', 'CONNECT download.invalid:443'],
      ['/bypass-0', '/bypass-1'],
    ])
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
    await Promise.all(releases.map(f => rm(f.home, { recursive: true, force: true })))
  }
}, 15000)
