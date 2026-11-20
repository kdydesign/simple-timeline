export type PrMethod = 'GET' | 'POST' | 'DELETE'

export type PrBodyMode = 'none' | 'json' | 'urlencoded' | 'multipart' | 'raw' | 'binary'
export interface PrField {enabled:boolean, name:string, value:string}
export interface PrQuery extends PrField {raw?:string, encodeVariables?:boolean}
export interface PrFile {id:string, name:string}
export interface PrPart extends PrField {kind:'text'|'file', mime:string, file?:PrFile|null}

export interface PrRequestOptions {
  headerRows?: PrField[]
  queryRows?: PrQuery[]
  pathValues?: Record<string,string>
  bodyMode?: PrBodyMode
  formRows?: PrField[]
  parts?: PrPart[]
  rawBody?: string
  binaryFile?: PrFile|null
  savedRepeatCount?: string|null
}

export interface PrRequest extends PrRequestOptions {
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

export interface PrEnvSave {
  environment: PrEnv
  password?: string
  remember?: boolean
}

export type PrMutation =
  | {type: 'group.save', id?: string, name: string}
  | {type: 'group.delete', id: string}
  | {type: 'request.save', request: PrRequest, copyFilesFrom?:string}
  | {type: 'request.content', request: PrRequest, baseUrl: string}
  | {type: 'request.metadata', id: string, name?: string, groupId?: string | null,
      address?: Pick<PrRequest,'url'|'queryRows'|'pathValues'>}
  | {type: 'request.move', id: string, groupId: string | null}
  | {type: 'request.favorite', id: string, favorite: boolean}
  | {type: 'request.delete', id: string}
  | {type: 'request.duplicate', id: string, groupId: string | null}
  | ({type: 'env.save'} & PrEnvSave)
  | {type: 'env.batch', saves: PrEnvSave[], deletedIds: string[]}
  | {type: 'env.delete', id: string}
  | {type: 'env.select', id: string}

export function postRailCopyName(source: string, taken: string[]): string {
  const base = source + ' 복사본'
  const names = new Set(taken)
  let candidate = base
  for (let n = 2; names.has(candidate); n++) candidate = base + ' ' + n
  return candidate
}
