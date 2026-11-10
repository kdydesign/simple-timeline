import type { WireSnapshot } from '../shared/sharing'
import { DomainValidationError } from './error'
import { validateId, normalizeName, normalizeColor } from './normalize'
import { parseBusinessDate, inclusiveDays } from './date'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function validateSharingIdentity(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new DomainValidationError('identity')
  return value
}
export function sharedId(hostId: string, datasetId: string, remoteId: string): string {
  return `shared:${validateSharingIdentity(hostId)}:${validateSharingIdentity(datasetId)}:${validateId(remoteId)}`
}
export function parseSharedId(id: string): { hostId: string; datasetId: string; remoteId: string } {
  const parts = typeof id === 'string' ? id.split(':') : []
  if (parts.length !== 4 || parts[0] !== 'shared') throw new DomainValidationError('id')
  return { hostId: validateSharingIdentity(parts[1]), datasetId: validateSharingIdentity(parts[2]), remoteId: validateId(parts[3]) }
}
export function normalizeIPv4(value: unknown): string {
  if (typeof value !== 'string') throw new DomainValidationError('address')
  const ip = value.trim()
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(ip) || ip.split('.').some(p => Number(p) > 255)) throw new DomainValidationError('address')
  return ip
}
export function validatePort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) throw new DomainValidationError('port')
  return value
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) throw new DomainValidationError('snapshot')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new DomainValidationError('snapshot')
  return value
}
export function validateWireSnapshot(value: unknown): WireSnapshot {
  const v=record(value,['protocolVersion','hostId','datasetId','projects','schedules'])
  if(v.protocolVersion!==1 || !Array.isArray(v.projects) || !Array.isArray(v.schedules))throw new DomainValidationError('snapshot')
  const projects=v.projects.map(raw=>{
    const p=record(raw,['id','name','color','participants','createdAt','updatedAt'])
    if(!Array.isArray(p.participants))throw new DomainValidationError('participants')
    const participants=p.participants.map(n=>normalizeName(n,'participants'))
    if(new Set(participants).size!==participants.length)throw new DomainValidationError('participants')
    return {id:validateId(p.id),name:normalizeName(p.name),color:normalizeColor(p.color),participants,createdAt:text(p.createdAt),updatedAt:text(p.updatedAt)}
  })
  const ids=new Set(projects.map(p=>p.id))
  if(ids.size!==projects.length)throw new DomainValidationError('snapshot')
  const schedules=v.schedules.map(raw=>{
    const s=record(raw,['id','projectId','name','startDate','endDate','createdAt','updatedAt'])
    const startDate=parseBusinessDate(s.startDate),endDate=parseBusinessDate(s.endDate)
    inclusiveDays(startDate,endDate)
    const projectId=validateId(s.projectId)
    if(!ids.has(projectId))throw new DomainValidationError('projectId')
    return {id:validateId(s.id),projectId,name:normalizeName(s.name),startDate,endDate,createdAt:text(s.createdAt),updatedAt:text(s.updatedAt)}
  })
  if(new Set(schedules.map(s=>s.id)).size!==schedules.length)throw new DomainValidationError('snapshot')
  return {protocolVersion:1,hostId:validateSharingIdentity(v.hostId),datasetId:validateSharingIdentity(v.datasetId),projects,schedules}
}
