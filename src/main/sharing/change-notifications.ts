import {randomUUID} from 'node:crypto'
import {createChangeInbox} from '../db/sharing/change-inbox'
import type {DatabaseHandle} from '../db/repository'
import type {ChangeEnvelope,ChangeNotice,ChangeTarget} from '../../shared/change-notifications'
import type {ChangeNotificationState,SharingRole} from '../../shared/sharing'
import type {TimelineSnapshot} from '../../shared/types'
import type {ReminderSender} from '../reminders/engine'
import {createChangeDelivery} from './change-delivery'
import {failure} from '../errors'
interface Options {
 db:DatabaseHandle;role:()=>SharingRole;generation:()=>number;connected:()=>boolean;revoked:()=>boolean
 snapshot:()=>TimelineSnapshot;authorize:()=>Promise<boolean>;changed:()=>void;send?:ReminderSender;onClick?:()=>void
}
/** Main-only inbox, preferences, delivery and typed navigation capability. */
export function createChangeNotifications(o:Options){
 const inbox=createChangeInbox(o.db)
 let supported:boolean|null=null,storageError=false,disposed=false,revision=0,openRequest:ChangeNotificationState['openRequest']=null
 const member=()=>!disposed&&o.role()==='member'
 const delivery=createChangeDelivery({inbox,send:o.send??(async()=> 'failed'),generation:o.generation,
  authorized:notice=>member()&&((supported===true&&o.connected())||(o.revoked()&&notice.projectId===null)),onChange:o.changed,
  onClick:notice=>{void open(notice).catch(()=>{storageError=true;o.changed()})},
 })
 function state():ChangeNotificationState{
  try{return {...inbox.settings(),supported,...delivery.issues(),storageError:storageError||delivery.issues().storageError,openRequest}}
  catch{return {enabled:true,baselining:false,supported,failed:0,unknown:0,storageError:true,openRequest}}
 }
 function guard(){if(!member())throw failure('FORBIDDEN')}
 async function open(notice:ChangeNotice){
  const generation=o.generation(),version=revision
  if(!member())return
  let allowed=false
  try{allowed=await o.authorize()}catch{/* An unreachable host cannot authorize historical detail. */}
  if(!member()||generation!==o.generation()||version!==revision||!inbox.settings().enabled)return
  let target:ChangeTarget={kind:'list'}
  if(allowed){
   const snapshot=o.snapshot(),requested=notice.target
   if(requested.kind==='project'&&snapshot.projects.some(p=>p.id===requested.id))target=requested
   if(requested.kind==='schedule'&&snapshot.projects.some(p=>p.id===requested.projectId)&&snapshot.schedules.some(s=>s.id===requested.id&&s.projectId===requested.projectId))target=requested
  }
  openRequest={token:randomUUID(),target};o.changed();o.onClick?.()
 }
 return {
  state,cursor:inbox.cursor,
  apply(envelope:ChangeEnvelope,reconnecting:boolean){try{inbox.apply(envelope,reconnecting);supported=true;storageError=false}catch(error){storageError=true;throw error}},
  revoke(){try{inbox.revoke();storageError=false}catch(error){storageError=true;throw error}},
  unsupported(){supported=false},
  setEnabled(input:{enabled:boolean}){guard();try{inbox.setEnabled(input.enabled);revision++;delivery.invalidate();openRequest=null;storageError=false;o.changed()}catch(error){storageError=true;o.changed();throw error}},
  async retry(){guard();const generation=o.generation();if(!await o.authorize()||!member()||generation!==o.generation())return;await delivery.evaluate(true)},
  acknowledge({token}:{token:string}){if(disposed)throw failure('FORBIDDEN');if(openRequest?.token===token){openRequest=null;o.changed()}},
  evaluate(){return delivery.evaluate()},
  invalidate(){revision++;supported=null;openRequest=null;delivery.invalidate()},
  dispose(){disposed=true;revision++;openRequest=null;return delivery.dispose()},
 }
}
