export const nodeManagementChannel = 'node-management:command'
export const nodeManagementChanged = 'node-management:changed'

export interface NodeRelease {
  version: string
  date: string
  lts: string | null
  npm: string | null
  security: boolean
}

export type NodeManagementErrorCode =
  | 'forbidden' | 'invalid-request' | 'ipc-unavailable' | 'unsupported'
  | 'busy' | 'shutdown' | 'inspection-failed' | 'catalog-unavailable'
  | 'manager-missing' | 'manager-present' | 'environment-conflict'
  | 'version-unavailable' | 'version-not-installed'
  | 'cancelled' | 'operation-failed' | 'operation-unknown' | 'operation-slow'
  | 'download-failed' | 'integrity-failed' | 'verification-failed'

export interface NodeManagementError {
  code: NodeManagementErrorCode
  message: string
}

export interface NodeConflict {
  code: 'standalone-node' | 'path-priority' | 'link-occupied' | 'link-not-on-path' | 'mirror' | 'manager-configuration'
  /** Display-only location of a detected conflict. It is never accepted as input. */
  path: string | null
  message: string
}

export interface NodeOperation {
  kind: 'install' | 'use' | 'install-manager'
  version: string | null
  phase: 'checking' | 'downloading' | 'waiting' | 'verifying'
}

export interface NodeManagementState {
  revision: number
  platform: string
  supported: boolean
  manager: { status: 'checking' | 'missing' | 'ready' | 'error'; version: string | null }
  activeVersion: string | null
  activeSource: 'nvm' | 'standalone' | null
  installedVersions: string[]
  catalog: {
    releases: NodeRelease[]
    status: 'idle' | 'loading' | 'ready' | 'error'
    checkedAt: string | null
    error: NodeManagementError | null
  }
  busy: NodeOperation | null
  error: NodeManagementError | null
  conflicts: NodeConflict[]
  checkedAt: string | null
}

export type NodeManagementResult =
  | { ok: true; data: NodeManagementState }
  | { ok: false; error: NodeManagementError }

export interface NodeManagementApi {
  getState(): Promise<NodeManagementResult>
  refreshCatalog(): Promise<NodeManagementResult>
  install(version: string): Promise<NodeManagementResult>
  use(version: string): Promise<NodeManagementResult>
  installManager(): Promise<NodeManagementResult>
  onChange(callback: (state: NodeManagementState) => void): () => void
}

export function isNodeVersion(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?![\s\S])/.test(value)
}
