import { randomBytes } from 'node:crypto'
import { validateSharingIdentity, validateWireSnapshot } from '../../domain/sharing'
import type { SharingAddress, WireSnapshot } from '../../shared/sharing'
import { pairFingerprint, type PendingPair } from './host'
import { pinnedRequest, SharingNetworkError, type HostTrust, type TransportResponse } from './transport'

export interface ClientConnection {
  address: SharingAddress
  trust: HostTrust
  datasetId: string
  token: string
  activation: 'pending' | 'active'
}
/** Both saves MUST be durable/protected before resolving. Secrets are main-process only. */
export interface CredentialPersistence {
  load(): Promise<ClientConnection | null>
  save(connection: ClientConnection): Promise<void>
}
export type PairOutcome = { kind: 'pending'; pair: PendingPair } | { kind: 'ready'; connection: ClientConnection }
export type PollOutcome = PairOutcome | { kind: 'snapshot'; snapshot: WireSnapshot; etag: string } | { kind: 'unchanged' } | { kind: 'revoked' }
interface ClientAttempt { pair: PendingPair; proof: string; datasetId: string; confirmed: boolean; token?: string; acknowledged?: boolean }
function bodyRecord(response: TransportResponse): Record<string, unknown> {
  if (!response.body || typeof response.body !== 'object' || Array.isArray(response.body)) throw new SharingNetworkError('INVALID_RESPONSE')
  return response.body as Record<string, unknown>
}
export class SharingClient {
  private readonly controller = new AbortController()
  private attempt: ClientAttempt | null = null
  private connection: ClientConnection | null = null
  private loaded = false
  private busy = false
  private readonly options: { installationId: string; trust: HostTrust; address: SharingAddress; persistence: CredentialPersistence; expectedDatasetId?: string; timeoutMs?: number; localAddress?: string }
  constructor(options: { installationId: string; trust: HostTrust; address: SharingAddress; persistence: CredentialPersistence; expectedDatasetId?: string; timeoutMs?: number; localAddress?: string }) {
    validateSharingIdentity(options.installationId)
    if (options.expectedDatasetId) validateSharingIdentity(options.expectedDatasetId)
    this.options = options
  }
  private checkOpen() { if (this.controller.signal.aborted) throw new SharingNetworkError('ABORTED') }
  private async request(path: string, options: { method?: 'POST'; body?: unknown; proof?: string; token?: string; etag?: string }, signal?: AbortSignal) {
    this.checkOpen()
    const response = await pinnedRequest({ ...this.options, ...options, path, signal: signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal })
    this.checkOpen()
    return response
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.checkOpen()
    if (this.busy) throw new SharingNetworkError('REQUEST_IN_PROGRESS')
    this.busy = true
    try { return await operation() } finally { this.busy = false }
  }
  private checkIdentity(b: Record<string, unknown>) {
    if (b.protocolVersion !== 1) throw new SharingNetworkError('PROTOCOL_MISMATCH')
    if (b.hostId !== this.options.trust.hostId) throw new SharingNetworkError('HOST_MISMATCH')
    let datasetId: string
    try { datasetId = validateSharingIdentity(b.datasetId) } catch { throw new SharingNetworkError('INVALID_RESPONSE') }
    if (this.options.expectedDatasetId && datasetId !== this.options.expectedDatasetId) throw new SharingNetworkError('DATASET_MISMATCH')
    return datasetId
  }
  async beginPair(options: { signal?: AbortSignal } = {}): Promise<PendingPair> {
    return this.exclusive(async () => {
      const nonce = randomBytes(32).toString('hex'), proof = randomBytes(32).toString('hex')
      this.attempt = null
      const b = bodyRecord(await this.request('/v1/pair/begin', { method: 'POST', body: { installationId: this.options.installationId, nonce, proof } }, options.signal))
      const datasetId = this.checkIdentity(b)
      if (typeof b.pairId !== 'string' || typeof b.fingerprint !== 'string' || typeof b.expiresAt !== 'string' || !Number.isFinite(Date.parse(b.expiresAt)) || typeof b.deviceId !== 'string' || typeof b.name !== 'string' || typeof b.ip !== 'string') throw new SharingNetworkError('INVALID_RESPONSE')
      const fingerprint = pairFingerprint({ hostId: this.options.trust.hostId, pin: this.options.trust.pin, pairId: b.pairId, nonce, proof })
      if (b.fingerprint !== fingerprint) throw new SharingNetworkError('FINGERPRINT_MISMATCH')
      const pair: PendingPair = { pairId: b.pairId, fingerprint, expiresAt: b.expiresAt, deviceId: b.deviceId, name: b.name, ip: b.ip }
      this.attempt = { pair, proof, datasetId, confirmed: false }
      return pair
    })
  }
  async confirmPair(pairId: string, fingerprint: string, options: { signal?: AbortSignal } = {}): Promise<PairOutcome> {
    return this.exclusive(async () => {
      const a = this.attempt
      if (!a || pairId !== a.pair.pairId) throw new SharingNetworkError('PAIR_EXPIRED')
      if (fingerprint !== a.pair.fingerprint) throw new SharingNetworkError('FINGERPRINT_MISMATCH')
      const b = bodyRecord(await this.request('/v1/pair/confirm', { method: 'POST', body: { pairId, fingerprint }, proof: a.proof }, options.signal))
      if (b.kind !== 'confirmed') throw new SharingNetworkError('INVALID_RESPONSE')
      a.confirmed = true
      return this.finishPair(a, options.signal)
    })
  }
  private async finishPair(a: ClientAttempt, signal?: AbortSignal): Promise<PairOutcome> {
    if (!a.confirmed) return { kind: 'pending', pair: a.pair }
    if (!a.token) {
      const response = await this.request('/v1/pair/finish', { method: 'POST', body: { pairId: a.pair.pairId }, proof: a.proof }, signal)
      const b = bodyRecord(response)
      if (response.status === 202 && b.kind === 'pending') return { kind: 'pending', pair: a.pair }
      if (b.kind !== 'credential' || typeof b.token !== 'string' || !/^[a-f0-9]{64}$/.test(b.token)) throw new SharingNetworkError('INVALID_RESPONSE')
      a.token = b.token
    }
    const connection: ClientConnection = { address: this.options.address, trust: this.options.trust, datasetId: a.datasetId, token: a.token, activation: 'pending' }
    // Durable secret write happens before activation. Failure leaves server credential pending.
    await this.options.persistence.save(structuredClone(connection)); this.checkOpen()
    if (!a.acknowledged) {
      const b = bodyRecord(await this.request('/v1/pair/ack', { method: 'POST', body: { pairId: a.pair.pairId, token: a.token }, proof: a.proof }, signal))
      if (b.kind !== 'ready') throw new SharingNetworkError('INVALID_RESPONSE')
      a.acknowledged = true
    }
    connection.activation = 'active'
    await this.options.persistence.save(structuredClone(connection)); this.checkOpen()
    this.connection = connection; this.loaded = true; this.attempt = null
    return { kind: 'ready', connection: structuredClone(connection) }
  }
  async poll(options: { etag?: string; force?: boolean; signal?: AbortSignal } = {}): Promise<PollOutcome> {
    return this.exclusive(async () => {
      if (this.attempt) return this.finishPair(this.attempt, options.signal)
      if (!this.loaded) {
        const saved = await this.options.persistence.load(); this.checkOpen()
        if (saved && (saved.trust.hostId !== this.options.trust.hostId || saved.trust.pin !== this.options.trust.pin)) throw new SharingNetworkError('TLS_UNTRUSTED')
        if (saved && saved.activation !== 'active') throw new SharingNetworkError('PAIRING_INCOMPLETE')
        this.connection = saved; this.loaded = true
      }
      const connection = this.connection
      if (!connection) throw new SharingNetworkError('UNAUTHORIZED')
      const etag = options.force ? undefined : options.etag
      if (etag !== undefined && !/^"[a-f0-9]{64}"$/.test(etag)) throw new SharingNetworkError('INVALID_REQUEST')
      let response: TransportResponse
      try { response = await this.request('/v1/snapshot', { token: connection.token, etag }, options.signal) }
      catch (e) { if (e instanceof SharingNetworkError && e.code === 'REVOKED' && e.status === 403) return { kind: 'revoked' }; throw e }
      if (response.status === 304) {
        if (!etag || response.etag !== etag) throw new SharingNetworkError('INVALID_RESPONSE')
        return { kind: 'unchanged' }
      }
      const b = bodyRecord(response)
      const datasetId = this.checkIdentity(b)
      if (datasetId !== connection.datasetId) throw new SharingNetworkError('DATASET_MISMATCH')
      let snapshot: WireSnapshot
      try { snapshot = validateWireSnapshot(b) } catch { throw new SharingNetworkError('INVALID_RESPONSE') }
      if (typeof response.etag !== 'string' || !/^"[a-f0-9]{64}"$/.test(response.etag)) throw new SharingNetworkError('INVALID_RESPONSE')
      return { kind: 'snapshot', snapshot, etag: response.etag }
    })
  }
  close() { this.controller.abort(); this.attempt = null; this.connection = null }
}
