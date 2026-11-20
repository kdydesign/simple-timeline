import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {BrowserWindow, IpcMainInvokeEvent} from 'electron'
import {registerPostRailIpc} from '../../src/main/postrail/ipc'
import type {PrLibrary, PrRequest} from '../../src/shared/postrail'
import type {PrRunState} from '../../src/shared/postrail-run'

const electron = vi.hoisted(() => ({
  ipcMain:{handle:vi.fn(), removeHandler:vi.fn()},
  safeStorage:{isEncryptionAvailable:()=>false},
  session:{fromPartition:vi.fn()},
  dialog:{showMessageBox:vi.fn()},
}))
vi.mock('electron', () => electron)
const frame = {url:'file:///app/index.html'}
const sender = {mainFrame:frame, isDestroyed:()=>false, send:vi.fn()}
const window = {webContents:sender, isDestroyed:()=>false} as unknown as BrowserWindow
const event = {sender, senderFrame:frame} as unknown as IpcMainInvokeEvent
const request: PrRequest = {
  id:'', name:'조회', groupId:null, method:'GET', url:'http://site.test/samples', headers:{},
  body:'', useAuth:false, timeoutMs:null, favorite:false, nextIndex:'1',
}
let dir: string
let blocked: boolean
let service: ReturnType<typeof registerPostRailIpc>
let handle: (e: Partial<IpcMainInvokeEvent>, method: string, ...args: unknown[]) => Promise<unknown>
const invoke = (method: string, ...args: unknown[]) => handle(event, method, ...args)

