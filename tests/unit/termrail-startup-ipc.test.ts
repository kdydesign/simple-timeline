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
function delayedStartup() {
  let resolve!: (value: TermRailStartup) => void
  const promise = new Promise<TermRailStartup>(finish => { resolve = finish })
  return {promise, resolve}
}

function setup(resolve = async () => startup) {
  const ticket = {endpoint, start: vi.fn()}
  const service = {open: vi.fn(), read: vi.fn(), close: vi.fn(), dispose: vi.fn(), prepareProfileStart: vi.fn(() => ticket)}
  const files = {resolve, importFile: vi.fn(async () => ref), discard: vi.fn()}
  const choose = vi.fn(async (): Promise<string | undefined> => '/native/selection.sh')
  const allows = vi.fn(() => true)
  const registration = registerTermRailSshIpc(service as unknown as TermRailSshService, allows,
    files as unknown as TermRailStartupFiles, choose)
  const handler = electron.handle.mock.lastCall![1]
  const invoke = (...args: unknown[]) => handler({} as IpcMainInvokeEvent, ...args)
  return {service, ticket, files, choose, allows, registration, invoke}
}

it('accepts native selection only and fences it behind the sender and endpoint checks', async () => {
  const {files, choose, allows, invoke} = setup()
  allows.mockReturnValueOnce(false)
  await expect(invoke('pickStartup', endpoint)).rejects.toThrow()
  await expect(invoke('pickStartup', {...endpoint, host: ''})).rejects.toThrow()
  await expect(invoke('pickStartup', endpoint, '/renderer/path')).rejects.toThrow()
  expect(choose).not.toHaveBeenCalled()
  choose.mockResolvedValueOnce(undefined)
  expect(await invoke('pickStartup', endpoint)).toBeNull()
  expect(files.importFile).not.toHaveBeenCalled()
  expect(await invoke('pickStartup', endpoint)).toEqual(ref)
  expect(files.importFile).toHaveBeenCalledWith('/native/selection.sh', endpoint, expect.any(Function))
  await invoke('discardStartup', ref.id)
  expect(files.discard).toHaveBeenCalledWith(ref.id)
})

it('waits for decryption before initial reads and passes private values only to the service', async () => {
  const pending = delayedStartup()
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
  const pending = delayedStartup()
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
  const pending = delayedStartup()
  const {ticket, registration, allows, invoke} = setup(() => pending.promise)
  const requested = invoke('startProfile', randomUUID(), ref.id)
  expect(ticket.start).not.toHaveBeenCalled()
  if (reason === 'navigation') registration.disposeSessions()
  else allows.mockReturnValue(false)
  pending.resolve(startup)
  await expect(requested).rejects.toThrow()
  expect(ticket.start).not.toHaveBeenCalled()
})
