import {hostError} from './termrail-endpoint'

export const termRailSshChannel = 'termrail:ssh'
export const termRailSessionLimit = 64

export interface TermRailEndpoint {
  host: string
  port: number
}

export interface TermRailStartupRef {
  id: string
  name: string
}

export function isTermRailEndpoint(value: unknown): value is TermRailEndpoint {
  if (typeof value !== 'object' || value === null) return false
  const endpoint = value as Partial<TermRailEndpoint>
  return typeof endpoint.host === 'string' && !hostError(endpoint.host) &&
    typeof endpoint.port === 'number' && Number.isInteger(endpoint.port) && endpoint.port >= 1 && endpoint.port <= 65535
}

export type TermRailSshPhase = 'connecting' | 'host-key' | 'login' | 'authenticating' | 'connected' | 'closed' | 'failed'

export interface TermRailSshRead extends TermRailEndpoint {
  phase: TermRailSshPhase
  fingerprint?: string
  previousFingerprint?: string
  message?: string
  data: Uint8Array
  nextCursor: number
  truncated: boolean
  more: boolean
}

export interface TermRailSshApi {
  pickStartup(editorId: string): Promise<string | null>
  bindStartup(editorId: string, endpoint: TermRailEndpoint): Promise<TermRailStartupRef>
  finishStartup(editorId: string, savedId?: string): Promise<void>
  recoverStartup(savedIds: string[]): Promise<void>
  discardStartup(id: string): Promise<void>
  open(id: string, endpoint: TermRailEndpoint & {startupId?: string}): Promise<void>
  startProfile(id: string, startupId: string): Promise<void>
  close(id: string): Promise<void>
  read(id: string, cursor: number): Promise<TermRailSshRead>
  trust(id: string, fingerprint: string): Promise<void>
  login(id: string, username: string, password: string): Promise<void>
  write(id: string, data: string | Uint8Array): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
}
