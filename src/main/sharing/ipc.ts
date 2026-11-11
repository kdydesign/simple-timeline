import {ipcMain,type BrowserWindow} from 'electron'
import {isTrustedSender,appMutationBarrier} from '../ipc-core'
import {sharingChannel,sharingChanged,type SharingState} from '../../shared/sharing'
import {dispatchSharing} from './ipc-core'
import type {SharingService} from './service'
export function registerSharingIpc(window:BrowserWindow,url:string,service:SharingService|undefined,onReminderChange?:()=>void){
  ipcMain.handle(sharingChannel,(event,...args)=>appMutationBarrier.run(async()=>{const result=await dispatchSharing(service,args,isTrustedSender(event,window,url));if(result.ok&&args[0]==='saveReminder')onReminderChange?.();return result}))
  return {changed(state:SharingState){if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send(sharingChanged,state)},dispose(){ipcMain.removeHandler(sharingChannel)}}
}
