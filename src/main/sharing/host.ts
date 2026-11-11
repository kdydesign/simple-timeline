import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'
import { normalizeIPv4, validatePort, validateSharingIdentity, validateWireSnapshot } from '../../domain/sharing'
import type { SharingStore } from '../db/sharing/store'
import type { SharingAddress } from '../../shared/sharing'
import { certificatePin, hostServerName, type HostIdentity } from './identity'
import { REQUEST_LIMIT, REQUEST_TIMEOUT_MS, RESPONSE_LIMIT, SharingNetworkError } from './transport'

type StoreMethods = Pick<SharingStore, 'getDevice' | 'listDevices' | 'getDeviceInstallationId' | 'saveDevice' | 'putCredential' | 'activateCredential' | 'revokePendingCredentials' | 'findCredential' | 'getWireSnapshot'>
export type HostStore = { [K in keyof StoreMethods]: (...args: Parameters<StoreMethods[K]>) => ReturnType<StoreMethods[K]> } & { getConfig(): { hostId: string; datasetId: string } }
export interface PendingPair { pairId: string; deviceId: string; name: string; ip: string; fingerprint: string; expiresAt: string }
interface Attempt extends PendingPair { installationId: string; proof: string; hostApproved: boolean; memberApproved: boolean; deadline: number; tokenHash?: string; acknowledged: boolean }
export const hashCredential = (token: string) => createHash('sha256').update(token).digest('hex')
export function pairFingerprint(input: { hostId: string; pin: string; pairId: string; nonce: string; proof: string }): string {
  return createHash('sha256').update(JSON.stringify(['Planrail pairing v1', input.hostId, input.pin, input.pairId, input.nonce, input.proof])).digest('hex').toUpperCase()
}
const secretEqual = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
function fail(code: string, status = 400): never { throw new SharingNetworkError(code, status) }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) fail('INVALID_REQUEST')
  return value as Record<string, unknown>
}
function hex(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_REQUEST'); return value }
function readBody(req: IncomingMessage): Promise<unknown> {
  if (Number(req.headers['content-length']) > REQUEST_LIMIT) return Promise.reject(new SharingNetworkError('REQUEST_TOO_LARGE', 413))
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0
    const data = (chunk: Buffer) => { size += chunk.length; if (size > REQUEST_LIMIT) { req.removeListener('data', data); req.resume(); reject(new SharingNetworkError('REQUEST_TOO_LARGE', 413)) } else chunks.push(chunk) }
    req.on('data', data)
    req.once('error', reject)
    req.once('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new SharingNetworkError('INVALID_REQUEST', 400)) } })
  })
}
function send(res: ServerResponse, status: number, body?: unknown, etag?: string) {
  const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  if (bytes && bytes.length > RESPONSE_LIMIT) fail('RESPONSE_TOO_LARGE', 413)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close', ...(bytes ? { 'content-length': bytes.length } : {}), ...(etag ? { etag } : {}) })
  res.end(bytes)
}
export function createSharingHost(options: { identity: HostIdentity; store: HostStore; onChange?: () => void; now?: () => number }) {
  const { identity, store } = options
  const now = options.now ?? (() => performance.now())
  const attempts = new Map<string, Attempt>()
  const rate = new Map<string, { start: number; count: number }>()
  let server: Server | null = null
  let generation = 0
  const changed = () => { try { options.onChange?.() } catch { /* Observers cannot alter credential delivery. */ } }
  const discard = (a: Attempt) => { store.revokePendingCredentials(a.deviceId); attempts.delete(a.pairId) }
  const expire = () => { for (const a of attempts.values()) if (now() >= a.deadline) discard(a) }
  const publicPair = (a: Attempt): PendingPair => ({ pairId: a.pairId, deviceId: a.deviceId, name: a.name, ip: a.ip, fingerprint: a.fingerprint, expiresAt: a.expiresAt })
  const getAttempt = (pairId: unknown, proof: unknown, ip: string) => {
    if (typeof pairId !== 'string' || typeof proof !== 'string') fail('UNAUTHORIZED', 401)
    const a = attempts.get(pairId)
    if (!a || a.ip !== ip || !secretEqual(a.proof, proof)) fail('UNAUTHORIZED', 401)
    if (now() >= a.deadline) { discard(a); changed(); fail('PAIR_EXPIRED', 410) }
    const device = store.getDevice(a.deviceId)
    if (device.revoked || device.ip !== ip) { discard(a); fail('UNAUTHORIZED', 401) }
    return a
  }
  const authenticate = (req: IncomingMessage, ip: string) => {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
    if (!token) fail('UNAUTHORIZED', 401)
    const credential = store.findCredential(hashCredential(token))
    if (!credential) fail('UNAUTHORIZED', 401)
    const device = store.getDevice(credential.deviceId)
    if (device.ip !== ip) fail('UNAUTHORIZED', 401)
    if (credential.status === 'revoked' || device.revoked) fail('REVOKED', 403)
    if (credential.status !== 'active') fail('UNAUTHORIZED', 401)
    return device
  }
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const requestGeneration = generation
    try {
      if (!server) fail('ABORTED', 503)
      const ip = req.socket.remoteAddress
      if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) fail('UNAUTHORIZED', 401)
      const clock = now()
      for (const [key, r] of rate) if (clock - r.start >= 60000) rate.delete(key)
      let r = rate.get(ip)
      if (!r) { if (rate.size >= 256) fail('RATE_LIMITED', 429); r = { start: clock, count: 0 }; rate.set(ip, r) }
      if (++r.count > 120) fail('RATE_LIMITED', 429)
      if (req.headers['x-planrail-protocol'] !== '1') fail('PROTOCOL_MISMATCH', 409)
      const config = store.getConfig()
      if (req.method === 'GET' && req.url === '/v1/identity') { send(res, 200, { protocolVersion: 1, hostId: config.hostId, datasetId: config.datasetId }); return }
      if (req.method === 'GET' && req.url === '/v1/snapshot') {
        const device = authenticate(req, ip)
        // Store owns the coherent filtered read. ETag cannot reveal private-project revisions.
        const snapshot = validateWireSnapshot(store.getWireSnapshot(device.id))
        const etag = `"${hashCredential(JSON.stringify(snapshot))}"`
        send(res, req.headers['if-none-match'] === etag ? 304 : 200, req.headers['if-none-match'] === etag ? undefined : snapshot, etag)
        return
      }
      if (req.method !== 'POST' || !['/v1/pair/begin', '/v1/pair/confirm', '/v1/pair/finish', '/v1/pair/ack'].includes(req.url ?? '')) fail('NOT_FOUND', 404)
      const body = await readBody(req)
      // stop() runs synchronously before main closes DB; late bodies must never use it.
      if (!server || requestGeneration !== generation) fail('ABORTED', 503)
      if (req.url === '/v1/pair/begin') {
        const b = object(body, ['installationId', 'nonce', 'proof'])
        const installationId = validateSharingIdentity(b.installationId), nonce = hex(b.nonce), proof = hex(b.proof)
        expire()
        const device = store.listDevices().find(d => d.ip === ip && !d.revoked)
        if (!device) fail('UNAUTHORIZED', 401)
        for (const a of attempts.values()) if (a.deviceId === device.id) discard(a)
        if (attempts.size >= 16) fail('PAIR_LIMIT', 429)
        store.revokePendingCredentials(device.id)
        const pairId = randomUUID(), fingerprint = pairFingerprint({ hostId: identity.hostId, pin: identity.pin, pairId, nonce, proof })
        const a: Attempt = { pairId, deviceId: device.id, name: device.name, ip, installationId, proof, fingerprint, expiresAt: new Date(Date.now() + 300000).toISOString(), deadline: now() + 300000, hostApproved: false, memberApproved: false, acknowledged: false }
        attempts.set(pairId, a); changed()
        send(res, 200, { ...publicPair(a), protocolVersion: 1, hostId: config.hostId, datasetId: config.datasetId })
        return
      }
      const keys = req.url === '/v1/pair/confirm' ? ['pairId', 'fingerprint'] : req.url === '/v1/pair/ack' ? ['pairId', 'token'] : ['pairId']
      const b = object(body, keys), a = getAttempt(b.pairId, req.headers['x-planrail-proof'], ip)
      if (req.url === '/v1/pair/confirm') {
        if (b.fingerprint !== a.fingerprint) fail('FINGERPRINT_MISMATCH', 409)
        a.memberApproved = true; changed(); send(res, 200, { kind: 'confirmed' }); return
      }
      if (!a.hostApproved || !a.memberApproved) { send(res, 202, { kind: 'pending' }); return }
      if (req.url === '/v1/pair/finish') {
        if (a.tokenHash) fail('DELIVERY_CONSUMED', 409)
        const token = randomBytes(32).toString('hex'), hash = hashCredential(token)
        store.putCredential({ deviceId: a.deviceId, hash }); a.tokenHash = hash
        send(res, 200, { kind: 'credential', token }); return
      }
      const token = hex(b.token)
      if (!a.tokenHash || !secretEqual(a.tokenHash, hashCredential(token))) fail('UNAUTHORIZED', 401)
      if (!a.acknowledged) { store.activateCredential(a.tokenHash); a.acknowledged = true; changed() }
      send(res, 200, { kind: 'ready' })
    } catch (error) {
      const e = error instanceof SharingNetworkError ? error : new SharingNetworkError('INVALID_REQUEST', 400)
      if (!res.headersSent && !res.destroyed) send(res, e.status ?? 400, { code: e.code })
      else res.destroy()
    }
  }
  return {
    async start(address: string, port: number): Promise<SharingAddress> {
      if (server) throw new SharingNetworkError('ALREADY_STARTED')
      address = normalizeIPv4(address)
      if (address === '0.0.0.0' || Number(address.split('.')[0]) >= 224) throw new SharingNetworkError('INVALID_ADDRESS')
      // Port zero is intentionally available to main-only loopback test callers.
      if (port !== 0 || !address.startsWith('127.')) validatePort(port)
      if (identity.hostId !== store.getConfig().hostId || identity.serverName !== hostServerName(identity.hostId) || certificatePin(identity.certificate) !== identity.pin) throw new SharingNetworkError('TLS_UNTRUSTED')
      // A restarted process cannot prove ownership of any previous delivery attempt.
      for (const device of store.listDevices()) store.revokePendingCredentials(device.id)
      const instance = createServer({ cert: identity.certificate, key: identity.privateKey, minVersion: 'TLSv1.2', handshakeTimeout: REQUEST_TIMEOUT_MS, headersTimeout: REQUEST_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS, connectionsCheckingInterval: 1000, maxHeaderSize: 16384 }, (req, res) => { void handle(req, res) })
      instance.maxConnections = 64
      instance.on('connection', socket => { const deadline = setTimeout(() => socket.destroy(), REQUEST_TIMEOUT_MS); socket.once('close', () => clearTimeout(deadline)) })
      server = instance
      try { await new Promise<void>((resolve, reject) => { instance.once('error', reject); instance.listen(port, address, () => { instance.removeListener('error', reject); resolve() }) }) } catch (e) { server = null; throw e }
      const bound = instance.address(); if (!bound || typeof bound === 'string') throw new SharingNetworkError('UNAVAILABLE')
      return { address, port: bound.port }
    },
    pending(): PendingPair[] { expire(); for(const a of attempts.values())if(store.getDevice(a.deviceId).revoked)discard(a); return [...attempts.values()].filter(a => !a.acknowledged).map(publicPair) },
    approve(pairId: string) {
      const a = attempts.get(pairId)
      if (!a) fail('PAIR_EXPIRED', 410)
      if (now() >= a.deadline) { discard(a); fail('PAIR_EXPIRED', 410) }
      const device = store.getDevice(a.deviceId)
      if (device.revoked || device.ip !== a.ip) fail('UNAUTHORIZED', 401)
      store.saveDevice({ id: device.id, name: device.name, ip: device.ip, installationId: a.installationId })
      a.hostApproved = true; changed()
    },
    async stop() {
      generation++
      const instance = server; server = null
      const abandoned = [...attempts.values()]
      attempts.clear()
      rate.clear()
      let cleanupFailed = false
      for (const a of abandoned) {
        try { store.revokePendingCredentials(a.deviceId) } catch { cleanupFailed = true }
      }
      if (instance) { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())) }
      changed()
      if (cleanupFailed) throw new SharingNetworkError('STORAGE_UNAVAILABLE')
    },
    async dispose() { await this.stop() },
  }
}
