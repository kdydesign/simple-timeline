import {Notification} from 'electron'
import type {ReminderSender} from './engine'
export function createNativeReminderSender(icon:string){
 const active=new Map<Notification,()=>void>()
 const send:ReminderSender=(message,onClick)=>new Promise(resolve=>{
  if(!Notification.isSupported()){resolve('failed');return}
  let notification:Notification
  try{notification=new Notification({...message,icon})}catch{resolve('failed');return}
  let settled=false
  const settle=(state:'submitted'|'failed'|'unknown')=>{if(!settled){settled=true;clearTimeout(timeout);resolve(state)}}
  const cleanup=()=>{settle('unknown');notification.removeAllListeners();active.delete(notification)}
  const timeout=setTimeout(()=>{settle('unknown');cleanup()},5000)
  active.set(notification,cleanup)
  notification.once('show',()=>settle('submitted'))
  notification.once('failed',()=>{settle('failed');cleanup()})
  notification.once('click',()=>{onClick();cleanup()})
  notification.once('close',cleanup)
  try{notification.show()}catch{settle('failed');cleanup()}
 })
 return {send,dispose(){for(const cleanup of active.values())cleanup();active.clear()}}
}
