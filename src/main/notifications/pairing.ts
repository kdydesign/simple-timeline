import type {createSharingExtras} from '../db/sharing/extras'
import type {NotificationStore} from '../db/notifications'
import type {PendingPair} from '../sharing/host'
import type {ReminderSender} from '../reminders/engine'
export function createPairingNotifications(o:{store:ReturnType<typeof createSharingExtras>;policy:NotificationStore;valid:(pair:PendingPair)=>boolean;send:ReminderSender;open:()=>void;changed:()=>void}){
 let stopped=false,error=false
 try{o.store.recoverPairs()}catch{error=true}
 return {
  error:()=>error,
  async observe(pair:PendingPair){
   if(stopped)return
   try{
    if(!o.valid(pair))return
    const generation=o.policy.state().generation
    if(!o.store.claimPair(pair.deviceId,pair.pairId))return
    const live=()=>!stopped&&o.valid(pair)&&!o.policy.state().muted&&o.policy.state().generation===generation
    if(!live()){o.store.finishPair(pair.deviceId,pair.pairId,'suppressed');return}
    let result:'submitted'|'failed'|'unknown'='unknown',failed=false
    try{result=await o.send({title:'Planrail 연결 승인 요청',body:`${pair.name} · ${pair.ip} — 연결 승인을 기다립니다.`},()=>{if(!stopped)o.open()},()=>{
     if(stopped)return
     try{failed=true;o.store.finishPair(pair.deviceId,pair.pairId,'failed')}catch{error=true}o.changed()
    })}catch{/* Delivery may have reached the OS. Never retry an ambiguous attempt. */}
    if(stopped)return
    o.store.finishPair(pair.deviceId,pair.pairId,failed?'failed':result);error=false
   }catch{error=true}
   finally{if(!stopped)o.changed()}
  },
  dispose(){stopped=true},
 }
}
