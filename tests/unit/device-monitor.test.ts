import {createServer as httpServer} from 'node:http'
import {createServer as httpsServer} from 'node:https'
import {createHostIdentity} from '../../src/main/sharing/identity'
import type {DeviceHealth, RailDevice} from '../../src/shared/device-rail'
import {createServer, type Server} from 'node:net'
import {afterEach, expect, it} from 'vitest'
import {DeviceMonitor, probeHttp, probeSsh, probeTcp, type ProbeResult} from '../../src/main/devicerail/monitor'

const servers: Server[] = []
async function listen(server: Server) {
  // A successful TCP probe closes immediately, which can reset the fixture's write.
  server.on('connection', socket => socket.on('error', error => {
    if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') throw error
  }))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('테스트 포트가 없습니다.')
  return address.port
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

it('accepts an SSH identification split across packets and sends no login', async () => {
  let received = ''
  const port = await listen(createServer(socket => {
    socket.on('data', data => { received += String(data) })
    socket.write('Welcome\r\nSSH-2.0-')
    setImmediate(() => socket.end('test_device\r\n'))
  }))
  expect(await probeSsh('127.0.0.1', port, AbortSignal.timeout(3000))).toMatchObject({ok:true})
  expect(received).toBe('')
})

it('distinguishes a non-SSH service from an open TCP port and respects the deadline', async () => {
  const port = await listen(createServer(socket => socket.end('HTTP/1.1 200 OK\r\n\r\n')))
  expect(await probeSsh('127.0.0.1', port, AbortSignal.timeout(3000))).toMatchObject({ok:false, detail:expect.stringContaining('SSH')})
  expect(await probeTcp('127.0.0.1', port, AbortSignal.timeout(3000))).toMatchObject({ok:true})
  const silent = await listen(createServer(socket => socket.resume()))
  expect(await probeSsh('127.0.0.1', silent, AbortSignal.timeout(150))).toMatchObject({ok:false, detail:expect.stringContaining('시간')})
})

it.each([200,204,302,401,403,503])('uses the direct HTTP response status %s as the service result', async code => {
  const port = await listen(httpServer((_request, response) => {
    response.writeHead(code, {Location:'/elsewhere'}).end()
  }))
  const result = await probeHttp('http://127.0.0.1:' + port + '/', AbortSignal.timeout(3000))
  expect(result.ok).toBe(code >= 200 && code < 300)
  expect(result.detail).toContain(String(code))
  if (code === 401 || code === 403) expect(result.detail).toMatch(/인증|권한/)
})

it('rejects a product HTTPS endpoint with an untrusted certificate', async () => {
  const identity = await createHostIdentity('11111111-1111-4111-8111-111111111111')
  const port = await listen(httpsServer({key:identity.privateKey,cert:identity.certificate},
    (_request,response) => response.writeHead(204).end()))
  expect(await probeHttp('https://127.0.0.1:' + port, AbortSignal.timeout(3000)))
    .toMatchObject({ok:false,detail:expect.stringContaining('TLS')})
})

const device: RailDevice = {id:'dev',name:'장비',host:'host.local',port:22,location:'',description:'',
  service:{kind:'tcp',port:8000},favorite:true,macros:[]}
function controlledMonitor() {
  const calls: {axis: 'ssh'|'service'; device:RailDevice; signal:AbortSignal; finish:(ok:boolean)=>void}[] = []
  const rounds: {device:RailDevice; results:Partial<Record<keyof DeviceHealth, ProbeResult>>}[] = []
  const monitor = new DeviceMonitor(() => {}, (device, axis, signal) => new Promise<ProbeResult>(resolve => {
    calls.push({device,axis,signal,finish: ok => resolve({ok,detail:ok?'성공':'실패'})})
  }), (device, results) => rounds.push({device,results}))
  return {monitor,calls,rounds}
}
it('coalesces repeated checks while preserving the prior observation, and rejects late results from an edited endpoint', async () => {
  const {monitor,calls} = controlledMonitor()
  monitor.set(device)
  const initial = monitor.refresh(device.id)
  expect(calls.length).toBe(2)
  calls[0].finish(true)
  calls[1].finish(false)
  await initial
  const observed = monitor.health(device.id)
  expect(observed.ssh.state).toBe('ok')
  expect(observed.service.state).toBe('failed')
  const beforeEdit = monitor.refresh()
  expect(monitor.health(device.id).ssh).toEqual({...observed.ssh,checking:true})
  monitor.set({...device,host:'other.local',service:{kind:'none'}})
  const afterEdit = monitor.refresh(device.id)
  expect(calls.length).toBe(5)
  expect(calls[2].signal.aborted).toBe(true)
  expect(calls[3].signal.aborted).toBe(true)
  calls[4].finish(false)
  await afterEdit
  calls[2].finish(true)
  calls[3].finish(true)
  await beforeEdit
  expect(monitor.health(device.id).ssh).toMatchObject({state:'failed', lastSuccessAt:null, checking:false})
  expect(monitor.health(device.id).service).toMatchObject({state:'unconfigured', checkedAt:null})
  monitor.close()
})

it('limits simultaneous probes and drops removed queued and active work on close', async () => {
  const {monitor,calls,rounds} = controlledMonitor()
  for (let i = 0; i < 20; i++) monitor.set({...device,id:String(i)})
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.length).toBeLessThan(40)
  const running = calls.length
  monitor.remove('19')
  const all = monitor.refresh()
  monitor.close()
  expect(calls.every(call => call.signal.aborted)).toBe(true)
  for (const call of calls) call.finish(false)
  await all
  expect(calls.length).toBe(running)
  expect(rounds).toEqual([])
})

