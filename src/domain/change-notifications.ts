import type { ChangeEnvelope, ChangeNotice, ChangeTarget } from '../shared/change-notifications'
import type { WireSnapshot } from '../shared/sharing'
import { DomainValidationError } from './error'
import { validateWireSnapshot } from './sharing'
import { validateId } from './normalize'
function record(value:unknown,keys:string[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new DomainValidationError('changes')
 return value as Record<string,unknown>
}
function text(value:unknown,max:number):string {
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b-\u001f]/.test(value))throw new DomainValidationError('changes')
 return value
}
export function validateChangeEnvelope(value:unknown):ChangeEnvelope {
 const e=record(value,['version','snapshot','cursor','mode','notices'])
 if(e.version!==1||!['initial','delta','reset'].includes(String(e.mode))||!Array.isArray(e.notices)||e.notices.length>64)throw new DomainValidationError('changes')
 const snapshot=validateWireSnapshot(e.snapshot),cursor=text(e.cursor,128)
 if(!/^[a-f0-9]{64}$/.test(cursor))throw new DomainValidationError('cursor')
 const projects=new Set(snapshot.projects.map(p=>p.id)),ids=new Set<string>(),noticeProjects=new Set<string>()
 const notices=e.notices.map((raw):ChangeNotice=>{
  const n=record(raw,['id','projectId','title','body','target']),id=text(n.id,128)
  if(ids.has(id))throw new DomainValidationError('changes');ids.add(id)
  const projectId=n.projectId===null?null:validateId(n.projectId)
  if(projectId!==null){
   if(!projects.has(projectId)||noticeProjects.has(projectId)||e.mode!=='delta')throw new DomainValidationError('projectId')
   noticeProjects.add(projectId)
  }
  if(!n.target||typeof n.target!=='object')throw new DomainValidationError('target')
  const kind=Reflect.get(n.target,'kind');let target:ChangeTarget
  if(kind==='list'){record(n.target,['kind']);target={kind:'list'}}
  else if(kind==='project'){
   const t=record(n.target,['kind','id']),targetId=validateId(t.id)
   if(projectId!==targetId||!projects.has(targetId))throw new DomainValidationError('target')
   target={kind:'project',id:targetId}
  }else if(kind==='schedule'){
   const t=record(n.target,['kind','id','projectId']),targetId=validateId(t.id),parent=validateId(t.projectId)
   if(projectId!==parent||!snapshot.schedules.some(s=>s.id===targetId&&s.projectId===parent))throw new DomainValidationError('target')
   target={kind:'schedule',id:targetId,projectId:parent}
  }else throw new DomainValidationError('target')
  return {id,projectId,title:text(n.title,256),body:text(n.body,2048),target}
 })
 if((e.mode==='initial'&&(notices.length!==(snapshot.projects.length?1:0)))||(e.mode==='reset'&&(!notices.length||notices.length>2))||(e.mode==='delta'&&notices.filter(n=>n.projectId===null).length>1))throw new DomainValidationError('changes')
 return {version:1,snapshot,cursor,mode:e.mode as ChangeEnvelope['mode'],notices}
}
export type BusinessSchedule = Pick<WireSnapshot['schedules'][number],'id'|'projectId'|'name'|'startDate'|'endDate'>
export interface BusinessProject {id:string;name:string;schedules:BusinessSchedule[]}
export function businessProject(snapshot:WireSnapshot,id:string):BusinessProject|null {
 const p=snapshot.projects.find(p=>p.id===id)
 return p?{id:p.id,name:p.name,schedules:snapshot.schedules.filter(s=>s.projectId===id).map(s=>({id:s.id,projectId:s.projectId,name:s.name,startDate:s.startDate,endDate:s.endDate}))}:null
}
export function sameBusiness(a:unknown,b:unknown):boolean {return JSON.stringify(a)===JSON.stringify(b)}
export function genericNotice(id:string,kind:'ended'|'reset'|'initial',count=0):ChangeNotice {
 return {id,projectId:null,title:'공유 변경 알림',body:kind==='ended'?'공유가 종료되었습니다.':kind==='reset'?'공유 자료가 최신 상태로 갱신되었습니다.':`프로젝트 ${count}개가 공유되었습니다.`,target:{kind:'list'}}
}
/** Final business result of one authorized project window; timestamps, color and reminders are excluded. */
export function summarizeProject(id:string,before:BusinessProject|null,after:BusinessProject,reconnecting:boolean):ChangeNotice|null {
 if(!before)return {id,projectId:after.id,title:after.name,body:`${after.name} 프로젝트가 공유되었습니다.`,target:{kind:'project',id:after.id}}
 const previous=new Map(before.schedules.map(s=>[s.id,s])),current=new Map(after.schedules.map(s=>[s.id,s]))
 const added=after.schedules.filter(s=>!previous.has(s.id)),changed=after.schedules.filter(s=>previous.has(s.id)&&!sameBusiness(s,previous.get(s.id))),deleted=before.schedules.filter(s=>!current.has(s.id))
 const renamed=before.name!==after.name,total=added.length+changed.length+deleted.length
 if(!renamed&&!total)return null
 if(!reconnecting&&!renamed&&total===1){
  const s=added[0]??changed[0]??deleted[0],old=previous.get(s.id)
  const details=added.length?['일정 추가']:deleted.length?['일정 삭제']:[...(old?.name!==s.name?['이름 변경']:[]),...(old?.startDate!==s.startDate||old?.endDate!==s.endDate?[`기간 변경 · ${s.startDate} ~ ${s.endDate}`]:[])]
  return {id,projectId:after.id,title:after.name,body:`${s.name} · ${details.join(' · ')}`,target:deleted.length?{kind:'list'}:{kind:'schedule',id:s.id,projectId:after.id}}
 }
 const details=[...(renamed?['프로젝트 이름 변경']:[]),...(added.length?[`추가${added.length}건`]:[]),...(changed.length?[`변경${changed.length}건`]:[]),...(deleted.length?[`삭제${deleted.length}건`]:[])]
 return {id,projectId:after.id,title:after.name,body:details.join(' · '),target:{kind:'project',id:after.id}}
}
