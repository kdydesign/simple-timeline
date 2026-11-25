import {once} from 'node:events'
import {mkdtempSync, rmSync} from 'node:fs'
import {createServer, type AddressInfo} from 'node:net'
import {createServer as createHttpServer} from 'node:http'
import type {ReminderSender} from '../../src/main/reminders/engine'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, it, vi} from 'vitest'
import type {RailDevice} from '../../src/shared/device-rail'
import {createDeviceService} from '../../src/main/devicerail/service'

afterEach(() => vi.useRealTimers())

it('checks registered devices at startup and every 30 seconds until closed; favorites and snapshots share the same observations', async () => {
  vi.useFakeTimers({toFake:['setInterval','clearInterval']})
  const profile = mkdtempSync(join(tmpdir(), 'workrail-device-service-'))
  let connections = 0
  const server = createServer(socket => {
    connections++
    socket.end('SSH-2.0-TestDevice\r\n')
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('테스트 서버 포트가 없습니다.')
  const device: RailDevice = {id:'', name:'로컬 장비', host:'127.0.0.1', port:address.port, location:'',description:'',
    favorite:true, service:{kind:'none'}, macros:[{id:'a', name:'예시', commands:'pwd'}]}
  let service = createDeviceService(profile, () => {})
  try {
    const registrationProbe = once(server, 'connection')
    service.save(device)
    await registrationProbe
    await service.refresh()
    const saved = service.snapshot().devices[0]
    expect(service.snapshot().health[saved.id]).toMatchObject({ssh:{state:'ok'}, service:{state:'unconfigured'}})
    service.save({...saved,favorite:false})
    expect(service.snapshot().health[saved.id].ssh.state).toBe('ok')
    const scheduledProbe = once(server, 'connection')
    vi.advanceTimersByTime(30_000)
    await scheduledProbe
    await service.refresh()
    expect(connections).toBe(2)
    service.suspend()
    vi.advanceTimersByTime(75_000)
    await service.refresh()
    expect(vi.getTimerCount()).toBe(0)
    expect(connections).toBe(2)
    const resumeProbe = once(server, 'connection')
    service.resume()
    await resumeProbe
    await service.refresh()
    expect(connections).toBe(3)
    vi.advanceTimersByTime(5_000)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(service.snapshot().health[saved.id].ssh.checking).toBe(false)
    expect(connections).toBe(3)
    expect(service.snapshot().macroState[saved.id].runs).toEqual([])
    service.close()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    const startupProbe = once(server, 'connection')
    service = createDeviceService(profile, () => {})
    await startupProbe
    await service.refresh()
    expect(connections).toBe(4)
    expect(service.snapshot().devices).toEqual([{...saved,favorite:false}])
    expect(() => service.runMacro(saved.id,'other')).toThrow()
    service.remove(saved.id)
    expect(() => service.runMacro(saved.id,'a')).toThrow()
    expect(service.snapshot().devices).toEqual([])
    expect(service.snapshot().health).toEqual({})
  } finally {
    service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(profile,{recursive:true, force:true})
  }
})

it('sends only confirmed device incidents, combining results per device, honoring mute and retaining sent claims on restart', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'workrail-device-alert-'))
  let muted = true
  let sshOk = false
  let serviceOk = false
  const ssh = createServer(socket => socket.end(sshOk ? 'SSH-2.0-Test\r\n' : 'HTTP/1.1 400\r\n'))
  const http = createHttpServer((_request, response) => response.writeHead(serviceOk ? 204 : 503).end())
  const listen = (server: typeof ssh) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
  const [port, servicePort] = await Promise.all([listen(ssh), listen(http)])
  const send = vi.fn<ReminderSender>().mockResolvedValue('submitted')
  const notifications = {muted:() => muted, send, open:() => {}}
  let service = createDeviceService(profile, () => {}, notifications)
  try {
    service.save({id:'', name:'검증 장비', host:'127.0.0.1', port, location:'', description:'', favorite:false,
      service:{kind:'http', url:'http://127.0.0.1:' + servicePort}, alertsEnabled:true, macros:[]})
    await service.refresh() // join registration
    await service.refresh()
    expect(send).not.toHaveBeenCalled()
    muted = false
    await service.refresh()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({title:'검증 장비 · 장비 이상',body:expect.stringMatching(/SSH.*\n제품 서비스 · HTTP 503/)})
    service.close()
    service = createDeviceService(profile, () => {}, notifications)
    await service.refresh()
    await service.refresh()
    expect(send).toHaveBeenCalledTimes(1)
    serviceOk = true
    await service.refresh()
    serviceOk = false
    await service.refresh()
    expect(send).toHaveBeenCalledTimes(1)
    await service.refresh()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].body).toBe('제품 서비스 · HTTP 503')
    sshOk = true
    await service.refresh()
  } finally {
    service.close()
    await Promise.all([ssh, http].map(server => new Promise<void>(resolve => server.close(()=>resolve()))))
    rmSync(profile, {recursive:true, force:true})
  }
})
