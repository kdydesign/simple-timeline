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
  const service = module.createEnvironmentCoordinator({
    platform: 'win32', arch: 'x64', discover, store, start, changed, createWindows: () => win, createWsl: () => guest,
  })
  return { service, inspectWin, inspectGuest, start, discover, store, guest, win, changed }
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
  const selected = await service.selectEnvironment(ubuntu.id)
  pending.resolve({ ...selected, installedVersions: ['0.0.1'] })
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
