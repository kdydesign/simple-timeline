import { expect, it, vi } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as module from '../../src/main/node-management/environments'
import type { NodeEnvironment, NodeManagementState } from '../../src/shared/node-management'
import { createNodeManagementService } from '../../src/main/node-management/service'

const windows: NodeEnvironment = { id: 'windows', kind: 'windows', label: 'Windows', running: true }
const ubuntu: NodeEnvironment = { id: 'wsl:12345678-1234-1234-1234-123456789abc', kind: 'wsl2', distro: 'Ubuntu', label: 'Ubuntu', running: false }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setup(items: NodeEnvironment[], saved: string | null = null) {
  const discover = vi.fn(async () => items)
  const store = { read: vi.fn(async () => saved), write: vi.fn(async (id: string) => { saved = id }) }
  const start = vi.fn(async () => { items = items.map(x => ({ ...x, running: true })) })
  const changed = vi.fn()
  const make = (changed: (s: NodeManagementState) => void) => createNodeManagementService({
    platform: 'linux', arch: 'x64', windows: {} as never, loadCatalog: async () => [], changed,
  })
  const win = make(changed), guest = make(changed)
  const inspectWin = vi.spyOn(win, 'getState'), inspectGuest = vi.spyOn(guest, 'getState')
  const opener = { openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => {}) }
  const service = module.createEnvironmentCoordinator({
    platform: 'win32', arch: 'x64', discover, store, start, changed, opener, createWindows: () => win, createWsl: () => guest,
  })
  return { opener, service, inspectWin, inspectGuest, start, discover, store, guest, win, changed }
}

it('selects Windows alone and restores the saved environment among several', async () => {
  const single = setup([windows])
  expect((await single.service.getState()).environments?.selectedId).toBe('windows')
  expect(single.inspectWin).toHaveBeenCalledOnce()
  const multi = setup([windows, ubuntu], ubuntu.id)
  expect((await multi.service.getState()).environments?.selectedId).toBe(ubuntu.id)
  expect(multi.inspectWin).not.toHaveBeenCalled()
  expect(multi.inspectGuest).not.toHaveBeenCalled()
})

it('requires a discovered selection and an explicit start before entering a stopped guest', async () => {
  const { service, inspectWin, inspectGuest, start, store } = setup([windows, ubuntu])
  expect((await service.getState()).environments?.selectedId).toBeNull()
  expect((await service.selectEnvironment('C:\\temp')).error?.code).toBe('invalid-request')
  expect((await service.install('22.0.0')).error).toBeTruthy()
  await service.selectEnvironment(ubuntu.id)
  expect(store.write).toHaveBeenCalledWith(ubuntu.id)
  await service.refreshCatalog()
  await service.use('22.0.0')
  expect(inspectWin).not.toHaveBeenCalled()
  expect(inspectGuest).not.toHaveBeenCalled()
  expect(start).not.toHaveBeenCalled()
  expect((await service.startEnvironment()).environments?.items[1].running).toBe(true)
  expect(inspectGuest).toHaveBeenCalled()
})

it('requires reselection after a saved distro disappears and preserves detection failure as an error', async () => {
  const { service, inspectWin, discover } = setup([windows], ubuntu.id)
  expect((await service.getState()).environments).toMatchObject({ status: 'ready', selectedId: null, error: expect.anything() })
  discover.mockRejectedValueOnce(Error('registry read failed'))
  expect((await service.getState()).environments).toMatchObject({ status: 'error', selectedId: null, error: expect.anything() })
  expect(inspectWin).not.toHaveBeenCalled()
})

it('discards a late inspection and locks the target throughout a mutating command', async () => {
  const { service, inspectWin, win, guest } = setup([windows, { ...ubuntu, running: true }])
  await service.getState()
  const pending = deferred<NodeManagementState>()
  inspectWin.mockReturnValueOnce(pending.promise)
  const first = service.selectEnvironment(windows.id)
  await vi.waitFor(() => expect(inspectWin).toHaveBeenCalledOnce())
  const selecting = service.selectEnvironment(ubuntu.id)
  pending.resolve({ ...module.emptyNodeState('win32', true), installedVersions: ['0.0.1'] })
  const selected = await selecting
  expect((await first).installedVersions).not.toContain('0.0.1')
  const task = deferred<NodeManagementState>()
  vi.spyOn(guest, 'install').mockReturnValue(task.promise)
  const operation = service.install('20.0.0')
  expect(service.isBusy()).toBe(true)
  expect((await service.selectEnvironment(windows.id)).error?.code).toBe('busy')
  expect((await service.use('20.0.0')).error?.code).toBe('busy')
  task.resolve(selected)
  expect((await operation).environments?.selectedId).toBe(ubuntu.id)
  expect(service.isBusy()).toBe(false)
  expect(win.isBusy()).toBe(false)
})

