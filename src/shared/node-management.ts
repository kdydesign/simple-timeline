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
  | 'confirmation-expired' | 'removal-unavailable' | 'reboot-required' | 'installer-busy'
  | 'download-failed' | 'integrity-failed' | 'verification-failed'
  | 'nvm-settings-check' | 'command-processor-check' | 'command-autorun' | 'nvm-staging-failed'

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
  kind: 'install' | 'use' | 'install-manager' | 'remove-standalone'
  version: string | null
  phase: 'checking' | 'downloading' | 'waiting' | 'verifying'
}

export interface StandaloneRemovalConfirmation { confirmed: true; confirmationId: string }
export interface StandaloneRemovalState {
  status: 'available' | 'manual' | 'unavailable'
  target: { version: string; path: string } | null
  confirmationId: string | null
  reason: string | null
  rebootRequired: boolean
  msiExitCode: number | null
}
export type NodeCapabilities = Record<'list' | 'install' | 'use', { available: boolean; reason: string | null }>
export interface NodeManagementState {
  capabilities?: NodeCapabilities
  removal?: StandaloneRemovalState
  maintenance?: { required: boolean; active: boolean; status?: 'idle' | 'preparing' | 'ready' | 'error'; error?: string | null; recoveryShortcut?: string }
  revision: number
  platform: string
  supported: boolean
  manager: { kind?: 'nvm-windows' | 'nodenv'; path?: string; status: 'checking' | 'missing' | 'ready' | 'error'; version: string | null }
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
  removeStandalone(input: StandaloneRemovalConfirmation): Promise<NodeManagementResult>
  openMaintenance(): Promise<NodeManagementResult>
  onChange(callback: (state: NodeManagementState) => void): () => void
}

export function isNodeVersion(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?![\s\S])/.test(value)
}

export function isRemovalConfirmation(value: unknown): value is StandaloneRemovalConfirmation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return Object.keys(input).length === 2 && input.confirmed === true && typeof input.confirmationId === 'string' && /^[a-f0-9]{64}$/.test(input.confirmationId)
}
