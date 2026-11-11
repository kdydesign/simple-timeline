import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createServer, request, type Server } from 'node:https'
import { createHash } from 'node:crypto'
import { connect as connectTcp } from 'node:net'
import { createHostIdentity, type HostIdentity } from '../../src/main/sharing/identity'
import { createSharingHost, type HostStore } from '../../src/main/sharing/host'
import { SharingClient, type ClientConnection } from '../../src/main/sharing/client'
import { discoverHost, pinnedRequest, type HostTrust } from '../../src/main/sharing/transport'
import type { ApprovedDevice, WireSnapshot } from '../../src/shared/sharing'
import type { CredentialRecord } from '../../src/main/db/sharing/store'

const hostId = '11111111-1111-4111-8111-111111111111'
const datasetId = '22222222-2222-4222-8222-222222222222'
const installationId = '33333333-3333-4333-8333-333333333333'
let identity: HostIdentity
const cleanup: (() => Promise<unknown>)[] = []
beforeAll(async () => { identity = await createHostIdentity(hostId) })
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f() })
function memoryStore() {
  const devices: ApprovedDevice[] = [{ id: 'device-a', name: 'Member', ip: '127.0.0.1', revoked: false, approved: false }]
  const credentials = new Map<string, CredentialRecord>()
  const bindings = new Map<string, string>()
  const snapshot: WireSnapshot = { protocolVersion: 1, hostId, datasetId, projects: [{ id: '1', name: 'Shared', color: '#2563EB', participants: ['Member'], createdAt: 't', updatedAt: 't' }], schedules: [] }
  const store: HostStore = {
    getConfig: () => ({ hostId, datasetId }),
    listDevices: () => devices.map(d => ({ ...d })),
    getDevice: id => { const d = devices.find(x => x.id === id); if (!d) throw Error('missing'); return { ...d } },
    getDeviceInstallationId: id => bindings.get(id) ?? null,
    saveDevice: input => { const d = devices.find(x => x.id === input.id)!; Object.assign(d, input); if (input.installationId) bindings.set(d.id, input.installationId); return { ...d } },
    putCredential: ({ deviceId, hash }) => { store.revokePendingCredentials(deviceId); credentials.set(hash, { hash, deviceId, status: 'pending' }) },
    revokePendingCredentials: deviceId => { for (const c of credentials.values()) if (c.deviceId === deviceId && c.status === 'pending') c.status = 'revoked' },
    activateCredential: hash => { const c = credentials.get(hash); if (!c || c.status !== 'pending' || devices.find(d => d.id === c.deviceId)?.revoked) throw Error('forbidden'); for (const other of credentials.values()) if (other.deviceId === c.deviceId && other.status === 'active') other.status = 'revoked'; c.status = 'active' },
    findCredential: hash => credentials.get(hash),
    getWireSnapshot: () => structuredClone(snapshot),
  }
  return { store, devices, credentials, snapshot }
}
async function fixture(options: { now?: () => number } = {}) {
  const memory = memoryStore()
  const host = createSharingHost({ identity, store: memory.store, ...options })
  const address = await host.start('127.0.0.1', 0)
  cleanup.push(() => host.dispose())
  const trust = await discoverHost(address.address, address.port)
  let saved: ClientConnection | null = null
  const client = new SharingClient({ installationId, trust, address, persistence: { load: async () => saved, save: async c => { saved = c } } })
  cleanup.push(async () => client.close())
  return { ...memory, host, client, trust, address, saved: () => saved }
}
async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  const pair = await f.client.beginPair()
  f.host.approve(pair.pairId)
  expect((await f.client.confirmPair(pair.pairId, pair.fingerprint)).kind).toBe('ready')
  return pair
}

