import type { Result } from './types'

export const UPDATE_PROTOCOL_VERSION = 1 as const
export const UPDATE_APP_ID = 'com.kdydesign.simpletimeline' as const
export const updatesChannel = 'updates:command'
export const updatesChanged = 'updates:changed'
export const updatesGuard = 'updates:guard'
export const updatesGuardReply = 'updates:guard-reply'
export interface UpdateGuardRequest { requestId: string; action: 'freeze' | 'release' }
export type UpdateFileId = 'installer' | 'blockmap' | 'metadata' | 'guide'
export interface UpdateFile { id: UpdateFileId; name: string; size: number; sha256: string; sha512: string }
export interface UpdateManifest {
  schemaVersion: 1
  appId: typeof UPDATE_APP_ID
  version: string
  platform: 'win32'
  arch: 'x64'
  installerType: 'nsis'
  installScope: 'per-user'
  sourceSha: string
  signed: false
  validationUpdateOnly: false
  files: UpdateFile[]
}
export interface UpdateRelease { releaseId: string; manifest: UpdateManifest }
export interface UpdatePublication extends UpdateRelease {
  protocolVersion: 1
  hostId: string
  revision: number
  publicationId: string
}
export interface UpdateStatus { protocolVersion: 1; hostId: string; revision: number; publication: UpdatePublication | null }
export interface UpdateCatalogState { revision: number; current: UpdateRelease | null; candidate: UpdateRelease | null; publication: UpdatePublication | null; cleanupPending: boolean }
export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'verifying' | 'waiting' | 'installing' | 'error'
export type UpdateErrorCode = 'invalid-bundle' | 'host-mismatch' | 'storage' | 'network' | 'integrity' | 'withdrawn' | 'replaced' | 'trust-changed' | 'unsupported' | 'shutdown' | 'install'
/** Renderer snapshots contain display data and allowed actions only, never paths or credentials. */
export interface UpdateState {
  revision: number
  role: 'personal' | 'host' | 'member'
  phase: UpdatePhase
  version: string | null
  totalBytes: number
  receivedBytes: number
  connected: boolean
  editingBlocked: boolean
  requiresExplicitInstall: boolean
  canDownload: boolean
  canCancel: boolean
  canRetry: boolean
  canInstall: boolean
  error: UpdateErrorCode | null
  host: { importing: boolean; currentVersion: string | null; candidateVersion: string | null; candidateBytes: number; publishing: boolean; canPublish: boolean } | null
}
export interface UpdateApi {
  getState(): Promise<Result<UpdateState>>
  importBundle(): Promise<Result<UpdateState>>
  publish(): Promise<Result<UpdateState>>
  withdraw(): Promise<Result<UpdateState>>
  download(): Promise<Result<UpdateState>>
  cancel(): Promise<Result<UpdateState>>
  retry(): Promise<Result<UpdateState>>
  install(): Promise<Result<UpdateState>>
  onChange(callback: (state: UpdateState) => void): () => void
  /** Freeze every editable form before returning true; await saves, return false for dirty/missing state. Release restores editing. */
  onInstallGuard(callback: (request: UpdateGuardRequest) => boolean | Promise<boolean>): () => void
}
export function compareStableVersions(left: string, right: string): -1 | 0 | 1 {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid stable version')
    const parts = value.split('.').map(Number)
    if (parts.some(n => !Number.isSafeInteger(n))) throw new Error('Invalid stable version')
    return parts
  }
  const a = parse(left), b = parse(right)
  for (let i = 0; i < 3; i++) { if (a[i] > b[i]) return 1; if (a[i] < b[i]) return -1 }
  return 0
}