describe('PostRail IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    blocked = false
    dir = mkdtempSync(join(tmpdir(), 'workrail-postrail-ipc-'))
    service = registerPostRailIpc(window, frame.url, dir, () => blocked)
    handle = electron.ipcMain.handle.mock.lastCall![1]
  })
  afterEach(async () => {
    await service.shutdown()
    service.dispose()
    rmSync(dir, {recursive:true, force:true})
  })
  async function setup() {
    const library = await invoke('mutate', {type:'env.save', environment:{
      id:'', name:'개발', variables:{}, apiOrigin:'', loginUrl:'', loginHeaders:{},
      loginBody:'', tokenPath:'token', tokenHeader:'Authorization', tokenPrefix:'Bearer ', hasPassword:false,
    }}) as PrLibrary
    const saved = await invoke('mutate', {type:'request.save', request}) as PrLibrary
    return {request:saved.requests[0], environmentId:library.environmentId!, count:'1'}
  }

  it('rejects other frames and blocked changes before opening a network session', async () => {
    blocked = true
    await expect(handle({}, 'read')).rejects.toThrow()
    await expect(handle({...event, senderFrame:null}, 'read')).rejects.toThrow()
    await expect(invoke('start', {})).rejects.toThrow()
    expect(electron.session.fromPartition).not.toHaveBeenCalled()
  })

  it('requires native approval of the actual HTTP address, even if the renderer supplies approval flags', async () => {
    const input = await setup()
    electron.dialog.showMessageBox.mockResolvedValue({response:0})
    expect(await invoke('start', {...input, allowPlaintext:true, approvedHttpUrls:[request.url]})).toBeNull()
    expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({
      buttons:['취소','보내기'], cancelId:0, defaultId:0, detail:expect.stringContaining(request.url),
    }))
    expect(electron.session.fromPartition).not.toHaveBeenCalled()
    const transport = vi.fn(async () => new Response('ok'))
    electron.session.fromPartition.mockReturnValue({fetch:transport})
    electron.dialog.showMessageBox.mockResolvedValue({response:1})
    const started = await invoke('start', input) as PrRunState
    await vi.waitFor(async () => expect(await invoke('state')).toMatchObject({phase:'completed'}))
    expect(electron.session.fromPartition).toHaveBeenCalledWith('postrail', {cache:false})
    expect(transport).toHaveBeenCalledWith(request.url, expect.objectContaining({
      credentials:'omit', redirect:'manual', bypassCustomProtocolHandlers:true,
    }))
    expect(await invoke('detail', '1', started.runId)).toMatchObject({body:'ok'})
    expect(await invoke('detail', '1', 'previous-run')).toBeNull()
    expect(await invoke('page', '0', 'previous-run')).toEqual([])
    expect(sender.send.mock.calls.every(call => call.length === 2 && ['run','library'].includes(call[1]))).toBe(true)
  })

  it('prevents duplicate sends and rejects an approval after a shutdown or update begins', async () => {
    const input = await setup()
    let accept!: (result:{response:number}) => void
    electron.dialog.showMessageBox.mockImplementation(() => new Promise(resolve => {accept=resolve}))
    const sending = invoke('start', input)
    await expect(invoke('start', input)).rejects.toThrow()
    blocked = true
    accept({response:1})
    await expect(sending).rejects.toThrow()
    expect(electron.session.fromPartition).not.toHaveBeenCalled()
    blocked = false
    const next = invoke('start', input)
    await service.shutdown()
    accept({response:1})
    await expect(next).rejects.toThrow()
    await expect(invoke('mutate', {type:'request.delete', id:input.request.id})).rejects.toThrow()
    expect(electron.session.fromPartition).not.toHaveBeenCalled()
  })

  it('protects an active request from deletion until the in-flight response completes', async () => {
    const input = await setup()
    let finish!: (response:Response) => void
    const transport = vi.fn(() => new Promise<Response>(resolve => {finish=resolve}))
    electron.session.fromPartition.mockReturnValue({fetch:transport})
    electron.dialog.showMessageBox.mockResolvedValue({response:1})
    await invoke('start', input)
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce())
    try {
      await expect(invoke('mutate', {type:'request.delete', id:input.request.id})).rejects.toThrow()
    } finally {
      finish(new Response('done'))
    }
    await vi.waitFor(async () => expect(await invoke('state')).toMatchObject({phase:'completed'}))
    expect(await invoke('mutate', {type:'request.delete', id:input.request.id})).toMatchObject({requests:[]})
  })

  it('retains tokens across selection and unrelated edits, then invalidates changed login credentials', async () => {
    const input = await setup()
    const library = await invoke('read') as PrLibrary
    const environment = {...library.environments[0], variables:{user:'worker',device:'a'},
      apiOrigin:'https://site.test', loginUrl:'https://identity.test/login', loginBody:'{"user":"${user}","password":"${password}"}'}
    await invoke('mutate', {type:'env.save', environment, password:'session password'})
    const auth = {...input, request:{...input.request, url:'https://site.test/samples', useAuth:true}}
    const transport = vi.fn(async (url:string) => new Response(url === environment.loginUrl ? '{"token":"fixture"}' : 'ok'))
    electron.session.fromPartition.mockReturnValue({fetch:transport})
    async function send() {
      await invoke('start', auth)
      await vi.waitFor(async () => expect(await invoke('state')).toMatchObject({
        phase:'completed', authenticatedEnvironmentIds:[environment.id],
      }))
    }
    const loggedIn = () => transport.mock.calls.filter(([url]) => url === environment.loginUrl).length
    await send()
    const extra = await invoke('mutate', {type:'env.save', environment:{...environment, id:'', name:'QA'}}) as PrLibrary
    expect(extra.environmentId).not.toBe(environment.id)
    await invoke('mutate', {type:'env.select',id:environment.id})
    environment.variables.device = 'b'
    await invoke('mutate', {type:'env.save', environment})
    await send()
    expect(loggedIn()).toBe(1)
    environment.variables.user = 'new-user'
    await invoke('mutate', {type:'env.save', environment})
    await send()
    expect(loggedIn()).toBe(2)
    await invoke('mutate', {type:'env.save', environment, password:'new session password'})
    await send()
    expect(loggedIn()).toBe(3)
    await invoke('logout', environment.id)
    expect(await invoke('state')).toMatchObject({authenticatedEnvironmentIds:[]})
  })

  it('redacts underlying storage errors and forwards useful validation messages', async () => {
    writeFileSync(join(dir,'postrail.sqlite'), 'private-damaged-database')
    await expect(invoke('read')).rejects.toThrow('PostRail 작업을 완료할 수 없습니다.')
    rmSync(join(dir,'postrail.sqlite'))
    await expect(invoke('mutate', {type:'group.save', name:'  '})).rejects.toThrow('이름과 필수 입력값을 확인하세요.')
  })
})
