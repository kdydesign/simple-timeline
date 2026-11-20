import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { PostRailRunner } from '../../src/main/postrail/runner'
import type { PrEnv, PrRequest } from '../../src/shared/postrail'
import { postRailBusy, usesPostRailIndex } from '../../src/shared/postrail-run'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture(serve: (url: string, body: string, req: IncomingMessage, res: ServerResponse) => void, onChange?: () => void) {
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    serve(req.url!, Buffer.concat(chunks).toString(), req, res)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('server address')
  const origin = 'http://127.0.0.1:' + address.port
  cleanup.push(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed })
  const environment: PrEnv = {
    id: 'e', name: '개발', variables: { base:origin, user:'worker' }, apiOrigin: '${base}', loginUrl:'${base}/login',
    loginHeaders:{}, loginBody:'{"pw":"${password}","user":"${user}"}', tokenPath:'data.token',
    tokenHeader:'Authorization', tokenPrefix:'Bearer ', hasPassword:true,
  }
  const request: PrRequest = {
    id:'r', name:'등록', groupId:null, method:'POST', url:'${base}/samples', headers:{}, useAuth:true,
    body:'{"name":"test_${index}","user":"${user}","count":2,"enabled":true}',
    timeoutMs:null, favorite:false, nextIndex:'9007199254740993',
  }
  const reservations: string[] = []
  const store = {
    read: () => ({ environments:[environment], requests:[request], groups:[], environmentId:'e' }),
    password: () => 'secret-"password',
    reserveIndex: () => {
      const value = request.nextIndex
      reservations.push(value)
      request.nextIndex = String(BigInt(value) + 1n)
      return value
    },
  }
  const runner = new PostRailRunner(store, fetch, 30000, onChange)
  cleanup.push(() => runner.shutdown())
  const input = { request, environmentId: 'e', count: '1', allowPlaintext: true }
  const finish = async () => {
    await vi.waitFor(() => expect(postRailBusy(runner.state().phase)).toBe(false))
    return runner.state()
  }
  return { runner, request, environment, origin, reservations, input, finish }
}

it('logs in once, reserves exact indices, continues past a conflict, and redacts echoed credentials', async () => {
  let logins = 0
  const payloads: unknown[] = []
  const auth: unknown[] = []
  let login: unknown
  const f = await fixture((url, body, req, res) => {
    if (url === '/login') { login = JSON.parse(body); logins++; res.end('{"data":{"token":"test-bearer-token"}}'); return }
    auth.push(req.headers.authorization)
    payloads.push(body ? JSON.parse(body) : null)
    res.statusCode = payloads.length === 1 ? 409 : 201
    res.setHeader('x-echo', 'test-bearer-token')
    res.setHeader('set-cookie', 'private=session')
    res.end(JSON.stringify({ token:'test-bearer-token', pw:'secret-"password' }))
  })
  expect(f.runner.preview(f.input).sort()).toEqual([f.origin+'/login', f.origin+'/samples'])
  f.runner.start({ ...f.input, count:'2' })
  expect(() => f.runner.start(f.input)).toThrow()
  expect(await f.finish()).toMatchObject({ completed:'2', failed:'1', phase:'completed', authenticatedEnvironmentIds:['e'] })
  expect(login).toEqual({ pw:'secret-"password', user:'worker' })
  expect(payloads).toEqual([
    { name:'test_9007199254740993', user:'worker', count:2, enabled:true },
    { name:'test_9007199254740994', user:'worker', count:2, enabled:true },
  ])
  expect(f.reservations).toEqual(['9007199254740993', '9007199254740994'])
  expect(f.runner.page('0').map(r => [r.iteration,r.status,r.outcome])).toEqual([['1',409,'error'],['2',201,'success']])
  const detail = f.runner.detail('1')!
  expect(detail.body).not.toContain('password')
  expect(JSON.stringify(detail)).not.toMatch(/test-bearer-token|private=session/)
  expect(f.runner.page('0')[0]).not.toHaveProperty('body')
  expect(f.runner.preview(f.input)).toEqual([f.origin+'/samples'])
  f.runner.start({ ...f.input, request:{ ...f.request, method:'GET' } })
  await f.finish()
  expect(logins).toBe(1)
  expect(auth).toEqual(['Bearer test-bearer-token', 'Bearer test-bearer-token', 'Bearer test-bearer-token'])
  expect(f.runner.detail('2')).toBeNull()
})

