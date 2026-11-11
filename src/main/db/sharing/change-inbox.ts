import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '../repository'
import type { ChangeEnvelope, ChangeNotice } from '../../../shared/change-notifications'
import type { WireSnapshot } from '../../../shared/sharing'
import { sharedId, parseSharedId } from '../../../domain/sharing'
import { businessProject, genericNotice, summarizeProject, validateChangeEnvelope, type BusinessProject } from '../../../domain/change-notifications'
import { createMemberCache } from './cache'
import { checkChangeSchema } from './change-schema'
type State='pending'|'claimed'|'submitted'|'failed'|'unknown'|'cancelled'
interface Row {id:string;project_id:string|null;payload:string;state:State;baseline:string|null;window_cursor:string}
interface Settings {enabled:bigint;baselining:bigint;cursor:string|null;revoked:bigint}
export function createChangeInbox(db:DatabaseHandle) {
 checkChangeSchema(db)
 const cache=createMemberCache(db)
 const config=()=>db.prepare('SELECT remote_host_id,remote_dataset_id,role FROM sharing_config WHERE singleton=1').get() as {remote_host_id:string;remote_dataset_id:string;role:string}
 const settingsRow=():Settings=>{
  const row=db.prepare('SELECT * FROM sharing_change_settings WHERE singleton=1').get() as Settings|undefined
  if(!row)throw new Error('CHANGE_METADATA_MISSING')
  return row
 }
 const settings=()=>{const r=settingsRow();return {enabled:!!r.enabled,baselining:!!r.baselining}}
 const cursor=()=>settingsRow().cursor
 const pendingRows=()=>db.prepare("SELECT * FROM sharing_change_inbox WHERE state='pending' ORDER BY rowid").all() as Row[]
 const wireCache=():WireSnapshot=>{
  const c=config(),s=cache.read()
  return {protocolVersion:1,hostId:c.remote_host_id,datasetId:c.remote_dataset_id,projects:s.projects.map(p=>({id:parseSharedId(p.id).remoteId,name:p.name,color:p.color,participants:p.participants,createdAt:p.createdAt,updatedAt:p.updatedAt})),schedules:s.schedules.map(s=>({id:parseSharedId(s.id).remoteId,projectId:parseSharedId(s.projectId).remoteId,name:s.name,startDate:s.startDate,endDate:s.endDate,createdAt:s.createdAt,updatedAt:s.updatedAt}))}
 }
 const localNotice=(n:ChangeNotice,snapshot:WireSnapshot):ChangeNotice=>{
  const id=(v:string)=>sharedId(snapshot.hostId,snapshot.datasetId,v)
  return {...n,projectId:n.projectId===null?null:id(n.projectId),target:n.target.kind==='list'?{kind:'list'}:n.target.kind==='project'?{kind:'project',id:id(n.target.id)}:{kind:'schedule',id:id(n.target.id),projectId:id(n.target.projectId)}}
 }
 const put=(notice:ChangeNotice,projectId:string|null,baseline:string|null,window:string)=>{
  // A cancelled pending window may be recomputed; terminal deliveries never become pending.
  db.prepare("INSERT INTO sharing_change_inbox(id,project_id,payload,state,baseline,window_cursor,updated_at) VALUES(?,?,?,'pending',?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,payload=excluded.payload,baseline=excluded.baseline,window_cursor=excluded.window_cursor,state=CASE WHEN sharing_change_inbox.state='cancelled' THEN 'pending' ELSE sharing_change_inbox.state END,updated_at=excluded.updated_at").run(notice.id,projectId,JSON.stringify(notice),baseline,window,new Date().toISOString())
 }
 // Once authorization ends, retain only delivery identity/state, never historical names or dates.
 const scrubUnauthorized=(allowed:Set<string>)=>{
  for(const row of db.prepare('SELECT * FROM sharing_change_inbox WHERE project_id IS NOT NULL').all() as Row[]){
   if(allowed.has(row.project_id!))continue
   db.prepare("UPDATE sharing_change_inbox SET project_id=NULL,payload=?,baseline=NULL,state=CASE WHEN state IN ('pending','failed') THEN 'cancelled' ELSE state END WHERE id=?").run(JSON.stringify(genericNotice(row.id,'ended')),row.id)
  }
 }
 const apply=db.transaction((input:ChangeEnvelope,reconnecting=false)=>{
  if(typeof reconnecting!=='boolean')throw new Error('CHANGE_RECONNECT_INVALID')
  const e=validateChangeEnvelope(input),previous=wireCache(),old=settingsRow(),pending=pendingRows()
  cache.apply(e.snapshot)
  const allowed=new Set(e.snapshot.projects.map(p=>p.id)),confirmedEnded=previous.projects.some(p=>!allowed.has(p.id))
  const continuing=new Set(allowed)
  for(const n of e.notices)if(old.cursor!==e.cursor&&n.projectId!==null&&n.body===`${e.snapshot.projects.find(p=>p.id===n.projectId)!.name} 프로젝트가 공유되었습니다.`)continuing.delete(n.projectId)
  scrubUnauthorized(e.mode==='reset'?new Set():continuing)
  db.prepare('UPDATE sharing_change_settings SET cursor=?,baselining=0,revoked=0 WHERE singleton=1').run(e.cursor)
  if(!old.enabled||old.baselining){db.prepare("UPDATE sharing_change_inbox SET state='cancelled' WHERE state IN ('pending','failed')").run();return}
  if(old.cursor===e.cursor&&!reconnecting)return
  db.prepare("UPDATE sharing_change_inbox SET state='cancelled' WHERE state='pending'").run()
  const oldGeneric=pending.find(r=>r.project_id===null&&(r.baseline==='initial'||r.baseline==='reset'))
  if(oldGeneric&&e.mode==='delta'){
   if(oldGeneric.baseline==='reset'||e.snapshot.projects.length)put(genericNotice(oldGeneric.id,oldGeneric.baseline as 'initial'|'reset',e.snapshot.projects.length),null,oldGeneric.baseline,e.cursor)
  }
  const incomingNotices=[...e.notices]
  if(confirmedEnded&&!incomingNotices.some(n=>n.projectId===null&&n.body==='공유가 종료되었습니다.'))incomingNotices.push(genericNotice(randomUUID(),'ended'))
  const incoming=new Map(incomingNotices.filter(n=>n.projectId!==null).map(n=>[n.projectId!,n]))
  // Keep the first unclaimed business baseline for each project, independent of other claims.
  if(!oldGeneric&&e.mode==='delta')for(const row of pending){
   if(row.project_id===null)continue
   const after=businessProject(e.snapshot,row.project_id)
   if(!after)continue
   const fresh=incoming.get(row.project_id)
   if(fresh?.body===`${after.name} 프로젝트가 공유되었습니다.`)continue
   const before=row.baseline===null?null:JSON.parse(row.baseline) as BusinessProject|null
   const result=summarizeProject(row.id,before,after,reconnecting||(fresh??JSON.parse(row.payload) as ChangeNotice).target.kind==='project')
   incoming.delete(row.project_id)
   if(result)put(localNotice(result,e.snapshot),row.project_id,row.baseline,e.cursor)
  }
  const endedPending=pending.find(r=>r.project_id===null&&r.baseline==='ended')
  if(endedPending&&!incomingNotices.some(n=>n.projectId===null&&n.body==='공유가 종료되었습니다.'))put(JSON.parse(endedPending.payload) as ChangeNotice,null,'ended',e.cursor)
  for(const n of incomingNotices){
   if(n.projectId===null){put(n.body==='공유가 종료되었습니다.'&&endedPending?{...n,id:endedPending.id}:n,null,n.body==='공유가 종료되었습니다.'?'ended':e.mode==='initial'?'initial':e.mode==='reset'?'reset':'ended',e.cursor);continue}
   if(oldGeneric||!incoming.has(n.projectId))continue
   const after=businessProject(e.snapshot,n.projectId)!,before=n.body===`${after.name} 프로젝트가 공유되었습니다.`?null:businessProject(previous,n.projectId)
   put(localNotice(n,e.snapshot),n.projectId,JSON.stringify(before),e.cursor)
  }
 })
 const valid=(row:Row,retry=false):boolean=>{
  const n=JSON.parse(row.payload) as ChangeNotice,c=config()
  if(c.role!=='member')return false
  if(n.projectId===null)return true
  if(!db.prepare('SELECT 1 FROM sharing_cache_projects WHERE id=?').get(n.projectId))return false
  if(n.target.kind==='schedule')return !!db.prepare('SELECT 1 FROM sharing_cache_schedules WHERE id=? AND project_id=?').get(n.target.id,n.projectId)
  return !retry||n.target.kind!=='list'
 }
 const pending=():ChangeNotice[]=>pendingRows().filter(r=>valid(r)).map(r=>JSON.parse(r.payload) as ChangeNotice)
 const claim=db.transaction((id:string,retry=false):boolean=>{
  const s=settingsRow()
  if(!s.enabled||s.baselining)return false
  const row=db.prepare('SELECT * FROM sharing_change_inbox WHERE id=?').get(id) as Row|undefined
  if(!row||(row.state!=='pending'&&!(retry&&row.state==='failed'))||!valid(row,retry))return false
  return !!db.prepare("UPDATE sharing_change_inbox SET state='claimed',updated_at=? WHERE id=? AND state=?").run(new Date().toISOString(),id,row.state).changes
 })
 const finish=(id:string,state:'submitted'|'failed'|'unknown'):void=>{
  if(!['submitted','failed','unknown'].includes(state))throw new Error('CHANGE_DELIVERY_STATE')
  db.prepare("UPDATE sharing_change_inbox SET state=?,updated_at=? WHERE id=? AND state='claimed'").run(state,new Date().toISOString(),id)
 }
 const recover=()=>{db.prepare("UPDATE sharing_change_inbox SET state='unknown' WHERE state='claimed'").run()}
 const retry=db.transaction(()=>{
  const s=settingsRow();if(!s.enabled||s.baselining)return
  for(const r of db.prepare("SELECT * FROM sharing_change_inbox WHERE state='failed'").all() as Row[]){
   if(!valid(r,true))continue
   const n=JSON.parse(r.payload) as ChangeNotice
   if(n.projectId!==null){
    const p=db.prepare('SELECT name FROM sharing_cache_projects WHERE id=?').get(n.projectId) as {name:string}
    n.title=p.name
    if(n.target.kind==='schedule'){
     const schedule=db.prepare('SELECT name,start_date,end_date FROM sharing_cache_schedules WHERE id=?').get(n.target.id) as {name:string;start_date:string;end_date:string}
     n.body=`${schedule.name} · 일정 변경 · ${schedule.start_date} ~ ${schedule.end_date}`
    }else n.body='공유 자료가 최신 상태로 갱신되었습니다.'
   }
   db.prepare("UPDATE sharing_change_inbox SET payload=?,state='pending' WHERE id=? AND state='failed'").run(JSON.stringify(n),r.id)
  }
 })
 const revoke=db.transaction(()=>{
  const s=settingsRow();cache.clear();scrubUnauthorized(new Set())
  if(s.revoked)return
  db.prepare("UPDATE sharing_change_inbox SET state='cancelled' WHERE state IN ('pending','failed')").run()
  db.prepare('UPDATE sharing_change_settings SET revoked=1 WHERE singleton=1').run()
  if(s.enabled&&!s.baselining)put(genericNotice(randomUUID(),'ended'),null,'ended',s.cursor??'')
 })
 const reset=db.transaction(()=>{
  cache.clear();db.prepare('DELETE FROM sharing_change_inbox').run()
  db.prepare('UPDATE sharing_change_settings SET cursor=NULL,baselining=0,revoked=0 WHERE singleton=1').run()
 })
 const setEnabled=db.transaction((enabled:boolean)=>{
  if(typeof enabled!=='boolean')throw new Error('CHANGE_SETTING_INVALID')
  const s=settingsRow()
  db.prepare('UPDATE sharing_change_settings SET enabled=?,baselining=? WHERE singleton=1').run(Number(enabled),Number(enabled&&(!s.enabled||!!s.baselining)))
  if(!enabled)db.prepare("UPDATE sharing_change_inbox SET state='cancelled' WHERE state IN ('pending','failed')").run()
 })
 const issues=()=>{
  const result={failed:0,unknown:0}
  for(const r of db.prepare("SELECT state,count(*) AS n FROM sharing_change_inbox WHERE state IN ('failed','unknown') GROUP BY state").all() as {state:'failed'|'unknown';n:bigint}[])result[r.state]=Number(r.n)
  return result
 }
 return {settings,setEnabled,cursor,apply,revoke,reset,recover,pending,claim,finish,issues,retry}
}
export type ChangeInbox=ReturnType<typeof createChangeInbox>