it('persists only the selected ID in the profile and reads it across coordinator instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workrail-env-'))
  try {
    const store = module.environmentSelectionStore(directory)
    expect(await store.read()).toBeNull()
    await store.write(ubuntu.id)
    await store.write(windows.id)
    expect(await module.environmentSelectionStore(directory).read()).toBe(windows.id)
    expect(await readdir(directory)).toHaveLength(1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('ignores a read that finishes after a newer command in the same environment', async () => {
  const { service, guest, inspectGuest } = setup([{ ...ubuntu, running: true }])
  const baseline = await service.getState()
  const oldRead = deferred<NodeManagementState>()
  inspectGuest.mockReturnValueOnce(oldRead.promise)
  const request = service.getState()
  await vi.waitFor(() => expect(inspectGuest).toHaveBeenCalledTimes(2))
  vi.spyOn(guest, 'use').mockResolvedValueOnce({ ...baseline, activeVersion: '22.0.0' })
  expect((await service.use('22.0.0')).activeVersion).toBe('22.0.0')
  oldRead.resolve({ ...baseline, activeVersion: '18.0.0' })
  expect((await request).activeVersion).toBe('22.0.0')
})

it('routes inspection of a latched WSL job to its owner before replacing the backend on a confirmed stop', async () => {
  const { service, guest, inspectGuest, discover } = setup([{ ...ubuntu, running: true }])
  const baseline = await service.getState()
  const unknown: NodeManagementState = { ...baseline, busy: { kind: 'install', phase: 'waiting', version: '22.1.0' }, error: { code: 'operation-unknown', message: 'check' } }
  vi.spyOn(guest, 'install').mockResolvedValueOnce(unknown)
  await service.install('22.1.0')
  inspectGuest.mockResolvedValueOnce(unknown)
  expect((await service.getState()).busy).toBeTruthy()
  discover.mockResolvedValueOnce([ubuntu])
  inspectGuest.mockResolvedValueOnce({ ...baseline, error: { code: 'verification-failed', message: 'stopped' } })
  const result = await service.getState()
  expect(result.busy).toBeNull()
  expect(result.environments?.items[0].running).toBe(false)
})

it('retains a Windows reservation and its recovery service across failed environment and Node inspections', async () => {
  const discover = vi.fn(async () => [windows, ubuntu])
  const inspect = vi.fn(async () => ({
    manager: { status: 'missing' as const, version: null }, installedVersions: [], activeVersion: null,
    activeSource: null, conflicts: [], installation: null,
  }))
  let lock: 'clear' | 'operation-unknown' = 'operation-unknown'
  const createWindows = vi.fn((changed: module.EnvironmentChanged) => createNodeManagementService({
    platform: 'win32', arch: 'x64', changed, loadCatalog: async () => [],
    windows: { discover: inspect, mutationStatus: async () => lock, installManager: vi.fn(), changeVersion: vi.fn() },
  }))
  const coordinator = module.createEnvironmentCoordinator({
    platform: 'win32', arch: 'x64', discover, createWindows, createWsl: vi.fn(), start: vi.fn(),
    store: { read: async () => windows.id, write: vi.fn() }, changed: vi.fn(),
  })
  expect(await coordinator.getState()).toMatchObject({ busy: null, error: { code: 'operation-unknown' } })
  discover.mockRejectedValueOnce(Error('WSL inventory unavailable'))
  expect((await coordinator.getState()).environments?.status).toBe('error')
  expect(coordinator.isBusy()).toBe(true)
  expect((await coordinator.selectEnvironment(ubuntu.id)).error?.code).toBe('busy')
  inspect.mockRejectedValueOnce(Error('Windows inspection unavailable'))
  expect(await coordinator.refreshCatalog()).toMatchObject({ error: { code: 'operation-unknown' }, manager: { status: 'error' } })
  expect(coordinator.isBusy()).toBe(true)
  lock = 'clear'
  discover.mockRejectedValueOnce(Error('WSL inventory still unavailable'))
  expect(await coordinator.getState()).toMatchObject({ error: null, environments: { status: 'error' } })
  expect(coordinator.isBusy()).toBe(false)
  expect(createWindows).toHaveBeenCalledOnce()
  await coordinator.getState()
  expect((await coordinator.selectEnvironment(ubuntu.id)).environments?.selectedId).toBe(ubuntu.id)
})

it('commits the persisted selection and dispatch target together across a concurrent Windows lock inspection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workrail-select-'))
  try {
    const disk = module.environmentSelectionStore(directory)
    await disk.write(windows.id)
    const store = { read: disk.read, write: vi.fn(disk.write) }
    const runningGuest = { ...ubuntu, running: true }
    const discover = vi.fn(async () => [windows, runningGuest])
    const mutationStatus = vi.fn<() => Promise<'clear' | 'operation-unknown'>>(async () => 'clear')
    let win!: ReturnType<typeof createNodeManagementService>
    const guest = createNodeManagementService({ platform: 'linux', arch: 'x64', loadCatalog: vi.fn(), windows: {} as never, changed: vi.fn() })
    const guestUse = vi.spyOn(guest, 'use').mockResolvedValue(module.emptyNodeState('win32', true))
    const changed = vi.fn<(s: NodeManagementState) => void>()
    const coordinator = module.createEnvironmentCoordinator({
      platform: 'win32', arch: 'x64', discover, store, changed, start: vi.fn(), createWsl: () => guest,
      createWindows: onChange => {
        win = createNodeManagementService({ platform: 'win32', arch: 'x64', changed: onChange, loadCatalog: vi.fn(),
          windows: { mutationStatus, installManager: vi.fn(), changeVersion: vi.fn(), discover: async () => ({
            manager: { status: 'missing', version: null }, activeVersion: null, activeSource: null, installedVersions: [], conflicts: [], installation: null,
          }) },
        })
        return win
      },
    })
    await coordinator.getState()
    const winUse = vi.spyOn(win, 'use')
    const lockRead = deferred<'operation-unknown'>(), inspecting = deferred<void>()
    mutationStatus.mockImplementationOnce(() => { inspecting.resolve(); return lockRead.promise })
    const inspection = coordinator.getState()
    await inspecting.promise
    const writeGate = deferred<void>()
    store.write.mockImplementation(async id => { await writeGate.promise; await disk.write(id) })
    const selecting = coordinator.selectEnvironment(ubuntu.id)
    mutationStatus.mockResolvedValue('operation-unknown')
    lockRead.resolve('operation-unknown')
    await inspection
    writeGate.resolve()
    expect(await selecting).toMatchObject({ error: { code: 'busy' }, environments: { selectedId: windows.id } })
    expect(await disk.read()).toBe(windows.id)
    expect(changed.mock.calls.some(([s]) => s.environments?.selectedId === ubuntu.id)).toBe(false)
    expect(coordinator.isBusy()).toBe(true)

    // A recovery backend may outlive its registration during a scan. It can only inspect.
    discover.mockResolvedValueOnce([runningGuest])
    mutationStatus.mockResolvedValue('clear')
    expect((await coordinator.getState()).environments?.selectedId).toBeNull()
    expect(coordinator.isBusy()).toBe(false)
    expect((await coordinator.use('22.1.0')).error?.code).toBe('environment-conflict')
    expect(winUse).not.toHaveBeenCalled()
    await coordinator.getState()

    store.write.mockRejectedValueOnce(Error('selection rename failed'))
    expect((await coordinator.selectEnvironment(ubuntu.id)).error?.code).toBe('operation-failed')
    expect(coordinator.currentState().environments?.selectedId).toBe(windows.id)
    expect(await disk.read()).toBe(windows.id)

    const writing = deferred<void>(), commit = deferred<void>()
    store.write.mockImplementationOnce(async id => { writing.resolve(); await commit.promise; await disk.write(id) })
    const retry = coordinator.selectEnvironment(ubuntu.id)
    await writing.promise
    const inspectionsBeforeWrite = mutationStatus.mock.calls.length
    expect((await coordinator.refreshCatalog()).environments?.selectedId).toBe(windows.id)
    expect(mutationStatus).toHaveBeenCalledTimes(inspectionsBeforeWrite)
    expect((await coordinator.use('22.1.0')).error?.code).toBe('busy')
    expect(await disk.read()).toBe(windows.id)
    commit.resolve()
    expect((await retry).environments?.selectedId).toBe(ubuntu.id)
    expect(await disk.read()).toBe(ubuntu.id)
    await coordinator.use('22.1.0')
    expect(guestUse).toHaveBeenCalledExactlyOnceWith('22.1.0')
    expect(winUse).not.toHaveBeenCalled()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('opens only the release for the registered selection, including missing managers and stopped distros', async () => {
  const f = setup([windows, ubuntu])
  await f.service.getState()
  expect(module.environmentCommandError(await f.service.openManagerRelease('windows'))).toBeTruthy()
  await f.service.selectEnvironment('windows')
  await f.service.openManagerRelease('windows')
  await f.service.selectEnvironment(ubuntu.id)
  expect(module.environmentCommandError(await f.service.openManagerRelease('windows'))).toBeTruthy()
  await f.service.openManagerRelease(ubuntu.id)
  expect(f.opener.openExternal.mock.calls).toEqual([
    ['https://github.com/nvm-windows/nvm/releases/latest'], ['https://github.com/nodenv/nodenv/releases/latest'],
  ])
  expect(module.environmentCommandError(await f.service.openManagerFolder(ubuntu.id))).toBeTruthy()
  f.discover.mockResolvedValueOnce([windows])
  expect(module.environmentCommandError(await f.service.openManagerRelease(ubuntu.id))).toBeTruthy()
  expect(f.start).not.toHaveBeenCalled()
  expect(f.inspectGuest).not.toHaveBeenCalled()
  expect(f.opener.openPath).not.toHaveBeenCalled()
})

it('holds the selection while opening the verified root and reports Explorer failures only on the command', async () => {
  const f = setup([windows, ubuntu], 'windows')
  const ready: NodeManagementState = { ...module.emptyNodeState('win32', true), manager: { status: 'ready', version: '1.2.2' }, checkedAt: new Date().toISOString() }
  f.inspectWin.mockResolvedValue(ready)
  await f.service.getState()
  const root = deferred<string | null>()
  vi.spyOn(f.win, 'verifiedManagerFolder').mockReturnValue(root.promise)
  const opening = f.service.openManagerFolder('windows')
  expect(module.environmentCommandError(await f.service.selectEnvironment(ubuntu.id))?.code).toBe('busy')
  expect(module.environmentCommandError(await f.service.openManagerFolder('windows'))?.code).toBe('busy')
  root.resolve('C:\\node versions')
  f.opener.openPath.mockResolvedValueOnce('native error')
  expect(module.environmentCommandError(await opening)?.code).toBe('operation-failed')
  expect(f.opener.openPath).toHaveBeenCalledWith('C:\\node versions')
  expect(f.service.currentState().error).toBeNull()
})

it('completes a passive discovery before dispatching use to the same selected environment', async () => {
  const f = setup([windows])
  const state = await f.service.getState()
  const pending = deferred<NodeEnvironment[]>()
  f.discover.mockReturnValueOnce(pending.promise)
  const use = vi.spyOn(f.win, 'use').mockResolvedValue(state)
  const scan = f.service.getState()
  const change = f.service.use('22.9.0')
  pending.resolve([windows])
  await scan
  expect((await change).error).toBeNull()
  expect(use).toHaveBeenCalledOnce()
})

it.each([false, true])('waits for focus inspection before opening the folder (machine busy: %s)', async locked => {
  const f = setup([windows])
  const ready: NodeManagementState = { ...module.emptyNodeState('win32', true),
    manager: { status: 'ready', version: '1.1.11' }, checkedAt: new Date().toISOString() }
  f.inspectWin.mockResolvedValue(ready)
  await f.service.getState()
  const discovery = deferred<NodeEnvironment[]>(), inspection = deferred<NodeManagementState>()
  f.discover.mockReturnValueOnce(discovery.promise)
  f.inspectWin.mockReturnValueOnce(inspection.promise)
  const folder = 'C:\\nvm'
  vi.spyOn(f.win, 'verifiedManagerFolder').mockResolvedValue(folder)
  const reading = f.service.getState()
  const opening = f.service.openManagerFolder('windows')
  discovery.resolve([windows])
  await vi.waitFor(() => expect(f.inspectWin).toHaveBeenCalledTimes(2))
  expect(f.opener.openPath).not.toHaveBeenCalled()
  vi.spyOn(f.win, 'isBusy').mockReturnValue(locked)
  inspection.resolve(ready)
  await reading
  const error = module.environmentCommandError(await opening)
  if (locked) {
    expect(error?.code).toBe('busy')
    expect(f.opener.openPath).not.toHaveBeenCalled()
  } else {
    expect(error).toBeNull()
    expect(f.opener.openPath).toHaveBeenCalledExactlyOnceWith(folder)
  }
})

it('keeps a completed log with its environment when the selected backend is recreated', async () => {
  const service = module.createEnvironmentCoordinator({
    platform: 'win32', arch: 'x64', discover: async () => [windows, ubuntu], start: vi.fn(),
    store: { read: async () => windows.id, write: vi.fn() }, changed: vi.fn(), createWsl: vi.fn(),
    createWindows: (changed, history) => createNodeManagementService({
      platform: 'win32', arch: 'x64', changed, history, loadCatalog: async () => [],
      windows: { discover: async () => ({ installation: null, manager: { status: 'missing', version: null },
        installedVersions: [], activeSource: null, activeVersion: null, conflicts: [] }), changeVersion: vi.fn(), installManager: vi.fn() },
    }),
  })
  await service.getState()
  const failed = await service.install('20.0.0')
  expect(failed.operationLog?.length).toBe(1)
  expect((await service.selectEnvironment(ubuntu.id)).operationLog).toBeUndefined()
  const restored = await service.selectEnvironment(windows.id)
  expect(restored.operationLog).toEqual(failed.operationLog)
  expect(restored.operationResult).toEqual(failed.operationResult)
})