it('refuses invalid input, origin mismatches, embedded credentials and plaintext before issuing login or reserving', async () => {
  let calls = 0
  const f = await fixture((_url, _body, _req, res) => { calls++; res.end() })
  const invalid:Partial<PrRequest>[] = [
    {url:'http://different.local/'}, {url:'http://admin:pw@host.local/'}, {url:'${base}/?password=${password}'},
    {url:'${base}/${index}'}, {url:'file:///invalid'}, {headers:{ aUtHoRiZaTiOn:'duplicate' }},
    {headers:{Host:'different.local'}}, {headers:{'cookie':'session=exposed'}}, {body:'bad JSON'},
    {body:'{"a":"${missing}"}'}, {timeoutMs:0}, {method:'DELETE' as const},
  ]
  for (const patch of invalid) expect(() => f.runner.start({ ...f.input, count:'2', request:{ ...f.request,...patch } })).toThrow()
  expect(() => f.runner.start({ ...f.input, allowPlaintext:false })).toThrow()
  expect(() => f.runner.start({ ...f.input, count:'0' })).toThrow()
  expect(() => f.runner.start({ ...f.input, request:{...f.request, id:'absent'} })).toThrow()
  expect(calls).toBe(0)
  expect(f.reservations).toEqual([])
})

it('keeps redirect and authentication failures away from main requests and subsequent origins', async () => {
  const calls: string[] = []
  const f = await fixture((url, _body, _req, res) => {
    calls.push(url)
    res.writeHead(302,{location:'/other'}); res.end('raw secret')
  })
  f.runner.start(f.input)
  expect(await f.finish()).toMatchObject({phase:'failed',completed:'0'})
  expect(calls).toEqual(['/login'])
  expect(f.reservations).toEqual([])
  f.runner.start({ ...f.input, request:{...f.request,useAuth:false} })
  expect(await f.finish()).toMatchObject({phase:'completed',failed:'1',completed:'1'})
  expect(calls).toEqual(['/login','/samples'])
})

it('invalidates 401 and leaves huge remaining iterations unreserved and pageable', async () => {
  let login = 0
  const f = await fixture((url,_body,_req,res) => {
    if (url === '/login') { login++; res.end('{"data":{"token":"test-bearer-token"}}') }
    else { res.statusCode=401; res.end() }
  })
  f.runner.start({...f.input,count:'90071992547410000'})
  expect(await f.finish()).toMatchObject({phase:'stopped',completed:'1',failed:'1',authenticatedEnvironmentIds:[]})
  expect(f.runner.page('90071992547409998')).toMatchObject([
    {iteration:'90071992547409999',outcome:'unsent'}, {iteration:'90071992547410000',outcome:'unsent'},
  ])
  expect(f.runner.page('0')).toHaveLength(100)
  expect(f.reservations).toEqual(['9007199254740993'])
  f.runner.start(f.input); await f.finish()
  expect(login).toBe(2)
})

it('waits for the active response before stopping and shutdown never sends the next iteration', async () => {
  let accept!: () => void
  const received = new Promise<void>(resolve => { accept=resolve })
  let response!: ServerResponse
  const f = await fixture((_url,_body,_req,res) => { response=res; accept() })
  f.runner.start({...f.input, request:{...f.request,useAuth:false}, count:'4'})
  await received
  expect(f.runner.stop().phase).toBe('stopping')
  const closing=f.runner.shutdown()
  expect(f.runner.state().completed).toBe('0')
  response.end('done')
  await closing
  expect(f.reservations).toHaveLength(1)
  expect(f.runner.state().authenticatedEnvironmentIds).toEqual([])
  expect(() => f.runner.start(f.input)).toThrow()
})

it('times out a stalled response body, records an uncertain attempt and does not retry', async () => {
  const f = await fixture((_url,_body,_req,res) => { res.write('started') })
  f.runner.start({...f.input, request:{...f.request,useAuth:false,timeoutMs:60},count:'2'})
  expect(await f.finish()).toMatchObject({phase:'completed',completed:'2',uncertain:'2'})
  expect(f.runner.detail('1')).toMatchObject({outcome:'uncertain'})
  expect(f.reservations).toHaveLength(2)
})

it('counts only POST body string values as index references', () => {
  expect(usesPostRailIndex({method:'POST',body:'{"${index}":"value"}'})).toBe(false)
  expect(usesPostRailIndex({method:'POST',body:'{"item":[{"name":"a${index}"}]}'})).toBe(true)
  expect(usesPostRailIndex({method:'GET',body:'{"name":"${index}"}'})).toBe(false)
})

it('fences a pending login on logout and discards an expired server token before sending', async () => {
  let observed!: () => void
  let finishLogin!: (body:string) => void
  const received = new Promise<void>(resolve => { observed=resolve })
  const calls:string[] = []
  const f = await fixture((url,_body,_req,res) => {
    calls.push(url)
    if (calls.length === 1) { finishLogin=body => res.end(body); observed() }
    else res.end('{"data":{"token":"token"},"expires_in":0}')
  })
  f.runner.start(f.input)
  await received
  f.runner.invalidateEnvironment('e')
  finishLogin('{"data":{"token":"outdated"}}')
  expect(await f.finish()).toMatchObject({phase:'stopped',completed:'0',authenticatedEnvironmentIds:[]})
  f.runner.start(f.input)
  expect(await f.finish()).toMatchObject({phase:'failed',completed:'0',authenticatedEnvironmentIds:[]})
  expect(calls).toEqual(['/login','/login'])
  expect(f.reservations).toEqual([])
})

