import { ipcMain, type BrowserWindow } from 'electron'
import { updatesChannel, updatesChanged, updatesGuard, updatesGuardReply, type UpdateState } from '../../shared/updates'
import { isTrustedSender } from '../ipc-core'
import { createRendererInstallGuard } from './installer'
import { dispatchUpdateCommand } from './ipc-core'
import type { UpdateService } from './service'
export function registerUpdateIpc(window:BrowserWindow,url:string,service:()=>UpdateService|undefined){
 const send=(channel:string,value:unknown)=>{if(window.isDestroyed()||window.webContents.isDestroyed())throw Error('Renderer unavailable');window.webContents.send(channel,value)}
 const guard=createRendererInstallGuard(request=>send(updatesGuard,request))
 ipcMain.handle(updatesChannel,(event,...args)=>dispatchUpdateCommand(service(),args,isTrustedSender(event,window,url)))
 ipcMain.handle(updatesGuardReply,(event,...args)=>{
  if(!isTrustedSender(event,window,url)||args.length!==2||typeof args[0]!=='string'||typeof args[1]!=='boolean')return false
  return guard.acknowledge(args[0],args[1])
 })
 window.webContents.once('destroyed',()=>guard.dispose())
 return {guard,changed(state:UpdateState){try{send(updatesChanged,state)}catch{/* Detached renderer. */}},dispose(){guard.dispose();ipcMain.removeHandler(updatesChannel);ipcMain.removeHandler(updatesGuardReply)}}
}
