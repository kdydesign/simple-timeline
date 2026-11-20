import {randomUUID} from 'node:crypto'
import type {IpcMainInvokeEvent} from 'electron'
import {expect, it, vi} from 'vitest'
import {registerTermRailSshIpc} from '../../src/main/termrail/ssh-ipc'
import type {TermRailSshService} from '../../src/main/termrail/ssh-service'
import type {TermRailStartup, TermRailStartupFiles} from '../../src/main/termrail/startup-files'

const electron = vi.hoisted(() => ({handle: vi.fn(), removeHandler: vi.fn()}))
vi.mock('electron', () => ({ipcMain: electron}))
const endpoint = {host: 'example.test', port: 22}
const ref = {id: randomUUID(), name: 'setup.sh'}
const startup = {username: 'alice', password: 'private', body: 'pwd'}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return {promise, resolve}
}

function setup(resolve = async () => startup) {
  const ticket = {endpoint, start: vi.fn()}
  const service = {open: vi.fn(), read: vi.fn(), close: vi.fn(), dispose: vi.fn(), prepareProfileStart: vi.fn(() => ticket)}
  const files = {resolve, stage: vi.fn(async () => ({name:ref.name, encrypted:Buffer.from('ciphertext')})),
    bind: vi.fn(async () => ref), discard: vi.fn()}
  const choose = vi.fn(async (): Promise<string | undefined> => '/native/selection.sh')
  const allows = vi.fn(() => true)
  const registration = registerTermRailSshIpc(service as unknown as TermRailSshService, allows,
    files as unknown as TermRailStartupFiles, choose)
  const handler = electron.handle.mock.lastCall![1]
  const invoke = (...args: unknown[]) => handler({} as IpcMainInvokeEvent, ...args)
  return {service, ticket, files, choose, allows, registration, invoke}
}

it('stages only a native selection for its editor and binds on save to a validated endpoint', async () => {
  const {files, choose, allows, invoke, service} = setup()
  const owner = randomUUID()
  allows.mockReturnValueOnce(false)
  await expect(invoke('pickStartup', owner)).rejects.toThrow()
  await expect(invoke('pickStartup', endpoint)).rejects.toThrow()
  await expect(invoke('pickStartup', owner, '/renderer/path')).rejects.toThrow()
  expect(choose).not.toHaveBeenCalled()
  choose.mockResolvedValueOnce(undefined)
  expect(await invoke('pickStartup', owner)).toBeNull()
  expect(files.stage).not.toHaveBeenCalled()
  expect(await invoke('pickStartup', owner)).toBe(ref.name)
  expect(files.bind).not.toHaveBeenCalled()
  expect(service.open).not.toHaveBeenCalled()
  await expect(invoke('bindStartup', randomUUID(), endpoint)).rejects.toThrow()
  await expect(invoke('bindStartup', owner, {...endpoint, host:''})).rejects.toThrow()
  files.bind.mockRejectedValueOnce(Error('save failed'))
  await expect(invoke('bindStartup', owner, endpoint)).rejects.toThrow()
  expect(await invoke('bindStartup', owner, endpoint)).toEqual(ref)
  expect(files.bind).toHaveBeenLastCalledWith(expect.objectContaining({name:ref.name}), endpoint, expect.any(Function))
  await invoke('finishStartup', owner)
  await expect(invoke('bindStartup', owner, endpoint)).rejects.toThrow()
})

it.each(['cancel', 'navigation'])('revokes pending native selection on %s', async action => {
  const {files, choose, registration, invoke} = setup()
  const owner = randomUUID()
  const pending = deferred<string>()
  choose.mockReturnValueOnce(pending.promise)
  const picked = invoke('pickStartup', owner)
  if (action === 'cancel') await invoke('finishStartup', owner)
  else registration.disposeSessions()
  pending.resolve('/native/selection.sh')
  await expect(picked).rejects.toThrow()
  expect(files.stage).not.toHaveBeenCalled()
  await expect(invoke('bindStartup', owner, endpoint)).rejects.toThrow()
})

