export const nodeManagementChannel = 'node-management:command'
export const nodeManagementChanged = 'node-management:changed'

export interface NodeRelease {
  version: string
  date: string
  lts: string | null
  ltsKnown?: boolean
  sourceOnly?: boolean
  installReason?: string | null
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
  | 'zip-download' | 'zip-integrity' | 'zip-permission' | 'zip-incomplete' | 'zip-extraction' | 'zip-blocked'
  | 'download-failed' | 'integrity-failed' | 'verification-failed'
  | 'nvm-list-unsupported' | 'nvm-settings-check' | 'command-processor-check' | 'command-autorun' | 'nvm-staging-failed'

export interface NodeManagementError {
  code: NodeManagementErrorCode
  message: string
}

export interface NodeConflict {
  code: 'standalone-node' | 'path-priority' | 'link-occupied' | 'link-not-on-path' | 'mirror' | 'proxy' | 'manager-configuration'
  /** Display-only location of a detected conflict. It is never accepted as input. */
  path: string | null
  message: string
}

export interface NodeEnvironment {
  id: string
  label: string
  kind: 'windows' | 'wsl2'
  distro?: string
  user?: string
  running: boolean
}

export function isEnvironmentId(value: unknown): value is string {
  return value === 'windows' || (typeof value === 'string' && /^wsl:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?![\s\S])/.test(value))
}

export interface NodeOperation {
  kind: 'install' | 'use' | 'install-manager' | 'remove-standalone'
  version: string | null
  cancellable?: boolean
  phase: 'checking' | 'downloading' | 'authenticating' | 'extracting' | 'compiling' | 'waiting' | 'verifying'
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
  environments?: { status: 'loading' | 'ready' | 'error'; items: NodeEnvironment[]; selectedId: string | null; error: NodeManagementError | null }
  operationLogPath?: string
  operationLog?: string[]
  capabilities?: NodeCapabilities
  removal?: StandaloneRemovalState
  maintenance?: { required: boolean; active: boolean; status?: 'idle' | 'preparing' | 'ready' | 'error'; error?: string | null; recoveryShortcut?: string }
  revision: number
  platform: string
  supported: boolean
  manager: { kind?: 'nvm-windows' | 'nodenv'; path?: string; status: 'checking' | 'missing' | 'ready' | 'error'; version: string | null }
  configuredDefaultVersion?: string
  activeVersion: string | null
  activeSource: 'nvm' | 'nodenv' | 'standalone' | null
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
  selectEnvironment(id: string): Promise<NodeManagementResult>
  startEnvironment(): Promise<NodeManagementResult>
  cancelOperation(): Promise<NodeManagementResult>
  getState(intent?: 'recheck'): Promise<NodeManagementResult>
  refreshCatalog(): Promise<NodeManagementResult>
  install(version: string): Promise<NodeManagementResult>
  use(version: string): Promise<NodeManagementResult>
  installManager(): Promise<NodeManagementResult>
  removeStandalone(input: StandaloneRemovalConfirmation): Promise<NodeManagementResult>
  openManagerFolder(expectedEnvironmentId: string): Promise<NodeManagementResult>
  openManagerRelease(expectedEnvironmentId: string): Promise<NodeManagementResult>
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
