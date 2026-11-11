import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '../repository'
import type { WireSnapshot } from '../../../shared/sharing'
import type { ChangeEnvelope, ChangeNotice } from '../../../shared/change-notifications'
import { businessProject, genericNotice, sameBusiness, summarizeProject, validateChangeEnvelope, type BusinessProject, type BusinessSchedule } from '../../../domain/change-notifications'
type Row=Record<string,string|bigint|null>
interface State {projects:Map<string,BusinessProject>;recipients:Map<string,{deviceId:string;projectId:string;binding:string}>}
const depth=new WeakMap<DatabaseHandle,number>()
function supported(db:DatabaseHandle):boolean {
 const exists=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sharing_change_events'").get()
 if(!exists&&(Number(db.pragma('user_version',{simple:true}))>=5||db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sharing_change_settings'").get()))throw new Error('CHANGE_METADATA_MISSING')
 return exists
}
function readState(db:DatabaseHandle):State {
 const projects=new Map<string,BusinessProject>()
 for(const r of db.prepare('SELECT p.id,p.name FROM projects p JOIN sharing_projects sp ON sp.project_id=p.id ORDER BY p.id').all() as Row[])projects.set(String(r.id),{id:String(r.id),name:String(r.name),schedules:[]})
 for(const r of db.prepare('SELECT s.id,s.project_id,s.name,s.start_date,s.end_date FROM schedules s JOIN sharing_projects sp ON sp.project_id=s.project_id ORDER BY s.id').all() as Row[])projects.get(String(r.project_id))!.schedules.push({id:String(r.id),projectId:String(r.project_id),name:String(r.name),startDate:String(r.start_date),endDate:String(r.end_date)})
 const recipients=new Map<string,{deviceId:string;projectId:string;binding:string}>()
 for(const r of db.prepare('SELECT r.device_id,r.project_id,d.installation_id FROM sharing_recipients r JOIN sharing_devices d ON d.id=r.device_id WHERE d.revoked=0').all() as Row[])recipients.set(`${r.device_id}:${r.project_id}`,{deviceId:String(r.device_id),projectId:String(r.project_id),binding:String(r.installation_id??'')})
 return {projects,recipients}
}
function recordChanges(db:DatabaseHandle,before:State,after:State):void {
 const event=db.prepare('INSERT INTO sharing_change_events(device_id,project_id,generation,kind,entity_id,before_value,after_value,occurred_at) VALUES(?,?,?,?,?,?,?,?)'),now=new Date().toISOString()
 const put=(device:string,project:string,generation:string,kind:string,entity:string,a:unknown,b:unknown)=>{
  const info=event.run(device,project,generation,kind,entity,a===null?null:JSON.stringify(a),b===null?null:JSON.stringify(b),now)
  db.prepare('INSERT INTO sharing_change_streams(device_id,last_seq) VALUES(?,?) ON CONFLICT(device_id) DO UPDATE SET last_seq=excluded.last_seq').run(device,info.lastInsertRowid)
 }
 for(const [key,r] of before.recipients){
  if(after.recipients.get(key)?.binding===r.binding)continue
  const grant=db.prepare('SELECT generation FROM sharing_change_grants WHERE device_id=? AND project_id=?').get(r.deviceId,r.projectId) as Row|undefined
  if(!grant)throw new Error('CHANGE_GRANT_MISSING')
  put(r.deviceId,r.projectId,String(grant.generation),'revoke',r.projectId,null,null)
  db.prepare('DELETE FROM sharing_change_grants WHERE device_id=? AND project_id=?').run(r.deviceId,r.projectId)
 }
 for(const [key,r] of after.recipients){
  if(before.recipients.get(key)?.binding!==r.binding){
   const generation=randomUUID()
   db.prepare('INSERT INTO sharing_change_grants(device_id,project_id,generation) VALUES(?,?,?)').run(r.deviceId,r.projectId,generation)
   put(r.deviceId,r.projectId,generation,'grant',r.projectId,null,null);continue
  }
  const grant=db.prepare('SELECT generation FROM sharing_change_grants WHERE device_id=? AND project_id=?').get(r.deviceId,r.projectId) as Row|undefined
  if(!grant)throw new Error('CHANGE_GRANT_MISSING')
  const generation=String(grant.generation),a=before.projects.get(r.projectId)!,b=after.projects.get(r.projectId)!
  if(a.name!==b.name)put(r.deviceId,r.projectId,generation,'project',r.projectId,{name:a.name},{name:b.name})
  const old=new Map(a.schedules.map(s=>[s.id,s])),current=new Map(b.schedules.map(s=>[s.id,s]))
  for(const id of new Set([...old.keys(),...current.keys()])){const x=old.get(id)??null,y=current.get(id)??null;if(!sameBusiness(x,y))put(r.deviceId,r.projectId,generation,'schedule',id,x,y)}
 }
}
/** Keep each recipient's expired prefix boundary after deleting its event contents. */
function pruneEvents(db:DatabaseHandle):void {
 const threshold=new Date(Date.now()-30*86400000).toISOString()
 for(const r of db.prepare('SELECT device_id,max(seq) AS seq FROM sharing_change_events WHERE occurred_at<=? GROUP BY device_id').all(threshold) as Row[]){
  db.prepare('UPDATE sharing_change_streams SET floor_seq=max(floor_seq,?) WHERE device_id=?').run(r.seq,r.device_id)
  db.prepare('DELETE FROM sharing_change_events WHERE device_id=? AND seq<=?').run(r.device_id,r.seq)
 }
}
/** One outer business transaction observes only its final ACL, including nested repository writes. */
export function changeTransaction<Args extends unknown[],Result>(db:DatabaseHandle,fn:(...args:Args)=>Result):(...args:Args)=>Result {
 return db.transaction((...args:Args)=>{
  if((depth.get(db)??0)>0||!supported(db))return fn(...args)
  const before=readState(db);depth.set(db,1)
  try {const result=fn(...args);recordChanges(db,before,readState(db));pruneEvents(db);return result}finally{depth.delete(db)}
 })
}
function hash(value:string):string {return createHash('sha256').update(value).digest('hex')}
export function getChangeSnapshot(db:DatabaseHandle,deviceId:string,cursor:string|null,reconnecting:boolean,readSnapshot:()=>WireSnapshot):ChangeEnvelope {
 return db.transaction(()=>{
  if(typeof reconnecting!=='boolean'||(cursor!==null&&(typeof cursor!=='string'||!/^[a-f0-9]{64}$/.test(cursor))))throw new Error('CHANGE_CURSOR_INVALID')
  const snapshot=readSnapshot(),device=db.prepare('SELECT installation_id FROM sharing_devices WHERE id=?').get(deviceId) as Row
  const credential=db.prepare("SELECT hash FROM sharing_credentials WHERE device_id=? AND status='active'").get(deviceId) as Row|undefined
  const binding=hash(`${snapshot.hostId}:${snapshot.datasetId}:${device.installation_id??''}:${credential?.hash??''}`)
  db.prepare('INSERT OR IGNORE INTO sharing_change_streams(device_id) VALUES(?)').run(deviceId)
  pruneEvents(db)
  const stream=db.prepare('SELECT last_seq,floor_seq FROM sharing_change_streams WHERE device_id=?').get(deviceId) as Row
  let from=0n
  if(cursor!==null){const row=db.prepare('SELECT seq FROM sharing_change_cursors WHERE token=? AND device_id=? AND binding=?').get(cursor,deviceId,binding) as Row|undefined;if(!row)throw new Error('CHANGE_CURSOR_INVALID');from=BigInt(row.seq!)}
  let next=db.prepare('SELECT token FROM sharing_change_cursors WHERE device_id=? AND binding=? AND seq=?').get(deviceId,binding,stream.last_seq) as Row|undefined
  if(!next){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sharing_change_cursors(token,device_id,binding,seq) VALUES(?,?,?,?)').run(token,deviceId,binding,stream.last_seq);next={token}}
  const token=String(next.token),noticeId=(key:string)=>hash(`${binding}:${cursor??'initial'}:${token}:${key}`)
  if(cursor===null)return validateChangeEnvelope({version:1,snapshot,cursor:token,mode:'initial',notices:snapshot.projects.length?[genericNotice(noticeId('initial'),'initial',snapshot.projects.length)]:[]})
  const events=db.prepare('SELECT * FROM sharing_change_events WHERE device_id=? AND seq>? AND seq<=? ORDER BY seq').all(deviceId,from,stream.last_seq) as Row[]
  const grants=new Map((db.prepare('SELECT project_id,generation FROM sharing_change_grants WHERE device_id=?').all(deviceId) as Row[]).map(r=>[String(r.project_id),String(r.generation)]))
  const revoked=events.some(e=>e.kind==='revoke'&&!grants.has(String(e.project_id)))
  const notices:ChangeNotice[]=revoked?[genericNotice(noticeId('ended'),'ended')]:[]
  const reset=from<BigInt(stream.floor_seq!)
  if(reset)notices.unshift(genericNotice(noticeId('reset'),'reset'))
  else for(const p of snapshot.projects){
   const relevant=events.filter(e=>String(e.project_id)===p.id&&e.generation===grants.get(p.id))
   if(!relevant.length)continue
   const after=businessProject(snapshot,p.id)!,before:BusinessProject={...after,schedules:[...after.schedules]}
   let initial=false
   for(const e of [...relevant].reverse()){
    if(e.kind==='grant'){initial=true;break}
    if(e.kind==='project')before.name=(JSON.parse(String(e.before_value)) as {name:string}).name
    if(e.kind==='schedule'){
     before.schedules=before.schedules.filter(s=>s.id!==String(e.entity_id))
     if(e.before_value!==null)before.schedules.push(JSON.parse(String(e.before_value)) as BusinessSchedule)
    }
   }
   const notice=summarizeProject(noticeId(`${p.id}:${grants.get(p.id)}`),initial?null:before,after,reconnecting)
   if(notice)notices.push(notice)
  }
  return validateChangeEnvelope({version:1,snapshot,cursor:token,mode:reset?'reset':'delta',notices})
 })()
}
