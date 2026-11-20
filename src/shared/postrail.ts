export type PrMethod = 'GET' | 'POST' | 'DELETE'

export interface PrRequest {
  id: string
  name: string
  groupId: string | null
  method: PrMethod
  url: string
  headers: Record<string, string>
  body: string
  useAuth: boolean
  timeoutMs: number | null
  favorite: boolean
  nextIndex: string
}

export interface PrEnv {
  id: string
  name: string
  variables: Record<string, string>
  apiOrigin: string
  loginUrl: string
  loginHeaders: Record<string, string>
  loginBody: string
  tokenPath: string
  tokenHeader: string
  tokenPrefix: string
  hasPassword: boolean
}

export interface PrLibrary {
  groups: {id: string, name: string}[]
  requests: PrRequest[]
  environments: PrEnv[]
  environmentId: string | null
}

export type PrMutation =
  | {type: 'group.save', id?: string, name: string}
  | {type: 'group.delete', id: string}
  | {type: 'request.save', request: PrRequest}
  | {type: 'request.favorite', id: string, favorite: boolean}
  | {type: 'request.delete', id: string}
  | {type: 'request.duplicate', id: string, groupId: string | null}
  | {type: 'env.save', environment: PrEnv, password?: string, remember?: boolean}
  | {type: 'env.delete', id: string}
  | {type: 'env.select', id: string}

export function postRailCopyName(source: string, taken: string[]): string {
  const base = source + ' 복사본'
  const names = new Set(taken)
  let candidate = base
  for (let n = 2; names.has(candidate); n++) candidate = base + ' ' + n
  return candidate
}
