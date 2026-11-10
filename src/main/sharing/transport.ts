import { request } from 'node:https'
import { checkServerIdentity, connect } from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { normalizeIPv4, validatePort } from '../../domain/sharing'
import type { SharingAddress } from '../../shared/sharing'
import { certificatePin, hostServerName } from './identity'

export const REQUEST_LIMIT = 1024 * 1024
export const RESPONSE_LIMIT = 16 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 5000
export interface HostTrust { hostId: string; serverName: string; certificate: string; pin: string }
export class SharingNetworkError extends Error {
  constructor(readonly code: string, readonly status?: number) { super(messageFor(code)); this.name = 'SharingNetworkError' }
}
function messageFor(code: string): string {
  const messages: Record<string, string> = {
    TLS_UNTRUSTED: '호스트 인증서가 일치하지 않습니다. 공유 설정을 확인하세요.',
    TIMEOUT: '호스트 응답 시간이 초과되었습니다.', ABORTED: '공유 연결 요청이 취소되었습니다.',
    UNAUTHORIZED: '승인된 PC 주소와 연결 자격을 확인하세요.', REVOKED: '호스트가 이 PC의 공유 승인을 해제했습니다.',
    PAIR_EXPIRED: '연결 승인 시간이 만료되었습니다. 다시 연결하세요.', PAIR_PENDING: '양쪽 PC의 연결 승인을 기다리고 있습니다.',
    FINGERPRINT_MISMATCH: '양쪽 PC의 전체 확인값이 일치하지 않습니다.',
    PROTOCOL_MISMATCH: '공유 프로그램 버전이 호환되지 않습니다.', DATASET_MISMATCH: '호스트의 공유 데이터가 변경되었습니다. 공유 설정을 확인하세요.',
    HOST_MISMATCH: '선택한 호스트의 신원이 기존 호스트와 다릅니다.', RESPONSE_TOO_LARGE: '공유 응답 크기 제한을 초과했습니다.',
    REQUEST_TOO_LARGE: '공유 요청 크기 제한을 초과했습니다.', RATE_LIMITED: '연결 요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
    PAIR_LIMIT: '대기 중인 연결 요청이 너무 많습니다.', DELIVERY_CONSUMED: '연결 자격 수령이 완료되지 않았습니다. 다시 승인하세요.',
    PAIRING_INCOMPLETE: '연결 자격 수령 확인이 필요합니다. 다시 연결하세요.', INVALID_RESPONSE: '호스트의 공유 응답을 확인할 수 없습니다.',
  }
  return messages[code] ?? '공유 연결을 확인할 수 없습니다. 공유 설정을 확인하세요.'
}
function endpoint(address: SharingAddress): SharingAddress {
  return { address: normalizeIPv4(address.address), port: validatePort(address.port) }
}
function validateTrust(trust: HostTrust) {
  if (trust.serverName !== hostServerName(trust.hostId) || certificatePin(trust.certificate) !== trust.pin) throw new SharingNetworkError('TLS_UNTRUSTED')
}
export function networkError(error: unknown): SharingNetworkError {
  if (error instanceof SharingNetworkError) return error
  const code = (error as NodeJS.ErrnoException)?.code ?? ''
  if (/CERT|TLS|SELF_SIGNED|VERIFY|SIGNATURE/.test(code)) return new SharingNetworkError('TLS_UNTRUSTED')
  return new SharingNetworkError('UNAVAILABLE')
}
/** Candidate-only TLS handshake. No HTTP, credentials, or application payload is sent. */
export async function discoverHost(address: string, port: number, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<HostTrust> {
  const target = endpoint({ address, port })
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new SharingNetworkError('ABORTED'))
    // The sole untrusted socket is destroyed after reading its certificate and is never reused.
    const socket = connect({ host: target.address, port: target.port, minVersion: 'TLSv1.2', rejectUnauthorized: false })
    const finish = (error?: unknown, trust?: HostTrust) => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); socket.destroy(); error ? reject(networkError(error)) : resolve(trust!) }
    const abort = () => finish(new SharingNetworkError('ABORTED'))
    const timer = setTimeout(() => finish(new SharingNetworkError('TIMEOUT')), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    options.signal?.addEventListener('abort', abort, { once: true })
    socket.once('error', e => finish(e))
    socket.once('secureConnect', () => {
      try {
        const cert = new X509Certificate(socket.getPeerCertificate().raw)
        const name = cert.subjectAltName?.match(/^DNS:(planrail-([a-f0-9-]{36})\.local)$/)
        if (!name) throw new SharingNetworkError('TLS_UNTRUSTED')
        const trust = { hostId: name[2], serverName: name[1], certificate: cert.toString(), pin: certificatePin(cert.raw) }
        validateTrust(trust)
        finish(undefined, trust)
      } catch (e) { finish(e) }
    })
  })
}
export interface PinnedRequestOptions {
  address: SharingAddress; trust: HostTrust; path: string; method?: 'GET' | 'POST'
  body?: unknown; token?: string; proof?: string; etag?: string; signal?: AbortSignal
  timeoutMs?: number; localAddress?: string
}
export interface TransportResponse { status: number; body: unknown; etag?: string }
export async function pinnedRequest(options: PinnedRequestOptions): Promise<TransportResponse> {
  const target = endpoint(options.address)
  validateTrust(options.trust)
  if (!/^\/v1\/[a-z/]+$/.test(options.path)) throw new SharingNetworkError('INVALID_REQUEST')
  const data = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body))
  if (data && data.length > REQUEST_LIMIT) throw new SharingNetworkError('REQUEST_TOO_LARGE')
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new SharingNetworkError('ABORTED'))
    const req = request({ host: target.address, port: target.port, servername: options.trust.serverName, ca: options.trust.certificate,
      minVersion: 'TLSv1.2', rejectUnauthorized: true, agent: false, localAddress: options.localAddress,
      checkServerIdentity: (name, cert) => checkServerIdentity(name, cert) ?? (certificatePin(cert.raw) === options.trust.pin ? undefined : new SharingNetworkError('TLS_UNTRUSTED')),
      path: options.path, method: options.method ?? 'GET', headers: {
        'x-planrail-protocol': '1', ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.proof ? { 'x-planrail-proof': options.proof } : {}), ...(options.etag ? { 'if-none-match': options.etag } : {}),
      },
    })
    let settled = false
    const finish = (error?: unknown, response?: TransportResponse) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); error ? reject(networkError(error)) : resolve(response!) }
    const failRequest = (error: SharingNetworkError) => { finish(error); req.destroy() }
    const abort = () => failRequest(new SharingNetworkError('ABORTED'))
    const timer = setTimeout(() => failRequest(new SharingNetworkError('TIMEOUT')), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    options.signal?.addEventListener('abort', abort, { once: true })
    req.once('error', e => finish(e))
    req.once('response', res => {
      const chunks: Buffer[] = []; let bytes = 0
      if (Number(res.headers['content-length']) > RESPONSE_LIMIT) { failRequest(new SharingNetworkError('RESPONSE_TOO_LARGE')); res.destroy(); return }
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > RESPONSE_LIMIT) { failRequest(new SharingNetworkError('RESPONSE_TOO_LARGE')); res.destroy() } else chunks.push(chunk) })
      res.once('error', e => finish(e))
      res.once('aborted', () => finish(new SharingNetworkError('INVALID_RESPONSE')))
      res.once('end', () => {
        try {
          const status = res.statusCode ?? 0
          const body: unknown = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
          if (status !== 200 && status !== 202 && status !== 304) {
            const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'INVALID_RESPONSE'
            throw new SharingNetworkError(code, status)
          }
          finish(undefined, { status, body, etag: typeof res.headers.etag === 'string' ? res.headers.etag : undefined })
        } catch (e) { finish(e instanceof SharingNetworkError ? e : new SharingNetworkError('INVALID_RESPONSE')) }
      })
    })
    req.end(data)
  })
}
