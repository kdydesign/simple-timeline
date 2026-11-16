import type {NotificationStore} from '../db/notifications'
import type {ReminderSender} from '../reminders/engine'
import type {UpdateStatus} from '../../shared/updates'
/** Commit the durable attempt before calling Windows. Ambiguous results are terminal. */
export function createUpdateNotifications(o:{store:NotificationStore;send:ReminderSender;open:()=>void;changed:()=>void}){
 let stopped=false,error=false
 try{o.store.recoverUpdates()}catch{error=true}
 return {
  generation:()=>{try{return o.store.state().generation}catch{error=true;return -1}},
  error:()=>error,
  async observe(status:UpdateStatus,generation:number){
   if(stopped)return
   try{
    const key=o.store.observeUpdate(status,generation);error=false
    if(!key)return
    const live=()=>!stopped&&!o.store.state().muted&&generation===o.store.state().generation
    if(!live()){o.store.finishUpdate(key.hostId,key.version,'suppressed');return}
    let result:'submitted'|'failed'|'unknown'='unknown',failed=false
    try{result=await o.send({title:'Planrail 업데이트',body:`새 버전 ${key.version}을 사용할 수 있습니다. 클릭하면 업데이트 안내를 엽니다.`},()=>{if(!stopped)o.open()},()=>{
     if(stopped)return
     try{if(!live())return;failed=true;o.store.finishUpdate(key.hostId,key.version,'failed')}catch{error=true}o.changed()
    })}catch{/* Delivery may already have reached Windows. */}
    if(stopped)return
    o.store.finishUpdate(key.hostId,key.version,failed?'failed':result)
   }catch{error=true}
   finally{if(!stopped)o.changed()}
  },
  dispose(){stopped=true},
 }
}
export type UpdateNotifications=ReturnType<typeof createUpdateNotifications>
