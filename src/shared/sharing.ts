import type { ChangeTarget } from './change-notifications'
import type {HolidayCalendar,HolidayState} from './holidays'
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
export interface ChangeNotificationState {
  enabled:boolean
  baselining:boolean
  supported:boolean|null
  failed:number
  unknown:number
  storageError:boolean
  openRequest:{token:string;target:ChangeTarget}|null
}
export interface MemberPresence {connected:boolean;lastSeenAt:string|null}
export interface RoleTransition { target:'host'|'member'; phase:'stopping'|'cleanup'|'failed' }
export interface DormantSharingData { projects:Project[]; schedules:Schedule[]; holidays:HolidayCalendar }
export interface SharingState {
  roleTransition?:RoleTransition|null
  dormantAvailable?:boolean
  personalHolidays?:HolidayCalendar
  holidays?:HolidayState
  deviceVersions?:Record<string,{version:string|null;checkedAt:string}>
  pairingNotificationError?:boolean
  deviceVersionError?:boolean
  approvalRequestToken?:string|null
  memberPresence?:Record<string,MemberPresence>
  connectedMembers?:number
  availableAddresses: string[]
  snapshotRevision: number
  cleanupPending: boolean
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
  changeNotifications?: ChangeNotificationState
  settingsRequestToken: string | null
}
export interface SharingApi {
  switchRole(input:{role:'host'|'member';confirmed:true}):Promise<Result<SharingState>>
  getDormantData():Promise<Result<DormantSharingData>>
  savePersonalHolidays(input:{calendar:HolidayCalendar}):Promise<Result<SharingState>>
  saveHolidays(input:{calendar:HolidayCalendar}):Promise<Result<SharingState>>
  getState(): Promise<Result<SharingState>>
  configureHost(input: SharingAddress): Promise<Result<SharingState>>
  setHosting(input: { enabled: boolean }): Promise<Result<SharingState>>
  connect(input: SharingAddress): Promise<Result<SharingState>>
  confirmHost(input: { pairId: string; confirmed: true }): Promise<Result<SharingState>>
  approve(input: { pairId: string; confirmed: true }): Promise<Result<SharingState>>
  saveDevice(input: { id?: string; name: string; ip: string }): Promise<Result<ApprovedDevice>>
  deleteDevice(input: { id: string }): Promise<Result<SharingState>>
  revokeDevice(input: { id: string }): Promise<Result<SharingState>>
  saveProject(input: SharedProjectInput): Promise<Result<Project>>
  saveReminder(input: { id: string; reminder: ReminderSettings }): Promise<Result<Schedule>>
  sync(): Promise<Result<SharingState>>
  disconnect(input: { confirmed: true }): Promise<Result<SharingState>>
  setChangeNotifications(input: { enabled: boolean }): Promise<Result<SharingState>>
  retryChangeNotifications(): Promise<Result<SharingState>>
  acknowledgeChange(input: { token: string }): Promise<Result<SharingState>>
  acknowledgeSettings(input: { token: string }): Promise<Result<SharingState>>
  onChange(callback: (state: SharingState) => void): () => void
}