it('pins the plaintext confirmation to the shown URL list even if authentication changes', async () => {
  const f=await fixture((url,_body,_req,res) => res.end(url === '/login' ? '{"data":{"token":"token"}}' : '{}'))
  f.runner.start(f.input); await f.finish()
  const approvedHttpUrls = f.runner.preview(f.input)
  expect(approvedHttpUrls).toEqual([f.origin+'/samples'])
  f.runner.invalidateEnvironment('e')
  expect(() => f.runner.start({...f.input,approvedHttpUrls})).toThrow()
  expect(f.reservations).toHaveLength(1)
})

it('resolves protected request fields only at the configured API origin and masks echoes without login', async () => {
  let body = '', header = ''
  const f=await fixture((_url,data,req,res) => {
    body=data; header=String(req.headers['x-example'])
    res.end(data)
  })
  const request={...f.request, useAuth:false, body:'{"pw":"${password}"}', headers:{'x-example':'${password}'}}
  expect(() => f.runner.start({...f.input, request:{...request,url:'http://elsewhere.test/'}})).toThrow()
  f.runner.start({...f.input,request})
  expect(await f.finish()).toMatchObject({completed:'1',failed:'0'})
  expect(JSON.parse(body)).toEqual({pw:'secret-"password'})
  expect(header).toBe('secret-"password')
  expect(f.runner.detail('1')!.body).not.toContain('password')
  expect(f.reservations).toEqual([])
})

it('stops after a 401 even when its response body times out', async () => {
  let attempts = 0
  const f = await fixture((url, _body, _req, res) => {
    if (url === '/login') { res.end('{"data":{"token":"test-bearer-token"}}'); return }
    attempts++
    res.writeHead(401, {'x-reply':'received', 'x-echo':'test-bearer-token'})
    res.write('partial')
  })
  f.runner.start({...f.input, request:{...f.request, timeoutMs:200}, count:'2'})
  expect(await f.finish()).toMatchObject({phase:'stopped', completed:'1', failed:'1', authenticatedEnvironmentIds:[]})
  expect(f.runner.detail('1')).toMatchObject({status:401, outcome:'error', headers:{'x-reply':'received', 'x-echo':'••••'}})
  expect(f.runner.detail('2')).toMatchObject({outcome:'unsent'})
  expect(attempts).toBe(1)
  expect(f.reservations).toHaveLength(1)
})

it('stops before reserving the next index when the cached token expires during a response', async () => {
  const now = Date.now.bind(Date)
  let offset = 0
  const clock = vi.spyOn(Date,'now').mockImplementation(() => now() + offset)
  try {
    let samples = 0, logins = 0
    const f = await fixture((url, _body, _req, res) => {
      if (url === '/login') { logins++; res.end('{"data":{"token":"session"},"expires_in":60}'); return }
      if (++samples === 2) offset = 61_000
      res.end('{}')
    })
    f.runner.start({...f.input, request:{...f.request, method:'GET'}})
    expect(await f.finish()).toMatchObject({completed:'1', authenticatedEnvironmentIds:['e']})
    f.runner.start({...f.input, count:'2'})
    expect(await f.finish()).toMatchObject({phase:'stopped', completed:'1', authenticatedEnvironmentIds:[]})
    expect(f.runner.detail('2')).toMatchObject({outcome:'unsent'})
    expect(f.reservations).toEqual(['9007199254740993'])
    expect(logins).toBe(1)
  } finally { clock.mockRestore() }
})

it('preserves JSON numeric literals in login and indexed request bodies', async () => {
  const bodies: string[] = []
  const f = await fixture((url, body, _req, res) => {
    bodies.push(body)
    res.end(url === '/login' ? '{"data":{"token":"session"}}' : '{}')
  })
  f.environment.loginBody = '{"account":9007199254740993}'
  const request = {...f.request, body:'{"index":"${index}","large":[9007199254740993,1e400,-0,1.00000000000000001]}'}
  f.runner.start({...f.input, request})
  expect(await f.finish()).toMatchObject({phase:'completed', completed:'1', failed:'0'})
  expect(bodies).toEqual([
    '{"account":9007199254740993}',
    '{"index":"9007199254740993","large":[9007199254740993,1e400,-0,1.00000000000000001]}',
  ])
  expect(() => f.runner.start({...f.input, request:{...request, body:'9007199254740993'}})).toThrow()
})

it('notifies open views when the last run token expires while idle', async () => {
  let capture = () => {}
  const states:string[][] = []
  const f = await fixture((url, _body, _req, res) => {
    res.end(url === '/login' ? '{"data":{"token":"session"},"expires_in":0.3}' : '{}')
  }, () => capture())
  capture = () => {
    const state = f.runner.state()
    if (state.phase === 'completed') states.push(state.authenticatedEnvironmentIds)
  }
  f.runner.start(f.input)
  await f.finish()
  expect(states).toContainEqual(['e'])
  await vi.waitFor(() => expect(states).toContainEqual([]))
})
