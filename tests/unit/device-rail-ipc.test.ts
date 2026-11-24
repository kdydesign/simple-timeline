import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {BrowserWindow, IpcMainInvokeEvent} from 'electron'
import {registerDeviceRailIpc} from '../../src/main/devicerail/ipc'
import type {RailDevice} from '../../src/shared/device-rail'

const mocks = vi.hoisted(() => ({
  handle:vi.fn(), removeHandler:vi.fn(), showMessageBox:vi.fn(), createService:vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain:{handle:mocks.handle, removeHandler:mocks.removeHandler},
  dialog:{showMessageBox:mocks.showMessageBox},
}))
vi.mock('../../src/main/devicerail/service', () => ({createDeviceService:mocks.createService}))

const url = 'file:///app/index.html'
const frame = {url}
const sender = {mainFrame:frame, isDestroyed:()=>false, send:vi.fn()}
const window = {webContents:sender, isDestroyed:()=>false} as unknown as BrowserWindow
const event = {sender, senderFrame:frame} as unknown as IpcMainInvokeEvent
const device: RailDevice = {id:'d1', name:'실험 장비', host:'127.0.0.1', port:2222,
  service:{kind:'none'}, description:'', location:'', favorite:true,
  macros:[{id:'m1',name:'작업 위치',commands:'pwd\ndate'}]}
const service = {
  snapshot:vi.fn(), refresh:vi.fn(), suspend:vi.fn(), resume:vi.fn(), save:vi.fn(), remove:vi.fn(), runMacro:vi.fn(),
  trust:vi.fn(), login:vi.fn(), disconnect:vi.fn(), close:vi.fn(),
}
let blocked: boolean
let ipc: ReturnType<typeof registerDeviceRailIpc>
let handle: (e: Partial<IpcMainInvokeEvent>, method: string, ...args:unknown[]) => Promise<unknown>
const invoke = (method:string, ...args:unknown[]) => handle(event, method, ...args)

describe('DeviceRail IPC', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    blocked = false
    mocks.createService.mockReturnValue(service)
    service.snapshot.mockReturnValue({devices:[device], macroState:{}, health:{}})
    ipc = registerDeviceRailIpc(window, url, '/test-profile', () => blocked)
    handle = mocks.handle.mock.lastCall![1]
  })

  it('rejects a child frame, blocked writes and malformed commands before dispatch', async () => {
    await expect(handle({...event,senderFrame:{url} as IpcMainInvokeEvent['senderFrame']}, 'snapshot')).rejects.toThrow()
    await expect(invoke('login',device.id,'r1',['fake'],'secret')).rejects.toThrow()
    await expect(invoke('runMacro',device.id,'m1', {confirmed:true})).rejects.toThrow()
    blocked = true
    await expect(invoke('save',device)).rejects.toThrow()
    expect(service.save).not.toHaveBeenCalled()
    expect(service.login).not.toHaveBeenCalled()
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
    expect(await invoke('snapshot')).toHaveProperty('devices',[device])
  })

  it('shows the stored endpoint and script and runs only after native confirmation', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({response:0}).mockResolvedValueOnce({response:1})
    await invoke('runMacro',device.id,'m1')
    expect(mocks.showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({
      detail:expect.stringContaining('127.0.0.1:2222'), defaultId:0, cancelId:0,
    }))
    const options = mocks.showMessageBox.mock.lastCall![1]
    expect(options.detail).toContain(device.macros[0].commands)
    expect(JSON.stringify(options)).toContain(device.name)
    expect(service.runMacro).not.toHaveBeenCalled()
    await invoke('runMacro',device.id,'m1')
    expect(service.runMacro).toHaveBeenCalledExactlyOnceWith(device.id,'m1')
  })

  it('rejects a second request during approval and a script replaced while the prompt is open', async () => {
    let confirm!: (value:{response:number})=>void
    mocks.showMessageBox.mockImplementation(() => new Promise(resolve=>{confirm=resolve}))
    const pending = invoke('runMacro',device.id,'m1')
    await expect(invoke('runMacro',device.id,'m1')).rejects.toThrow()
    service.snapshot.mockReturnValue({devices:[{...device,macros:[{...device.macros[0],commands:'uname'}]}],health:{},macroState:{}})
    confirm({response:1})
    await expect(pending).rejects.toThrow()
    expect(service.runMacro).not.toHaveBeenCalled()
  })

  it('refuses a run click on a busy device before displaying another prompt', async () => {
    service.snapshot.mockReturnValue({devices:[device],health:{},macroState:{d1:{runs:[{phase:'running'}]}}})
    await expect(invoke('runMacro',device.id,'m1')).rejects.toThrow()
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
    expect(service.runMacro).not.toHaveBeenCalled()
  })

  it('starts monitoring before any renderer request and releases it once on shutdown', async () => {
    expect(mocks.createService).toHaveBeenCalledOnce()
    ipc.suspend()
    expect(service.suspend).toHaveBeenCalledOnce()
    ipc.resume()
    expect(service.resume).toHaveBeenCalledOnce()
    ipc.shutdown()
    ipc.dispose()
    ipc.suspend()
    expect(service.suspend).toHaveBeenCalledOnce()
    ipc.resume()
    await expect(invoke('snapshot')).rejects.toThrow()
    expect(service.resume).toHaveBeenCalledOnce()
    expect(service.close).toHaveBeenCalledOnce()
    expect(mocks.removeHandler).toHaveBeenCalledOnce()
  })

  it('coalesces change notifications and only signals the trusted main document', () => {
    vi.useFakeTimers()
    try {
      const changed = mocks.createService.mock.lastCall![1]
      changed()
      changed()
      vi.advanceTimersByTime(100)
      expect(sender.send).toHaveBeenCalledExactlyOnceWith('devicerail:changed')
      frame.url = 'file:///app/help.html'
      changed()
      vi.advanceTimersByTime(100)
      expect(sender.send).toHaveBeenCalledOnce()
    } finally {
      ipc.dispose()
      frame.url = url
      vi.useRealTimers()
    }
  })
})
