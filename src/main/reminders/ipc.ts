import {ipcMain,type BrowserWindow} from 'electron'
import {isTrustedSender,appMutationBarrier} from '../ipc-core'
import {reminderChannel,reminderChanged,type ReminderState} from '../../shared/reminder-api'
import {failure,toPublicError} from '../errors'
import {DomainValidationError} from '../../domain/error'
export function registerReminderIpc(window:BrowserWindow,url:string,read:()=>Omit<ReminderState,'openRequest'>,retry:()=>Promise<void>){
 let token=0,openRequest:ReminderState['openRequest']=null
 const getState=():ReminderState=>({...read(),openRequest})
 const changed=()=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send(reminderChanged)}
 ipcMain.handle(reminderChannel,(event,...args:unknown[])=>appMutationBarrier.run(async()=>{
  try{
   if(!isTrustedSender(event,window,url))throw failure('FORBIDDEN')
   const [command,value]=args
   if(command==='getState'&&args.length===1)return {ok:true,data:getState()}
   if(command==='retry'&&args.length===1){await retry();return {ok:true,data:getState()}}
   if(command==='acknowledge'&&args.length===2&&typeof value==='number'&&Number.isSafeInteger(value)&&value>0){if(openRequest?.token===value)openRequest=null;return {ok:true,data:getState()}}
   throw new DomainValidationError('input')
  }catch(error){return {ok:false,error:toPublicError(error)}}
 }))
 return {changed,open(scheduleId:string){openRequest={token:++token,scheduleId};changed()},dispose(){ipcMain.removeHandler(reminderChannel)}}
}