it('releases replaced selections, preserves the previous choice on picker failure, and drops uncommitted bindings', async () => {
  const {files, choose, invoke} = setup()
  const owner = randomUUID()
  const first = {name:'first.sh', encrypted:Buffer.from([1])}
  const next = {name:'next.sh', encrypted:Buffer.from([2])}
  files.stage.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  await invoke('pickStartup', owner)
  choose.mockRejectedValueOnce(Error('picker closed'))
  await expect(invoke('pickStartup', owner)).rejects.toThrow()
  expect(first.encrypted[0]).toBe(1)
  await invoke('pickStartup', owner)
  expect(first.encrypted[0]).toBe(0)
  const bound = await invoke('bindStartup', owner, endpoint)
  await invoke('finishStartup', owner)
  expect(next.encrypted[0]).toBe(0)
  expect(files.discard).toHaveBeenCalledExactlyOnceWith(bound.id)
})

it('recovers only interrupted bindings unreferenced by the next valid library', async () => {
  const {files, registration, invoke} = setup()
  const kept = {...ref, id:randomUUID()}
  const completed = {...ref, id:randomUUID()}
  const unrelated = randomUUID()
  for (const candidate of [ref, kept, completed]) {
    const owner = randomUUID()
    await invoke('pickStartup', owner)
    files.bind.mockResolvedValueOnce(candidate)
    await invoke('bindStartup', owner, endpoint)
    if (candidate === completed) await invoke('finishStartup', owner, candidate.id)
  }
  registration.disposeSessions()
  expect(files.discard).not.toHaveBeenCalled()
  await invoke('recoverStartup', [kept.id, unrelated])
  expect(files.discard).toHaveBeenCalledExactlyOnceWith(ref.id)
  await invoke('recoverStartup', [])
  expect(files.discard).toHaveBeenCalledOnce()
})

it('waits for decryption before initial reads and passes private values only to the service', async () => {
  const pending = deferred<TermRailStartup>()
  const {service, invoke} = setup(() => pending.promise)
  const id = randomUUID()
  const opened = invoke('open', id, {...endpoint, startupId: ref.id})
  const read = invoke('read', id, 0)
  expect(service.read).not.toHaveBeenCalled()
  pending.resolve(startup)
  expect(await opened).toBeUndefined()
  await read
  expect(service.open).toHaveBeenCalledWith(id, endpoint, startup)
  expect(service.read).toHaveBeenCalledWith(id, 0)
})

it.each(['close', 'navigation', 'barrier'])('cancels a pending open on %s', async reason => {
  const pending = deferred<TermRailStartup>()
  const {service, invoke, registration, allows} = setup(() => pending.promise)
  const id = randomUUID()
  const opened = invoke('open', id, {...endpoint, startupId: ref.id})
  if (reason === 'close') await invoke('close', id)
  if (reason === 'navigation') registration.disposeSessions()
  if (reason === 'barrier') allows.mockReturnValue(false)
  pending.resolve(startup)
  await expect(opened).rejects.toThrow()
  expect(service.open).not.toHaveBeenCalled()
})

it('starts a profile only on the selected live session with its endpoint from main', async () => {
  const resolve = vi.fn(async () => startup)
  const {service, invoke, ticket} = setup(resolve)
  const id = randomUUID()
  await expect(invoke('startProfile', id, ref.id, endpoint)).rejects.toThrow()
  await expect(invoke('startProfile', id, '../path')).rejects.toThrow()
  expect(resolve).not.toHaveBeenCalled()
  expect(await invoke('startProfile', id, ref.id)).toBeUndefined()
  expect(service.prepareProfileStart).toHaveBeenCalledExactlyOnceWith(id)
  expect(resolve).toHaveBeenCalledExactlyOnceWith(ref.id, ticket.endpoint)
  expect(ticket.start).toHaveBeenCalledExactlyOnceWith(startup)
  expect(service.open).not.toHaveBeenCalled()
})

it.each(['navigation', 'barrier'])('revokes a protected profile start during decryption on %s', async reason => {
  const pending = deferred<TermRailStartup>()
  const {ticket, registration, allows, invoke} = setup(() => pending.promise)
  const requested = invoke('startProfile', randomUUID(), ref.id)
  expect(ticket.start).not.toHaveBeenCalled()
  if (reason === 'navigation') registration.disposeSessions()
  else allows.mockReturnValue(false)
  pending.resolve(startup)
  await expect(requested).rejects.toThrow()
  expect(ticket.start).not.toHaveBeenCalled()
})
