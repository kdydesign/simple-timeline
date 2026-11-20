import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { PostRailRunner } from '../../src/main/postrail/runner'
import type { PrEnv, PrRequest } from '../../src/shared/postrail'
import { postRailBusy, usesPostRailIndex } from '../../src/shared/postrail-run'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture(serve: (url: string, body: string, req: IncomingMessage, res: ServerResponse) => void, onChange?: () => void, password='secret-"password') {
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
    password: () => password,
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

it('encodes structured query and path components, preserves raw URL segments and repeats a form without reserving indices', async () => {
  const calls:{url:string,body:string,mime:unknown}[]=[]
  const f=await fixture((url,body,req,res)=>{calls.push({url,body,mime:req.headers['content-type']});res.end('ok')})
  f.environment.variables.term = 'A&B +한'
  const request:PrRequest = {...f.request, useAuth:false, url:'${base}/items/:id?old=%2f&q=unused', pathValues:{id:'a/b'},
    queryRows:[{enabled:true,name:'old',value:'/',raw:'old=%2f'}, {enabled:true,name:'q',value:'${term}'},{enabled:false,name:'off',value:'1'}],
    bodyMode:'urlencoded',formRows:[{enabled:true,name:'title',value:'A&B'}],headerRows:[]}
  f.runner.start({...f.input,request,count:'2'})
  await f.finish()
  expect(calls).toHaveLength(2)
  for (const c of calls) {
    expect(c.url).toMatch(/^\/items\/a%2Fb\?old=%2f&q=/)
    expect([...new URL(c.url,f.origin).searchParams]).toEqual([['old','/'],['q','A&B +한']])
    expect(c.body).toBe('title=A%26B')
    expect(c.mime).toMatch(/^application\/x-www-form-urlencoded/)
  }
  expect(f.reservations).toEqual([])
})

it('rejects invalid multipart selection and protected URL parameters before login', async () => {
  const f=await fixture((_url,_body,_req,res)=>res.end())
  const request:PrRequest={...f.request,bodyMode:'multipart',parts:[
    {kind:'file',file:null,name:'item',value:'',mime:'',enabled:true}
  ]}
  expect(()=>f.runner.start({...f.input,request})).toThrow('form-data 1행')
  expect(()=>f.runner.start({...f.input,request:{...request,bodyMode:'none',queryRows:[{name:'token',value:'v',enabled:true}]}})).toThrow('비밀값')
  expect(f.reservations).toEqual([])
})

it('retains scoped preflight and login errors without exposing wire values, clearing the icon on success', async () => {
  let rejectLogin = true
  const f = await fixture((url, _body, _req, res) => {
    if (url === '/login') {
      res.statusCode = rejectLogin ? 401 : 200
      res.end(rejectLogin ? 'PRIVATE_RESPONSE' : '{"data":{"token":"PRIVATE_TOKEN"}}')
    } else res.end('PRIVATE_RESPONSE')
  })
  const request = {...f.request, url:f.origin+'/samples?filter=PRIVATE_QUERY', headers:{'X-Note':'PRIVATE_HEADER'}}
  expect(() => f.runner.preview({...f.input,request:{...request,url:'https://elsewhere.test/?filter=PRIVATE_QUERY'}})).toThrow()
  const preflight = f.runner.state().sendErrors!
  expect(preflight).toMatchObject([{requestId:'r', environmentId:'e', preflight:true}])
  expect(f.runner.consoleSince(0).at(-1)?.text).toContain(preflight[0].message)
  f.runner.start({...f.input,request})
  await f.finish()
  expect(f.runner.state().sendErrors![0].message).toMatch(/로그인.*401.*미전송/)
  rejectLogin = false
  f.runner.start({...f.input,request}); await f.finish()
  f.runner.start({...f.input,request}); await f.finish()
  expect(f.runner.state().sendErrors).toEqual([])
  const lines = f.runner.consoleSince(0)
  expect(lines.filter(line => line.error)).toHaveLength(2)
  expect(lines.map(line => line.text).join('\n')).toMatch(/로그인 시작[\s\S]*토큰 발급[\s\S]*토큰 재사용/)
  expect(JSON.stringify(lines)).not.toMatch(/PRIVATE_|secret-|\/samples|9007199254740993/)
  expect(f.runner.consoleSince(lines.at(-2)!.id)).toEqual(lines.slice(-1))
})

it('retains the latest 1,000 session lines independently of the results and clears them on shutdown', async () => {
  const f = await fixture((_url,_body,_req,res) => res.end())
  f.runner.invalidDraft(f.request.id,'e','headers',f.request.method,'3행 · 같은 이름의 헤더가 두 번 있습니다.')
  expect(f.runner.state().sendErrors![0].message).toBe('3행 · 같은 이름의 헤더가 두 번 있습니다.')
  f.runner.invalidDraft(f.request.id,'e','params',f.request.method,'경로 값 PRIVATE_FIELD을 입력하세요.')
  expect(f.runner.consoleSince(0).at(-1)?.text).not.toContain('PRIVATE_FIELD')
  for (let i=2; i<1000; i++) f.runner.invalidDraft(f.request.id,'e','headers',f.request.method)
  f.runner.start({...f.input,request:{...f.request,useAuth:false}})
  await f.finish()
  const lines = f.runner.consoleSince(0)
  expect(lines).toHaveLength(1000)
  expect(lines[0].id).toBe(3)
  expect(lines.at(-1)?.text).toContain('HTTP 200')
  expect(f.runner.page('0')).toHaveLength(1)
  await f.runner.shutdown()
  expect(f.runner.consoleSince(0)).toEqual([])
})

it('keeps imported delimiter templates and literal path placeholders when opening the parameter table', async () => {
  const urls:string[]=[]
  const f=await fixture((url,_body,_req,res)=>{urls.push(url);res.end()})
  f.environment.variables.endpoint=f.origin+'/items/:id?take=1&empty'
  f.environment.variables.suffix='a&flag=1'
  const request:PrRequest={...f.request,useAuth:false,method:'GET',url:'${endpoint}',queryRows:[]}
  f.runner.start({...f.input,request});await f.finish()
  const source=f.origin+'/items/:id?q=${suffix}&q=%2f&empty'
  const {queryFromUrl}=await import('../../src/shared/postrail-parameters')
  f.runner.start({...f.input,request:{...request,url:source,queryRows:queryFromUrl(source)}});await f.finish()
  expect(urls).toEqual(['/items/:id?take=1&empty','/items/:id?q=a&flag=1&q=%2f&empty'])
})

it('uses the selected raw MIME and masks encoded form credentials echoed by a server', async () => {
  const received:{body:string,type:unknown}[]=[]
  const f=await fixture((_url,body,req,res)=>{received.push({body,type:req.headers['content-type']});res.end(body)})
  const request:PrRequest={...f.request,useAuth:false,bodyMode:'raw',rawBody:'<name>${user}</name>',headerRows:[
    {enabled:true,name:'Content-Type',value:'application/vnd.team+xml'}, {enabled:false,name:'X-Ignore',value:'${missing}'},
  ]}
  f.runner.start({...f.input,request});await f.finish()
  expect(received[0]).toEqual({body:'<name>worker</name>',type:'application/vnd.team+xml'})
  const value='top secret!~'
  const form:PrRequest={...request,bodyMode:'urlencoded',headerRows:[{enabled:true,name:'X-Api-Key',value}],
    formRows:[{enabled:true,name:'credential',value}]}
  f.runner.start({...f.input,request:form});await f.finish()
  expect(received[1].body).toBe('credential=top+secret%21%7E')
  expect(f.runner.detail('1')?.body).toBe('credential=••••')
  f.runner.start({...f.input,request:{...form,bodyMode:'none'}});await f.finish()
  expect(received[2]).toEqual({body:'',type:undefined})
})

it('distinguishes a main-request 401 with or without the environment token and preserves its error after other sends', async () => {
  const f = await fixture((url,_body,_req,res) => {
    if (url === '/login') { res.end('{"data":{"token":"PRIVATE_TOKEN"}}'); return }
    res.statusCode = url === '/ok' ? 200 : 401
    res.end('PRIVATE_ERROR')
  })
  f.runner.start({...f.input,request:{...f.request,useAuth:false}})
  await f.finish()
  expect(f.runner.state().sendErrors![0].message).toContain('환경 인증 없이 전송한 본 요청 HTTP 401')
  f.runner.start(f.input)
  await f.finish()
  expect(f.runner.state().sendErrors![0].message).toContain('환경 토큰을 붙인 본 요청 HTTP 401 · 캐시 폐기')
  f.runner.start({...f.input,request:{...f.request,id:'other',method:'GET',url:f.origin+'/ok',useAuth:false}})
  await f.finish()
  expect(f.runner.state().sendErrors).toMatchObject([{requestId:'r',environmentId:'e'}])
  const errors = f.runner.consoleSince(0).filter(line=>line.error)
  expect(errors).toHaveLength(2)
  expect(JSON.stringify(errors)).not.toMatch(/PRIVATE_/)
})

it('masks multipart-quoted credentials when a server echoes a part name with punctuation',async()=>{
  const f=await fixture((_url,body,_req,res)=>res.end(body),undefined,'secret space!"\\~')
  const request:PrRequest={...f.request,useAuth:false,bodyMode:'multipart',parts:[
    {kind:'text',enabled:true,name:'${password}',value:'ok',mime:''}
  ]}
  f.runner.start({...f.input,request})
  await f.finish()
  expect(f.runner.detail('1')?.body).toContain('name="••••"')
})

it('expands only literal URL-typed query placeholders component-wise, preserving original percent escapes', async()=>{
  const urls:string[]=[]
  const f=await fixture((url,_body,_req,res)=>{urls.push(url);res.end()})
  f.environment.variables.value='A&B +한'
  const raw='q=%24%7Bmissing%7D${value}'
  const request:PrRequest={...f.request,method:'GET',useAuth:false,url:'${base}/items?'+raw,
    queryRows:[{enabled:true,name:'q',value:'${missing}${value}',raw,encodeVariables:true}]}
  f.runner.start({...f.input,request});await f.finish()
  expect([...new URL(urls[0],f.origin).searchParams]).toEqual([['q','${missing}A&B +한']])
})
