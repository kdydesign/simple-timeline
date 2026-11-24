import {once} from 'node:events'
import {mkdtempSync, rmSync} from 'node:fs'
import {createServer} from 'node:net'
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