describe('real loopback pinned HTTPS and pairing', () => {
  it('synchronizes authenticated change envelopes even when snapshot ETag has not changed', async () => {
    const f = await fixture(); await ready(f)
    let received: unknown[] = []
    Object.assign(f.store, {getChangeSnapshot: (id:string,cursor:string|null,reconnecting:boolean) => {
      received=[id,cursor,reconnecting]
      return {version:1,snapshot:f.snapshot,cursor:'a'.repeat(64),mode:'delta',notices:[]}
    }})
    const result=await f.client.poll({cursor:null,reconnecting:true} as any)
    expect(result).toMatchObject({kind:'snapshot',changesSupported:true,changes:{cursor:'a'.repeat(64)}})
    expect(received).toEqual(['device-a',null,true])
    if(result.kind!=='snapshot')throw Error('snapshot missing')
    expect((await f.client.poll({etag:result.etag,cursor:'a'.repeat(64)} as any)).kind).toBe('snapshot')
    await expect(pinnedRequest({address:f.address,trust:f.trust,path:'/v1/changes/sync',method:'POST',body:{cursor:null,reconnecting:false}})).rejects.toMatchObject({code:'UNAUTHORIZED'})
    await expect(pinnedRequest({address:f.address,trust:f.trust,path:'/v1/changes/sync',method:'POST',token:f.saved()!.token,localAddress:'127.0.0.2',body:{cursor:null,reconnecting:false}})).rejects.toMatchObject({code:'UNAUTHORIZED'})
    await expect(f.client.poll({cursor:'broken'} as any)).rejects.toMatchObject({code:'INVALID_REQUEST'})
  })
  it('falls back only on explicit old-host 404 and never after change support was established', async () => {
    const f=await fixture();await ready(f)
    let supported=false,malformed=false;const paths:string[]=[]
    const server=createServer({cert:identity.certificate,key:identity.privateKey},(req,res)=>{
      paths.push(req.url!);res.setHeader('etag','"'+'a'.repeat(64)+'"')
      if(req.url==='/v1/changes/sync'){
        if(!supported){res.writeHead(404);res.end(JSON.stringify({code:'NOT_FOUND'}));return}
        res.end(JSON.stringify(malformed?{broken:true}:{version:1,snapshot:f.snapshot,cursor:'b'.repeat(64),mode:'delta',notices:[]}));return
      }
      res.end(JSON.stringify(f.snapshot))
    })
    const address=await listen(server),make=()=>new SharingClient({installationId,address,trust:f.trust,persistence:{load:async()=>f.saved(),save:async()=>{}}})
    const old=make();cleanup.push(async()=>old.close())
    expect(await old.poll()).toMatchObject({kind:'snapshot',changesSupported:false});expect(paths).toEqual(['/v1/changes/sync','/v1/snapshot'])
    supported=true;const modern=make();cleanup.push(async()=>modern.close())
    expect(await modern.poll()).toMatchObject({changesSupported:true})
    malformed=true;await expect(modern.poll()).rejects.toMatchObject({code:'INVALID_RESPONSE'})
    supported=false;await expect(modern.poll()).rejects.toMatchObject({status:404})
    expect(paths.filter(p=>p==='/v1/snapshot')).toHaveLength(1)
  })

  it('discovery sends no HTTP request; trusted identity succeeds and a changed certificate fails', async () => {
    let requests = 0
    const server = createServer({ cert: identity.certificate, key: identity.privateKey }, (_req, res) => { requests++; res.end('{}') })
    const address = await listen(server)
    const trust = await discoverHost(address.address, address.port)
    expect(requests).toBe(0)
    await pinnedRequest({ address, trust, path: '/v1/identity' })
    expect(requests).toBe(1)
    const replacement = await createHostIdentity(hostId)
    const impostor = createServer({ cert: replacement.certificate, key: replacement.privateKey }, (_req, res) => res.end('{}'))
    const other = await listen(impostor)
    await expect(pinnedRequest({ address: other, trust, path: '/v1/identity' })).rejects.toMatchObject({ code: 'TLS_UNTRUSTED' })
  })
  it('withholds snapshots until both approvals and delivery acknowledgment, then supports private-filtered ETags', async () => {
    const f = await fixture()
    const pair = await f.client.beginPair()
    expect(pair.fingerprint).toMatch(/^[A-F0-9]{64}$/)
    expect(f.host.pending()[0].fingerprint).toBe(pair.fingerprint)
    expect((await f.client.confirmPair(pair.pairId, pair.fingerprint)).kind).toBe('pending')
    expect(f.credentials.size).toBe(0)
    f.host.approve(pair.pairId)
    expect((await f.client.poll()).kind).toBe('ready')
    const result = await f.client.poll()
    expect(result).toMatchObject({ kind: 'snapshot', snapshot: { projects: [{ name: 'Shared' }] } })
    expect(JSON.stringify(result)).not.toContain('127.0.0.1')
    if (result.kind !== 'snapshot') throw Error('missing snapshot')
    expect((await f.client.poll({ etag: result.etag })).kind).toBe('unchanged')
    f.snapshot.projects[0].name = 'Changed'
    expect(await f.client.poll()).toMatchObject({ kind: 'snapshot', snapshot: { projects: [{ name: 'Changed' }] } })
  })
  it('only uses the caller committed ETag and force requests a full snapshot after failed cache application', async () => {
    const f = await fixture(); await ready(f)
    const first = await f.client.poll()
    expect(first.kind).toBe('snapshot')
    // Caller has not committed this response, so no ETag may be retained by transport.
    expect((await f.client.poll()).kind).toBe('snapshot')
    if (first.kind !== 'snapshot') throw Error('missing snapshot')
    expect((await f.client.poll({ etag: first.etag })).kind).toBe('unchanged')
    expect((await f.client.poll({ etag: first.etag, force: true })).kind).toBe('snapshot')
  })
  it('requires the member approval even after local host approval and rejects full fingerprint mismatch', async () => {
    const f = await fixture()
    const pair = await f.client.beginPair()
    f.host.approve(pair.pairId)
    expect((await f.client.poll()).kind).toBe('pending')
    await expect(f.client.confirmPair(pair.pairId, '0'.repeat(64))).rejects.toMatchObject({ code: 'FINGERPRINT_MISMATCH' })
    expect(f.credentials.size).toBe(0)
  })
  it('authenticates token and actual source IP and only returns explicit revocation for a known revoked token on its registered IP', async () => {
    const f = await fixture(); await ready(f)
    const credential = f.saved()!
    await expect(pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/snapshot', token: 'x'.repeat(64) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/snapshot', token: credential.token, localAddress: '127.0.0.2' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    f.devices[0].revoked = true
    for (const c of f.credentials.values()) c.status = 'revoked'
    expect((await f.client.poll()).kind).toBe('revoked')
  })
  it('expires attempts and invalidates pending delivery without revoking existing active credentials', async () => {
    let now = 1000
    const f = await fixture({ now: () => now }); await ready(f)
    const active = [...f.credentials.values()][0]
    const pair = await f.client.beginPair()
    f.host.approve(pair.pairId)
    now += 300001
    await expect(f.client.confirmPair(pair.pairId, pair.fingerprint)).rejects.toMatchObject({ code: 'PAIR_EXPIRED' })
    expect(active.status).toBe('active')
    expect(f.host.pending()).toHaveLength(0)
  })
  it('binds the full fingerprint to this host and proof; rejects other requesters and consumes delivery once', async () => {
    const f = await fixture(), a = await rawBegin(f)
    const wanted = createHash('sha256').update(JSON.stringify(['Planrail pairing v1', hostId, identity.pin, a.pairId, 'a'.repeat(64), 'b'.repeat(64)])).digest('hex').toUpperCase()
    expect(a.fingerprint).toBe(wanted)
    expect(f.store.getDeviceInstallationId('device-a')).toBeNull()
    f.host.approve(a.pairId)
    expect(f.store.getDeviceInstallationId('device-a')).toBe(installationId)
    await expect(pairRequest(f, 'confirm', { pairId: a.pairId, fingerprint: '0'.repeat(64) })).rejects.toMatchObject({ code: 'FINGERPRINT_MISMATCH' })
    await expect(pairRequest(f, 'finish', { pairId: a.pairId }, 'c'.repeat(64))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect((await pairRequest(f, 'finish', { pairId: a.pairId })).status).toBe(202)
    await pairRequest(f, 'confirm', { pairId: a.pairId, fingerprint: a.fingerprint })
    const issued = (await pairRequest(f, 'finish', { pairId: a.pairId })).body as { token: string }
    expect([...f.credentials.values()][0].status).toBe('pending')
    await expect(pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/snapshot', token: issued.token })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(pairRequest(f, 'finish', { pairId: a.pairId })).rejects.toMatchObject({ code: 'DELIVERY_CONSUMED' })
    await expect(pairRequest(f, 'ack', { pairId: a.pairId, token: issued.token }, 'c'.repeat(64))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await pairRequest(f, 'ack', { pairId: a.pairId, token: issued.token })
    // The first acknowledgment response can be lost; repeating it cannot mint another token.
    expect((await pairRequest(f, 'ack', { pairId: a.pairId, token: issued.token })).body).toEqual({ kind: 'ready' })
    expect((await pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/snapshot', token: issued.token })).status).toBe(200)
  })
  it('revokes abandoned pending delivery on a new attempt, expiry, and host stop', async () => {
    for (const ending of ['new', 'expiry', 'stop']) {
      let now = 0
      const f = await fixture({ now: () => now }), a = await rawBegin(f)
      f.host.approve(a.pairId)
      await pairRequest(f, 'confirm', { pairId: a.pairId, fingerprint: a.fingerprint })
      const issued = (await pairRequest(f, 'finish', { pairId: a.pairId })).body as { token: string }
      if (ending === 'new') await rawBegin(f)
      if (ending === 'expiry') { now = 300001; f.host.pending() }
      if (ending === 'stop') await f.host.stop()
      expect([...f.credentials.values()][0].status).toBe('revoked')
      if (ending !== 'stop') await expect(pairRequest(f, 'ack', { pairId: a.pairId, token: issued.token })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
  })
  it('does not activate on protected-storage failure and can retry acknowledgment after durable storage succeeds', async () => {
    const f = await fixture()
    let failSave = true
    const writes: string[] = []
    const client = new SharingClient({ installationId, trust: f.trust, address: f.address, persistence: { load: async () => null, save: async c => { if (failSave) throw Error('storage unavailable'); writes.push(c.activation) } } })
    cleanup.push(async () => client.close())
    const a = await client.beginPair(); f.host.approve(a.pairId)
    await expect(client.confirmPair(a.pairId, a.fingerprint)).rejects.toThrow('storage unavailable')
    expect([...f.credentials.values()][0].status).toBe('pending')
    failSave = false
    expect((await client.poll()).kind).toBe('ready')
    expect(writes).toEqual(['pending', 'active'])
    expect([...f.credentials.values()][0].status).toBe('active')
  })
  it('rejects untrusted or wrong installation identity, protocol and dataset without changing saved connection', async () => {
    const f = await fixture(); await ready(f)
    const saved = structuredClone(f.saved())
    f.snapshot.datasetId = '44444444-4444-4444-8444-444444444444'
    await expect(f.client.poll()).rejects.toMatchObject({ code: 'DATASET_MISMATCH' })
    expect(f.saved()).toEqual(saved)
    f.snapshot.datasetId = datasetId
    // Untrusted persisted connection never sends its bearer to a newly supplied host.
    const other = await createHostIdentity(hostId)
    const wrong = new SharingClient({ installationId, address: f.address, trust: { ...f.trust, pin: other.pin, certificate: other.certificate }, persistence: { load: async () => saved, save: async () => {} } })
    cleanup.push(async () => wrong.close())
    await expect(wrong.poll()).rejects.toMatchObject({ code: 'TLS_UNTRUSTED' })
    const badProtocol = createServer({ cert: identity.certificate, key: identity.privateKey }, (req, res) => { if(req.url === '/v1/changes/sync'){res.writeHead(404);res.end('{}');return};res.setHeader('etag', '"' + 'a'.repeat(64) + '"'); res.end(JSON.stringify({ ...f.snapshot, protocolVersion: 2 })) })
    const address = await listen(badProtocol)
    const client = new SharingClient({ installationId, address, trust: f.trust, persistence: { load: async () => saved, save: async () => {} } })
    cleanup.push(async () => client.close())
    await expect(client.poll()).rejects.toMatchObject({ code: 'PROTOCOL_MISMATCH' })
    const response = await rawHttp(f, '/v1/identity', { 'x-planrail-protocol': '2' })
    expect(response).toMatchObject({ status: 409, body: { code: 'PROTOCOL_MISMATCH' } })
  })
  it('enforces absolute timeout during trickle responses, abort and close discard late results, and response limits never truncate', async () => {
    const slow = createServer({ cert: identity.certificate, key: identity.privateKey }, (_req, res) => {
      res.write('{')
      const interval = setInterval(() => res.write(' '), 5)
      res.once('close', () => clearInterval(interval))
    })
    const address = await listen(slow), trust: HostTrust = { ...identity }
    await expect(pinnedRequest({ address, trust, path: '/v1/identity', timeoutMs: 35 })).rejects.toMatchObject({ code: 'TIMEOUT' })
    const controller = new AbortController()
    const aborted = pinnedRequest({ address, trust, path: '/v1/identity', signal: controller.signal }); controller.abort()
    await expect(aborted).rejects.toMatchObject({ code: 'ABORTED' })
    const client = new SharingClient({ installationId, address, trust, persistence: { load: async () => null, save: async () => {} } })
    const late = client.beginPair(); client.close()
    await expect(late).rejects.toMatchObject({ code: 'ABORTED' })
    for (const declared of [true, false]) {
      const large = createServer({ cert: identity.certificate, key: identity.privateKey }, (_req, res) => {
        if (declared) res.setHeader('content-length', 16 * 1024 * 1024 + 1)
        const chunk = Buffer.alloc(1024 * 1024, 32)
        for (let n = 0; n < 17; n++) res.write(chunk)
        res.end()
      })
      await expect(pinnedRequest({ address: await listen(large), trust, path: '/v1/identity' })).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
    }
  })
  it('bounds host handshake and trickled request lifetimes even while the socket remains active', async () => {
    const f = await fixture(), started = performance.now()
    const socket = connectTcp({ host: f.address.address, port: f.address.port })
    const handshakeClosed = new Promise<void>(resolve => { socket.on('error', () => {}); socket.on('close', () => resolve()) })
    const req = request({ host: f.address.address, port: f.address.port, servername: identity.serverName, ca: identity.certificate, path: '/v1/pair/begin', method: 'POST', headers: { 'x-planrail-protocol': '1' }, agent: false })
    const bodyClosed = new Promise<void>(resolve => { req.on('error', () => {}); req.on('close', () => resolve()) })
    req.write('{')
    const trickle = setInterval(() => req.write(' '), 20)
    try { await Promise.all([handshakeClosed, bodyClosed]) }
    finally { clearInterval(trickle); socket.destroy(); req.destroy() }
    expect(performance.now() - started).toBeLessThan(6500)
    expect(f.credentials.size).toBe(0)
  }, 10000)
  it('bounds pending attempts, request rate and request bodies with explicit errors; exposes no member write route', async () => {
    const f = await fixture()
    for (let n = 2; n < 19; n++) f.devices.push({ id: 'device-' + n, name: 'PC ' + n, ip: '127.0.0.' + n, approved: false, revoked: false })
    for (let n = 2; n < 18; n++) await rawBegin(f, '127.0.0.' + n)
    await expect(rawBegin(f, '127.0.0.18')).rejects.toMatchObject({ code: 'PAIR_LIMIT' })
    expect(f.host.pending()).toHaveLength(16)
    for (let n = 0; n < 120; n++) await pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/identity' })
    await expect(pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/identity' })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    const g = await fixture()
    expect(await rawHttp(g, '/v1/pair/begin', { 'content-length': String(1024 * 1024 + 1) }, 'POST')).toMatchObject({ status: 413, body: { code: 'REQUEST_TOO_LARGE' } })
    await expect(pinnedRequest({ address: g.address, trust: g.trust, path: '/v1/pair/begin', method: 'POST', body: { data: 'x'.repeat(1024 * 1024) } })).rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' })
    await expect(pinnedRequest({ address: g.address, trust: g.trust, path: '/v1/snapshot', method: 'POST', body: {} })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects a 304 without the caller conditional tag and a mismatched response tag', async () => {
    const f = await fixture(); await ready(f)
    const saved = f.saved()!
    const server = createServer({ cert: identity.certificate, key: identity.privateKey }, (_req, res) => { res.writeHead(304, { etag: '"' + 'b'.repeat(64) + '"' }); res.end() })
    const address = await listen(server)
    const client = new SharingClient({ installationId, address, trust: f.trust, persistence: { load: async () => saved, save: async () => {} } })
    cleanup.push(async () => client.close())
    await expect(client.poll()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(client.poll({ etag: '"' + 'a'.repeat(64) + '"' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('does not allow non-ASCII requester proofs to bypass authentication', async () => {
    const f = await fixture(), a = await rawBegin(f)
    await expect(pairRequest(f, 'finish', { pairId: a.pairId }, 'é'.repeat(64))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
  it('stops slow body requests before closing DB and never touches store on late completion', async () => {
    const m = memoryStore()
    let closed = false, lateStoreCalls = 0
    const store = new Proxy(m.store, { get(target, key) { const method = target[key as keyof HostStore]; return typeof method === 'function' ? (...args: unknown[]) => { if (closed) { lateStoreCalls++; throw Error('DB already closed') }; return Reflect.apply(method, target, args) } : method } })
    const host = createSharingHost({ identity, store })
    const address = await host.start('127.0.0.1', 0)
    cleanup.push(() => host.dispose())
    const req = request({ host: address.address, port: address.port, servername: identity.serverName, ca: identity.certificate, method: 'POST', path: '/v1/pair/begin', headers: { 'x-planrail-protocol': '1' }, agent: false })
    const done = new Promise<void>(resolve => { req.on('error', () => resolve()); req.on('close', () => resolve()) })
    req.write('{')
    await new Promise(resolve => setTimeout(resolve, 20))
    const stopped = host.stop(); closed = true
    req.end('}')
    await stopped; await done
    expect(host.pending()).toEqual([])
    expect(lateStoreCalls).toBe(0)
  })
  it('maps malformed dataset identity to a safe network error and leaves the saved credential intact', async () => {
    const f = await fixture(); await ready(f)
    const saved = structuredClone(f.saved())
    const server = createServer({ cert: identity.certificate, key: identity.privateKey }, (_req, res) => res.end(JSON.stringify({ protocolVersion: 1, hostId, datasetId: 'broken', projects: [], schedules: [] })))
    const address = await listen(server)
    const client = new SharingClient({ installationId, address, trust: f.trust, persistence: { load: async () => saved, save: async () => {} } })
    cleanup.push(async () => client.close())
    await expect(client.poll()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.saved()).toEqual(saved)
  })
  it('marks host stopped and closes sockets even if pending credential cleanup fails', async () => {
    const f = await fixture(); await f.client.beginPair()
    const original = f.store.revokePendingCredentials
    f.store.revokePendingCredentials = () => { throw Error('DB failed') }
    try { await expect(f.host.stop()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' }) }
    finally { f.store.revokePendingCredentials = original }
    expect(f.host.pending()).toEqual([])
    await expect(pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/identity' })).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
  it('invalidates orphan pending credentials on host restart while retaining active credentials', async () => {
    const m = memoryStore()
    m.credentials.set('1'.repeat(64), { hash: '1'.repeat(64), deviceId: 'device-a', status: 'active' })
    m.credentials.set('2'.repeat(64), { hash: '2'.repeat(64), deviceId: 'device-a', status: 'pending' })
    const host = createSharingHost({ identity, store: m.store })
    cleanup.push(() => host.dispose())
    await host.start('127.0.0.1', 0)
    expect(m.credentials.get('1'.repeat(64))?.status).toBe('active')
    expect(m.credentials.get('2'.repeat(64))?.status).toBe('revoked')
  })
  it('rejects wildcard, multicast and broadcast binds', async () => {
    const host = createSharingHost({ identity, store: memoryStore().store })
    for (const address of ['0.0.0.0', '224.0.0.1', '255.255.255.255']) await expect(host.start(address, 47831)).rejects.toMatchObject({ code: 'INVALID_ADDRESS' })
  })

})
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const a = server.address(); if (!a || typeof a === 'string') throw Error('missing address')
  return { address: '127.0.0.1', port: a.port }
}

async function rawBegin(f: Awaited<ReturnType<typeof fixture>>, localAddress?: string) {
  const response = await pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/pair/begin', method: 'POST', body: { installationId, nonce: 'a'.repeat(64), proof: 'b'.repeat(64) }, localAddress })
  return response.body as { pairId: string; fingerprint: string }
}
function pairRequest(f: Awaited<ReturnType<typeof fixture>>, action: string, body: unknown, proof = 'b'.repeat(64)) {
  return pinnedRequest({ address: f.address, trust: f.trust, path: '/v1/pair/' + action, method: 'POST', body, proof })
}
async function rawHttp(f: Awaited<ReturnType<typeof fixture>>, path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: f.address.address, port: f.address.port, servername: identity.serverName, ca: identity.certificate, path, method, headers: { 'x-planrail-protocol': '1', ...headers }, agent: false }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }))
    })
    req.on('error', reject); req.end()
  })
}
