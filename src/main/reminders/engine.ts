import type {TimelineSnapshot} from '../../shared/types'
import {dueReminders,localClock} from '../../domain/reminder'
import {toOrdinal} from '../../domain/date'
import type {ReminderStore} from '../db/reminders'
export interface ReminderMessage {title:string;body:string}
export type ReminderSender=(message:ReminderMessage,onClick:()=>void)=>Promise<'submitted'|'failed'|'unknown'>
interface Options {store:ReminderStore;snapshot:()=>TimelineSnapshot;clock?:()=>Date;send:ReminderSender;onClick:(id:string)=>void;onChange:()=>void}
export function createReminderEngine(o:Options) {
 const clock=o.clock??(()=>new Date())
 let running:Promise<void>|undefined,pending=false,retryRequested=false,stopped=false,storageError=false
 const changed=()=>{try{o.onChange()}catch{/* UI unavailability cannot cause an OS resend. */}}
 try{o.store.recover()}catch{storageError=true}
 const issues=()=>{
  try{return {...o.store.issues(),storageError}}
  catch{return {failed:0,unknown:0,storageError:true}}
 }
 async function drain(){
  while(pending&&!stopped){
   pending=false
   const retry=retryRequested;retryRequested=false
   try{
    o.store.recover()
    const snapshot=o.snapshot(),projects=new Map(snapshot.projects.map(p=>[p.id,p]))
    for(const schedule of snapshot.schedules){
     if(stopped)break
     // A commit/resume during OS delivery invalidates the remaining snapshot.
     if(pending){retryRequested ||= retry;break}
     const now=clock(),due=dueReminders(schedule,now),project=projects.get(schedule.projectId)
     if(!due.length||!project)continue
     const claimed=o.store.claim(due,retry)
     if(!claimed.length)continue
     const days=toOrdinal(claimed[0].targetDate)-toOrdinal(localClock(now).date)
     const kinds=claimed.map(c=>c.kind==='start'?'시작':'종료').join('·')
     const message={title:`${project.name} / ${schedule.name}`,body:`${days===0?'오늘':`${days}일 후`} ${kinds} · ${claimed[0].targetDate}`}
     let state:'submitted'|'failed'|'unknown'='unknown'
     try{state=await o.send(message,()=>{if(!stopped)o.onClick(schedule.id)})}catch{/* An unexpected transport throw cannot prove non-delivery. */}
     if(stopped)break // Preserve the claim for recovery; never touch a closed DB.
     o.store.finish(claimed.map(c=>c.key),state)
    }
    storageError=false
   }catch{storageError=true;pending=false;retryRequested=false}
   changed()
  }
 }
 return {
  issues,
  evaluate(retry=false):Promise<void>{
   if(stopped)return Promise.resolve()
   pending=true;retryRequested ||= retry
   if(!running){running=drain().finally(()=>{running=undefined})}
   return running
  },
  dispose(){stopped=true;pending=false},
 }
}
