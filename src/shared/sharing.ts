import type { Project, ReminderSettings, Result, Schedule } from './types'
export const SHARING_PROTOCOL_VERSION = 1 as const
export const DEFAULT_SHARING_PORT = 47831
export type SharingRole = 'personal' | 'host' | 'member'
export type WireProject = Omit<Project, 'sharing'>
export type WireSchedule = Omit<Schedule, 'reminder' | 'sharing'>
export interface WireSnapshot {
  protocolVersion: 1
  hostId: string
  datasetId: string
  projects: WireProject[]
  schedules: WireSchedule[]
}
export interface SharingAddress { address: string; port: number }
export interface SharedProjectInput { id?: string; name: string; color: string; participants: { name: string; deviceId: string }[] }
export interface ApprovedDevice { id: string; name: string; ip: string; revoked: boolean; approved: boolean }
export interface SharedProjectMapping { id: string; participants: { name: string; deviceId: string }[] }
export type SharingConnectionStatus = 'personal' | 'stopped' | 'connecting' | 'connected' | 'disconnected' | 'pairing' | 'revoked' | 'error'
export const sharingChannel = 'sharing:command'
export const sharingChanged = 'sharing:changed'
export interface SharingState {
  availableAddresses: string[]
  snapshotRevision: number
  role: SharingRole
  roleHistory: 'host' | 'member' | null
  address: string | null
  port: number
  hostingEnabled: boolean
  status: SharingConnectionStatus
  message: string
  lastCheckedAt: string | null
  pendingPair: { pairId: string; fingerprint: string; expiresAt: string } | null
  pendingPairs: { pairId: string; deviceId: string; name: string; ip: string; fingerprint: string; expiresAt: string }[]
  devices: ApprovedDevice[]
  projects: SharedProjectMapping[]
  settingsRequestToken: string | null
}
export interface SharingApi {
  getState(): Promise<Result<SharingState>>
  configureHost(input: SharingAddress): Promise<Result<SharingState>>
  setHosting(input: { enabled: boolean }): Promise<Result<SharingState>>
  connect(input: SharingAddress): Promise<Result<SharingState>>
  confirmHost(input: { pairId: string; confirmed: true }): Promise<Result<SharingState>>
  approve(input: { pairId: string; confirmed: true }): Promise<Result<SharingState>>
  saveDevice(input: { id?: string; name: string; ip: string }): Promise<Result<ApprovedDevice>>
  revokeDevice(input: { id: string }): Promise<Result<SharingState>>
  saveProject(input: SharedProjectInput): Promise<Result<Project>>
  saveReminder(input: { id: string; reminder: ReminderSettings }): Promise<Result<Schedule>>
  sync(): Promise<Result<SharingState>>
  disconnect(input: { confirmed: true }): Promise<Result<SharingState>>
  acknowledgeSettings(input: { token: string }): Promise<Result<SharingState>>
  onChange(callback: (state: SharingState) => void): () => void
}