it.each([true, false])('discards pre-sleep probes and keeps the last completed observation on wake (suspend event %s)', async withSuspend => {
  const {monitor,calls,rounds} = controlledMonitor()
  monitor.set(device)
  const initial = monitor.refresh()
  calls[0].finish(true)
  calls[1].finish(false)
  await initial
  const last = monitor.health(device.id)

  const beforeSleep = monitor.refresh()
  if (withSuspend) {
    monitor.suspend()
    expect(monitor.health(device.id)).toEqual(last)
    await monitor.refresh()
    expect(calls).toHaveLength(4)
  }
  const wake = monitor.resume()
  expect(calls.slice(2,4).every(call => call.signal.aborted)).toBe(true)
  expect(calls).toHaveLength(6)
  expect(monitor.health(device.id).ssh).toEqual({...last.ssh,checking:true})
  calls[2].finish(false)
  calls[3].finish(true)
  await beforeSleep
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(monitor.health(device.id).service).toEqual({...last.service,checking:true})
  const simultaneous = monitor.refresh()
  expect(calls).toHaveLength(6)
  calls[4].finish(false)
  calls[5].finish(true)
  await Promise.all([wake, simultaneous])
  expect(rounds).toHaveLength(2)
  expect(rounds[1].results).toEqual({ssh:{ok:false,detail:'실패'},service:{ok:true,detail:'성공'}})
  expect(monitor.health(device.id).ssh).toMatchObject({state:'failed', checking:false, lastSuccessAt:last.ssh.lastSuccessAt})
  expect(monitor.health(device.id).service).toMatchObject({state:'ok', checking:false})
  monitor.close()
})

