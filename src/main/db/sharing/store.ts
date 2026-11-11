import { createChangeInbox } from './change-inbox'
import { changeTransaction, getChangeSnapshot } from './changes'
import { randomUUID } from 'node:crypto'
import { createRepository, RepositoryError, type DatabaseHandle } from '../repository'
import { createMemberCache } from './cache'
import { normalizeIPv4, validatePort, validateSharingIdentity } from '../../../domain/sharing'
import { normalizeName, normalizeColor, validateId } from '../../../domain/normalize'
import { DomainValidationError } from '../../../domain/error'
import type { ApprovedDevice, SharedProjectInput, SharedProjectMapping, SharingAddress, SharingRole, WireSnapshot } from '../../../shared/sharing'
export interface SharingConfig {
  hostId:string; datasetId:string; role:SharingRole; roleHistory:'host'|'member'|null
  address:string|null; port:number; hostingEnabled:boolean
  remoteHostId:string|null; remoteDatasetId:string|null; certificatePin:string|null
  credentialRef:string|null; pendingCredentialDeleteRef:string|null; certificateRef:string|null; privateKeyRef:string|null
}
export interface MemberConnection extends SharingAddress { hostId:string; datasetId:string; certificatePin:string; credentialRef:string }
export interface CredentialRecord { hash:string; deviceId:string; status:'pending'|'active'|'revoked' }
type Row=Record<string,string|bigint|null>
function requiredText(value:unknown,field:string):string {
  if(typeof value!=='string' || !value.trim())throw new DomainValidationError(field)
  return value
}
function credentialHash(value:unknown):string {
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new DomainValidationError('hash')
  return value
}
export function createSharingStore(db:DatabaseHandle) {
  const repo=createRepository(db),cache=createMemberCache(db)
  const getConfig=():SharingConfig=>{
    const r=db.prepare('SELECT * FROM sharing_config WHERE singleton=1').get() as Row|undefined
    if(!r)throw new Error('SHARING_IDENTITY_MISSING')
    const hostId=validateSharingIdentity(r.host_id),datasetId=validateSharingIdentity(r.dataset_id)
    if(r.remote_host_id!==null)validateSharingIdentity(r.remote_host_id)
    if(r.remote_dataset_id!==null)validateSharingIdentity(r.remote_dataset_id)
    return {hostId,datasetId,role:r.role as SharingRole,roleHistory:r.role_history as SharingConfig['roleHistory'],address:r.address as string|null,port:Number(r.port),hostingEnabled:!!r.hosting_enabled,remoteHostId:r.remote_host_id as string|null,remoteDatasetId:r.remote_dataset_id as string|null,certificatePin:r.certificate_pin as string|null,credentialRef:r.credential_ref as string|null,pendingCredentialDeleteRef:r.pending_credential_delete_ref as string|null,certificateRef:r.certificate_ref as string|null,privateKeyRef:r.private_key_ref as string|null}
  }
  // Missing metadata is corruption, never a trigger to generate another identity.
  getConfig()
  const requireHost=()=>{if(getConfig().role!=='host')throw new Error('SHARING_ROLE_FORBIDDEN')}
  const deviceDto=(r:Row):ApprovedDevice=>({id:String(r.id),name:String(r.name),ip:String(r.ip),revoked:!!r.revoked,approved:!!r.approved})
  const getDevice=(id:string):ApprovedDevice=>{
    requiredText(id,'deviceId')
    const r=db.prepare("SELECT d.*,EXISTS(SELECT 1 FROM sharing_credentials c WHERE c.device_id=d.id AND c.status='active' AND d.revoked=0) AS approved FROM sharing_devices d WHERE d.id=?").get(id) as Row|undefined
    if(!r)throw new RepositoryError()
    return deviceDto(r)
  }
  const listDevices=():ApprovedDevice[]=>(db.prepare("SELECT d.*,EXISTS(SELECT 1 FROM sharing_credentials c WHERE c.device_id=d.id AND c.status='active' AND d.revoked=0) AS approved FROM sharing_devices d WHERE d.deleted=0 ORDER BY d.rowid").all() as Row[]).map(deviceDto)
  const listSharedProjects=db.transaction(():SharedProjectMapping[]=>{
    const result=new Map<string,SharedProjectMapping>()
    for(const r of db.prepare('SELECT project_id FROM sharing_projects ORDER BY project_id').all() as Row[])result.set(String(r.project_id),{id:String(r.project_id),participants:[]})
    for(const r of db.prepare('SELECT r.project_id,r.device_id,p.name FROM sharing_recipients r JOIN project_participants p ON p.project_id=r.project_id AND p.position=r.position ORDER BY r.project_id,r.position').all() as Row[])result.get(String(r.project_id))!.participants.push({name:String(r.name),deviceId:String(r.device_id)})
    return [...result.values()]
  })
  return {
    getConfig,getDevice,listDevices,listSharedProjects,
    getChangeSnapshot:(deviceId:string,cursor:string|null,reconnecting:boolean)=>getChangeSnapshot(db,deviceId,cursor,reconnecting,()=>createSharingStore(db).getWireSnapshot(deviceId)),
    getDeviceInstallationId:(id:string):string|null=>{
      getDevice(id)
      const row=db.prepare('SELECT installation_id FROM sharing_devices WHERE id=?').get(id) as Row
      return row.installation_id as string|null
    },
    configureHost:db.transaction((input:SharingAddress)=>{
      const c=getConfig()
      if(c.roleHistory==='member')throw new Error('SHARING_ROLE_FORBIDDEN')
      const address=normalizeIPv4(input.address),port=validatePort(input.port)
      db.prepare("UPDATE sharing_config SET role='host',role_history='host',address=?,port=? WHERE singleton=1").run(address,port)
      return getConfig()
    }),
    setHosting:({enabled}:{enabled:boolean})=>{
      requireHost();if(typeof enabled!=='boolean')throw new DomainValidationError('enabled')
      db.prepare('UPDATE sharing_config SET hosting_enabled=? WHERE singleton=1').run(Number(enabled));return getConfig()
    },
    setHostIdentity:db.transaction((input:{certificatePin:string;certificateRef:string;privateKeyRef:string})=>{
      requireHost()
      const pin=requiredText(input.certificatePin,'certificatePin'),certificateRef=requiredText(input.certificateRef,'certificateRef'),privateKeyRef=requiredText(input.privateKeyRef,'privateKeyRef')
      const current=getConfig()
      if(current.certificatePin && (current.certificatePin!==pin || current.certificateRef!==certificateRef || current.privateKeyRef!==privateKeyRef))throw new Error('SHARING_IDENTITY_REPLACEMENT_FORBIDDEN')
      db.prepare('UPDATE sharing_config SET certificate_pin=?,certificate_ref=?,private_key_ref=? WHERE singleton=1').run(pin,certificateRef,privateKeyRef)
      return getConfig()
    }),
    connectMember:db.transaction((input:MemberConnection)=>{
      const c=getConfig()
      if(c.roleHistory==='host')throw new Error('SHARING_ROLE_FORBIDDEN')
      if(c.pendingCredentialDeleteRef)throw new Error('SHARING_CREDENTIAL_DELETE_PENDING')
      const address=normalizeIPv4(input.address),port=validatePort(input.port),hostId=validateSharingIdentity(input.hostId),datasetId=validateSharingIdentity(input.datasetId)
      const pin=requiredText(input.certificatePin,'certificatePin'),credentialRef=requiredText(input.credentialRef,'credentialRef')
      if(c.remoteHostId && c.remoteHostId!==hostId)throw new Error('SHARING_HOST_MISMATCH')
      if(c.role==='member' && c.certificatePin && c.certificatePin!==pin)throw new Error('SHARING_CERTIFICATE_MISMATCH')
      if(c.role==='member' && c.remoteDatasetId && c.remoteDatasetId!==datasetId)throw new Error('SHARING_DATASET_MISMATCH')
      db.prepare("UPDATE sharing_config SET role='member',role_history='member',address=?,port=?,remote_host_id=?,remote_dataset_id=?,certificate_pin=?,credential_ref=? WHERE singleton=1").run(address,port,hostId,datasetId,pin,credentialRef)
      return getConfig()
    }),
    disconnectMember:db.transaction((input:{confirmed:true})=>{
      if(input.confirmed!==true)throw new DomainValidationError('confirmed')
      if(getConfig().role!=='member')throw new Error('SHARING_ROLE_FORBIDDEN')
      if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sharing_change_settings'").get())createChangeInbox(db).reset()
      else cache.clear()
      db.prepare("UPDATE sharing_config SET role='personal',hosting_enabled=0,remote_dataset_id=NULL,pending_credential_delete_ref=COALESCE(credential_ref,pending_credential_delete_ref),credential_ref=NULL WHERE singleton=1").run()
      return getConfig()
    }),
    completeCredentialDeletion:db.transaction((ref:string)=>{
      requiredText(ref,'credentialRef')
      const c=getConfig()
      if(c.role!=='personal'||c.credentialRef!==null||c.pendingCredentialDeleteRef!==ref)throw new Error('SHARING_CREDENTIAL_DELETE_MISMATCH')
      db.prepare('UPDATE sharing_config SET pending_credential_delete_ref=NULL WHERE singleton=1').run()
      return getConfig()
    }),
    saveDevice:changeTransaction(db,(input:{id?:string;name:string;ip:string;installationId?:string})=>{
      requireHost()
      const name=normalizeName(input.name),ip=normalizeIPv4(input.ip)
      const duplicate=db.prepare('SELECT id FROM sharing_devices WHERE ip=? AND revoked=0 AND id<>?').get(ip,input.id??'')
      if(duplicate)throw new DomainValidationError('ip','이미 등록된 IP입니다. 다른 참여자의 IP를 입력해 주세요.')
      const installationId=input.installationId===undefined?null:validateSharingIdentity(input.installationId)
      if(input.id!==undefined){const d=getDevice(input.id);if(d.revoked)throw new Error('SHARING_DEVICE_REVOKED')
        db.prepare('UPDATE sharing_devices SET name=?,ip=?,installation_id=COALESCE(?,installation_id) WHERE id=?').run(name,ip,installationId,d.id)
        return getDevice(d.id)
      }
      const id=randomUUID()
      db.prepare('INSERT INTO sharing_devices(id,name,ip,installation_id) VALUES(?,?,?,?)').run(id,name,ip,installationId)
      return getDevice(id)
    }),
    revokeDevice:changeTransaction(db,({id}:{id:string})=>{
      requireHost();getDevice(id)
      db.prepare('UPDATE sharing_devices SET revoked=1 WHERE id=?').run(id)
      db.prepare("UPDATE sharing_credentials SET status='revoked' WHERE device_id=?").run(id)
      db.prepare('DELETE FROM sharing_recipients WHERE device_id=?').run(id)
      return getDevice(id)
    }),
    deleteDevice:changeTransaction(db,({id}:{id:string})=>{
      requireHost();getDevice(id)
      // Keep a revoked identity so previously paired PCs receive REVOKED and clear their cache.
      db.prepare('UPDATE sharing_devices SET revoked=1,deleted=1 WHERE id=?').run(id)
      db.prepare("UPDATE sharing_credentials SET status='revoked' WHERE device_id=?").run(id)
      db.prepare('DELETE FROM sharing_recipients WHERE device_id=?').run(id)
    }),
    putCredential:db.transaction((input:{deviceId:string;hash:string})=>{
      requireHost();const device=getDevice(input.deviceId);if(device.revoked)throw new Error('SHARING_DEVICE_REVOKED')
      const hash=credentialHash(input.hash)
      // Re-pairing invalidates incomplete delivery; old hashes remain recognizable and revoked.
      db.prepare("UPDATE sharing_credentials SET status='revoked' WHERE device_id=? AND status='pending'").run(device.id)
      db.prepare("INSERT INTO sharing_credentials(hash,device_id,status) VALUES(?,?,'pending')").run(hash,device.id)
    }),
    revokePendingCredentials:db.transaction((deviceId:string)=>{
      requireHost();getDevice(deviceId)
      db.prepare("UPDATE sharing_credentials SET status='revoked' WHERE device_id=? AND status='pending'").run(deviceId)
    }),
    activateCredential:db.transaction((hash:string)=>{
      requireHost();credentialHash(hash)
      const r=db.prepare("SELECT c.device_id FROM sharing_credentials c JOIN sharing_devices d ON d.id=c.device_id WHERE c.hash=? AND c.status='pending' AND d.revoked=0").get(hash) as Row|undefined
      if(!r)throw new Error('SHARING_CREDENTIAL_FORBIDDEN')
      db.prepare("UPDATE sharing_credentials SET status='revoked' WHERE device_id=? AND status='active'").run(String(r.device_id))
      db.prepare("UPDATE sharing_credentials SET status='active' WHERE hash=?").run(hash)
    }),
    findCredential:(hash:string):CredentialRecord|undefined=>{
      credentialHash(hash)
      const r=db.prepare('SELECT * FROM sharing_credentials WHERE hash=?').get(hash) as Row|undefined
      return r?{hash:String(r.hash),deviceId:String(r.device_id),status:r.status as CredentialRecord['status']}:undefined
    },
    saveProject:changeTransaction(db,(input:SharedProjectInput)=>{
      requireHost()
      if(!Array.isArray(input.participants))throw new DomainValidationError('participants')
      const name=normalizeName(input.name),color=normalizeColor(input.color)
      const names=new Set<string>(),devices=new Set<string>()
      const participants=input.participants.map(p=>{
        if(!p || typeof p!=='object' || Object.keys(p).length!==2 || Object.keys(p).some(k=>k!=='name'&&k!=='deviceId'))throw new DomainValidationError('participants')
        const name=normalizeName(p.name,'participants'),device=getDevice(p.deviceId)
        if(device.revoked || names.has(name) || devices.has(device.id))throw new DomainValidationError('participants')
        names.add(name);devices.add(device.id);return {name,deviceId:device.id}
      })
      const values={name,color,participants:participants.map(p=>p.name)}
      const project=input.id===undefined?repo.createProject(values):repo.updateProject({...values,id:validateId(input.id)})
      db.prepare('INSERT OR IGNORE INTO sharing_projects(project_id) VALUES(?)').run(BigInt(project.id))
      db.prepare('DELETE FROM sharing_recipients WHERE project_id=?').run(BigInt(project.id))
      const insert=db.prepare('INSERT INTO sharing_recipients(project_id,position,device_id) VALUES(?,?,?)')
      participants.forEach((p,i)=>insert.run(BigInt(project.id),i,p.deviceId))
      return {...project,sharing:'host' as const}
    }),
    getWireSnapshot:db.transaction((deviceId:string):WireSnapshot=>{
      requireHost();if(getDevice(deviceId).revoked)throw new Error('SHARING_DEVICE_REVOKED')
      const c=getConfig(),allowed=new Set((db.prepare('SELECT project_id FROM sharing_recipients WHERE device_id=?').all(deviceId) as Row[]).map(r=>String(r.project_id)))
      const snapshot=repo.getSnapshot()
      return {protocolVersion:1,hostId:c.hostId,datasetId:c.datasetId,
        projects:snapshot.projects.filter(p=>allowed.has(p.id)).map(p=>({id:p.id,name:p.name,color:p.color,participants:p.participants,createdAt:p.createdAt,updatedAt:p.updatedAt})),
        schedules:snapshot.schedules.filter(s=>allowed.has(s.projectId)).map(s=>({id:s.id,projectId:s.projectId,name:s.name,startDate:s.startDate,endDate:s.endDate,createdAt:s.createdAt,updatedAt:s.updatedAt})),
      }
    }),
    applyCache:cache.apply,readCache:cache.read,clearCache:cache.clear,saveReminder:cache.saveReminder,
  }
}
export type SharingStore=ReturnType<typeof createSharingStore>
