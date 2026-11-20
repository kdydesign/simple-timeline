import type { PrRequest } from './postrail'

export interface PrStart {
  request: PrRequest
  environmentId: string
  count: string
  allowPlaintext?: boolean
  approvedHttpUrls?: string[]
}
export type PrPhase = 'idle' | 'authenticating' | 'running' | 'stopping' | 'completed' | 'stopped' | 'failed'
export interface PrRunState {
  phase: PrPhase
  runId: string
  requestId: string
  requestName: string
  environmentId: string
  environmentName: string
  total: string
  completed: string
  failed: string
  uncertain: string
  message: string
  authenticatedEnvironmentIds: string[]
}
export interface PrRow {
  iteration: string
  index: string | null
  outcome: 'success' | 'error' | 'uncertain' | 'unsent'
  status: number | null
  durationMs: number
  message: string
}
export interface PrDetail extends PrRow {
  body: string
  headers: Record<string, string>
}

export function postRailBusy(phase: PrPhase) {
  return phase === 'authenticating' || phase === 'running' || phase === 'stopping'
}
export function validPostRailCount(count: string) {
  return typeof count === 'string' && /^[1-9]\d*$/.test(count)
}
export function usesPostRailIndex(request: Pick<PrRequest, 'method' | 'body'>) {
  if (request.method !== 'POST' || !request.body.includes('${index}') && !request.body.includes('\\')) return false
  let found = false
  try {
    JSON.parse(request.body, (_key, value) => {
      if (typeof value === 'string' && value.includes('${index}')) found = true
      return value
    })
  } catch { /* The editor also calls this while JSON is incomplete. */ }
  return found
}
