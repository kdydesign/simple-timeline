import type {ChangeInbox} from '../db/sharing/change-inbox'
import type {ChangeNotice} from '../../shared/change-notifications'
import type {ReminderSender} from '../reminders/engine'
interface Options {
 inbox:ChangeInbox;send:ReminderSender;generation:()=>number;authorized:(notice:ChangeNotice)=>boolean
 onClick:(notice:ChangeNotice)=>void;onChange:()=>void
}
/** Committed inbox only. Authorization and generation are checked at every async boundary. */
export function createChangeDelivery(o:Options){
 let running:Promise<void>|undefined,pending=false,stopped=false,revision=0,storageError=false
 const changed=()=>{try{o.onChange()}catch{/* Renderer availability cannot request a resend. */}}
 try{o.inbox.recover()}catch{storageError=true}
 const issues=()=>{try{return {...o.inbox.issues(),storageError}}catch{return {failed:0,unknown:0,storageError:true}}}
 async function drain(){
  while(pending&&!stopped){
   pending=false
   storageError=false
   try{
    const settings=o.inbox.settings()
    if(!settings.enabled||settings.baselining)continue
    for(const notice of o.inbox.pending()){
     const generation=o.generation(),version=revision
     const active=()=>{
      try{return !stopped&&version===revision&&generation===o.generation()&&o.inbox.settings().enabled}
      catch{storageError=true;return false}
     }
     const live=()=>{
      try{return active()&&!o.inbox.settings().baselining&&o.authorized(notice)}
      catch{storageError=true;return false}
     }
     if(!live())break
     if(!o.inbox.claim(notice.id))continue
     let failed=false,state:'submitted'|'failed'|'unknown'='unknown'
     const failure=()=>{
      if(!live())return
      failed=true
      try{o.inbox.finish(notice.id,'failed',notice)}catch{storageError=true}
      changed()
     }
     try{state=await o.send({title:notice.title,body:notice.body},()=>{
      if(active())o.onClick(notice)
     },failure)}catch{/* A thrown sender cannot prove that the OS did not receive it. */}
     if(stopped)return // The DB may be closed after dispose.
     if(live())o.inbox.finish(notice.id,failed?'failed':state,notice)
     if(version!==revision||generation!==o.generation())break
     // A sync while sending can replace remaining pending payloads. Read those again.
     if(pending)break
    }
   }catch{storageError=true;pending=false}
   changed()
  }
 }
 return {
  issues,
  evaluate(retry=false):Promise<void>{
   if(stopped)return Promise.resolve()
   if(retry){try{o.inbox.retry()}catch{storageError=true;changed();return Promise.resolve()}}
   pending=true
   if(!running)running=drain().finally(()=>{running=undefined})
   return running
  },
  invalidate(){revision++;pending=false},
  dispose(){stopped=true;revision++;pending=false},
 }
}
