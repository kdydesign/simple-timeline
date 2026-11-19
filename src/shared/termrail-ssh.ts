export const termRailSshChannel = 'termrail:ssh'
export const termRailSessionLimit = 64

export interface TermRailEndpoint {
  host: string
  port: number
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
  open(id: string, endpoint: TermRailEndpoint): Promise<void>
  close(id: string): Promise<void>
  read(id: string, cursor: number): Promise<TermRailSshRead>
  trust(id: string, fingerprint: string): Promise<void>
  login(id: string, username: string, password: string): Promise<void>
  write(id: string, data: string | Uint8Array): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
}
