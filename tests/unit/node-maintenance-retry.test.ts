import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { createNodeMaintenanceController } from '../../src/main/node-maintenance/controller'

const launch = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: launch }))
vi.mock('../../src/main/node-maintenance/runtime', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/main/node-maintenance/runtime')>(),
  prepareMaintenance: async () => ({ executable: 'electron.exe', appDirectory: 'app', directory: 'recovery', artifactId: 'bundle' }),
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  vi.useRealTimers()
  launch.mockReset()
})

function setup() {
  vi.useFakeTimers()
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  const child = Object.assign(new EventEmitter(), {
    pid: 42, connected: true, exitCode: null, unref: vi.fn(),
    send: vi.fn((_message: unknown, done: (error: Error | null) => void) => done(null)),
  })
  launch.mockReturnValue(child)
  const controller = createNodeMaintenanceController({runtimeDirectory:'runtime', buildDirectory:'build', maintenanceRoot:'root', version:'1.0.0'})
  return {child, controller}
}

it('retries a late handoff against the same child and only accepts its original session',async()=>{
  const {child,controller}=setup()
  const first=expect(controller.open()).rejects.toThrow(/준비 응답/)
  await vi.advanceTimersByTimeAsync(30_000)
  await first
  expect(controller.isActive()).toBe(true)
  const session=launch.mock.calls[0][1][1].split('=')[1]
  const ready={type:'ready',artifactId:'bundle',pid:42,session,rendererReady:true,shortcutReady:true,recoveryShortcut:'recover.lnk'}
  child.emit('message',ready)
  expect(child.send).not.toHaveBeenCalled()
  const retry=controller.open()
  expect(controller.open()).toBe(retry)
  expect(child.send.mock.calls[0][0]).toEqual({type:'focus'})
  child.emit('message',{...ready,session:'other'})
  expect(child.send).toHaveBeenCalledTimes(1)
  child.emit('message',ready)
  await expect(retry).resolves.toMatchObject({ready:true,pid:42})
  expect(child.send.mock.calls[1][0]).toEqual({type:'accepted',session,artifactId:'bundle'})
  expect(controller.getState().status).toBe('ready')
  expect(launch).toHaveBeenCalledOnce()
})

it('cancels the readiness wait on disconnect and keeps the live child reserved',async()=>{
  const {child,controller}=setup()
  const pending=controller.open()
  await vi.advanceTimersByTimeAsync(0)
  child.connected=false
  child.emit('disconnect')
  const result=expect(pending).rejects.toThrow(/복구 창과 통신/)
  await vi.advanceTimersByTimeAsync(30_000)
  await result
  expect(controller.isActive()).toBe(true)
  await expect(controller.open()).rejects.toThrow(/복구 창과 통신/)
  expect(launch).toHaveBeenCalledOnce()
})
