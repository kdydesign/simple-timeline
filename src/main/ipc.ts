import {ipcMain,type BrowserWindow} from 'electron'
import type {StorageState} from './db/lifecycle'
import {channels} from '../shared/api'
import {dispatch,isTrustedSender} from './ipc-core'
export function registerTimelineIpc(window:BrowserWindow,storage:StorageState,allowedUrl:string):()=>void {
 for(const [method,channel] of Object.entries(channels))ipcMain.handle(channel,(event,...args)=>dispatch(storage,method,args,isTrustedSender(event,window,allowedUrl)))
 return ()=>{for(const channel of Object.values(channels))ipcMain.removeHandler(channel)}
}