it('publishes one round per device, shows early results, and coalesces a refresh between axis completions', async () => {
  const {monitor,calls,rounds} = controlledMonitor()
  monitor.set(device)
  const other = {...device,id:'other',service:{kind:'none'} as const}
  monitor.set(other)
  calls[0].finish(false)
  calls[2].finish(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(monitor.health(device.id).ssh.state).toBe('failed')
  expect(rounds).toEqual([{device:other,results:{ssh:{ok:true,detail:'성공'}}}])
  const again = monitor.refresh(device.id)
  expect(calls).toHaveLength(3)
  const renamed = {...device,name:'새 이름'}
  monitor.set(renamed)
  calls[1].finish(false)
  await again
  expect(rounds).toHaveLength(2)
  expect(rounds[1]).toEqual({device:renamed,results:{ssh:{ok:false,detail:'실패'},service:{ok:false,detail:'실패'}}})
  const manual = monitor.refresh(device.id)
  calls[3].finish(true)
  calls[4].finish(true)
  await manual
  expect(rounds).toHaveLength(3)
  monitor.close()
})

it('uses only current probe targets when a service is replaced during a check', async () => {
  const {monitor,calls,rounds} = controlledMonitor()
  monitor.set(device)
  calls[0].finish(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  const edited = {...device,service:{kind:'tcp',port:9000} as const}
  monitor.set(edited)
  const refreshed = monitor.refresh(device.id)
  expect(calls).toHaveLength(3)
  expect(calls[1].signal.aborted).toBe(true)
  calls[1].finish(false)
  calls[2].finish(true)
  await refreshed
  expect(rounds).toEqual([{device:edited,results:{ssh:{ok:false,detail:'실패'},service:{ok:true,detail:'성공'}}}])
  const next = {...edited,service:{kind:'tcp',port:9001} as const}
  monitor.set(next)
  expect(calls).toHaveLength(4)
  calls[3].finish(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(rounds[1]).toEqual({device:next,results:{service:{ok:false,detail:'실패'}}})
  monitor.close()
})

it('discards alert results across a toggle while keeping observations current', async () => {
  const {monitor,calls,rounds} = controlledMonitor()
  const enabled = {...device,alertsEnabled:true}
  monitor.set(enabled)
  calls[0].finish(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  monitor.set({...enabled,alertsEnabled:false})
  monitor.set(enabled)
  const stale = monitor.refresh()
  calls[1].finish(false)
  await stale
  expect(monitor.health(device.id).service.state).toBe('failed')
  expect(rounds).toEqual([])
  const fresh = monitor.refresh()
  calls[2].finish(false)
  calls[3].finish(false)
  await fresh
  expect(rounds).toEqual([{device:enabled,results:{ssh:{ok:false,detail:'실패'},service:{ok:false,detail:'실패'}}}])
  monitor.close()
})

it.each([true, false])('records a completed recovery when sleep interrupts the peer probe (suspend event %s)', async withSuspend => {
  const {monitor,calls,rounds} = controlledMonitor()
  monitor.set(device)
  const first = monitor.refresh()
  calls[0].finish(false)
  calls[1].finish(false)
  await first

  const interrupted = monitor.refresh()
  calls[2].finish(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(monitor.health(device.id).ssh.state).toBe('ok')
  expect(rounds).toHaveLength(1)
  if (withSuspend) monitor.suspend()
  const wake = monitor.resume()
  expect(calls[3].signal.aborted).toBe(true)
  calls[3].finish(false)
  await interrupted
  expect(rounds.map(round => round.results)).toEqual([
    {ssh:{ok:false,detail:'실패'},service:{ok:false,detail:'실패'}},
    {ssh:{ok:true,detail:'성공'}},
  ])

  calls[4].finish(false)
  calls[5].finish(true)
  await wake
  expect(rounds).toHaveLength(3)
  expect(rounds[2].results).toEqual({ssh:{ok:false,detail:'실패'},service:{ok:true,detail:'성공'}})
  monitor.close()
})

it('flushes only still-eligible completed observations on close', async () => {
  const {monitor,calls,rounds} = controlledMonitor()
  const removed = {...device,id:'removed'}
  const toggled = {...device,id:'toggled',alertsEnabled:true}
  for (const item of [device,removed,toggled]) monitor.set(item)
  const checking = monitor.refresh()
  for (const call of calls.filter(call => call.axis === 'service')) call.finish(false)
  await new Promise<void>(resolve => setImmediate(resolve))
  monitor.remove(removed.id)
  monitor.set({...toggled,alertsEnabled:false})
  monitor.set(toggled)
  monitor.close()
  expect(rounds).toEqual([{device,results:{service:{ok:false,detail:'실패'}}}])
  for (const call of calls.filter(call => call.axis === 'ssh')) call.finish(true)
  await checking
  expect(rounds).toHaveLength(1)
})
