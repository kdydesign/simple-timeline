import {updatesChannel,updatesChanged,updatesGuard,updatesGuardReply,type UpdateApi,type UpdateState,type UpdateGuardRequest} from '../shared/updates'
import {sharingChannel,sharingChanged,type SharingApi,type SharingState} from '../shared/sharing'
import {reminderChannel,reminderChanged,type ReminderApi} from '../shared/reminder-api'
import {nodeManagementChannel,nodeManagementChanged,type NodeManagementApi,type NodeManagementResult,type NodeManagementState,type StandaloneRemovalConfirmation} from '../shared/node-management'
import { contextBridge, ipcRenderer } from 'electron'
import { channels, type TimelineApi } from '../shared/api'
import { windowChannel, type WindowApi } from '../shared/window-api'
const api = Object.fromEntries(
  Object.entries(channels).map(([method, channel]) => [
    method,
    async (...args: unknown[]) => {
      try {
        return await ipcRenderer.invoke(channel, ...args)
      } catch {
        return {
          ok: false,
          error: {
            code: 'IPC_UNAVAILABLE',
            message: '저장 결과를 확인할 수 없습니다. 먼저 다시 조회해 주세요.',
          },
        }
      }
    },
  ]),
) as unknown as TimelineApi
contextBridge.exposeInMainWorld('simpleTimeline', api)

contextBridge.exposeInMainWorld('timelineWindow', {
  command: async (...args: Parameters<WindowApi['command']>) => {
    try { return await ipcRenderer.invoke(windowChannel, ...args) }
    catch { return {ok:false} }
  },
} satisfies WindowApi)

// A separate, fixed capability surface: no arbitrary notification payload or channel.
const reminderInvoke = async (command:string, ...args:unknown[]) => {
  try { return await ipcRenderer.invoke(reminderChannel,command,...args) }
  catch { return {ok:false,error:{code:'IPC_UNAVAILABLE',message:'알림 상태를 확인하지 못했습니다.'}} }
}
contextBridge.exposeInMainWorld('timelineReminders', {
  getState:()=>reminderInvoke('getState'),
  retry:()=>reminderInvoke('retry'),
  acknowledge:(token:number)=>reminderInvoke('acknowledge',token),
  onChange:(callback:()=>void)=>{
    const listener=()=>callback()
    ipcRenderer.on(reminderChanged,listener)
    return ()=>ipcRenderer.removeListener(reminderChanged,listener)
  },
} satisfies ReminderApi)

// Fixed sharing capability: the renderer never supplies channels, URLs, pins or credentials.
const sharingInvoke=async(command:string,...args:unknown[])=>{
  try{return await ipcRenderer.invoke(sharingChannel,command,...args)}
  catch{return {ok:false,error:{code:'IPC_UNAVAILABLE',message:'공유 상태를 확인하지 못했습니다.'}}}
}
const sharingApi={
  switchRole:(v)=>sharingInvoke('switchRole',v),
  getDormantData:()=>sharingInvoke('getDormantData'),
  saveHolidays:(v)=>sharingInvoke('saveHolidays',v),
  savePersonalHolidays:(v)=>sharingInvoke('savePersonalHolidays',v),
  getState:()=>sharingInvoke('getState'),configureHost:(v)=>sharingInvoke('configureHost',v),setHosting:(v)=>sharingInvoke('setHosting',v),
  connect:(v)=>sharingInvoke('connect',v),confirmHost:(v)=>sharingInvoke('confirmHost',v),approve:(v)=>sharingInvoke('approve',v),
  saveDevice:(v)=>sharingInvoke('saveDevice',v),revokeDevice:(v)=>sharingInvoke('revokeDevice',v),deleteDevice:(v)=>sharingInvoke('deleteDevice',v),saveProject:(v)=>sharingInvoke('saveProject',v),
  saveReminder:(v)=>sharingInvoke('saveReminder',v),sync:()=>sharingInvoke('sync'),disconnect:(v)=>sharingInvoke('disconnect',v),acknowledgeSettings:(v)=>sharingInvoke('acknowledgeSettings',v),
  setChangeNotifications:(v)=>sharingInvoke('setChangeNotifications',v),retryChangeNotifications:()=>sharingInvoke('retryChangeNotifications'),acknowledgeChange:(v)=>sharingInvoke('acknowledgeChange',v),
  onChange:(callback)=>{const listener=(_event:unknown,state:SharingState)=>callback(state);ipcRenderer.on(sharingChanged,listener);return ()=>ipcRenderer.removeListener(sharingChanged,listener)},
} satisfies SharingApi
contextBridge.exposeInMainWorld('timelineSharing',sharingApi)

const updateInvoke=async(command:string,...args:unknown[])=>{
  try{return await ipcRenderer.invoke(updatesChannel,command,...args)}
  catch{return {ok:false,error:{code:'IPC_UNAVAILABLE',message:'업데이트 상태를 확인하지 못했습니다.'}}}
}
contextBridge.exposeInMainWorld('timelineUpdates',{
  acknowledgeOpen:token=>updateInvoke('acknowledgeOpen',token),getState:()=>updateInvoke('getState'),importBundle:()=>updateInvoke('importBundle'),publish:()=>updateInvoke('publish'),withdraw:()=>updateInvoke('withdraw'),
  download:()=>updateInvoke('download'),cancel:()=>updateInvoke('cancel'),retry:()=>updateInvoke('retry'),install:()=>updateInvoke('install'),
  onChange:callback=>{const listener=(_event:unknown,state:UpdateState)=>callback(state);ipcRenderer.on(updatesChanged,listener);return ()=>ipcRenderer.removeListener(updatesChanged,listener)},
  onInstallGuard:callback=>{
    const listener=(_event:unknown,request:UpdateGuardRequest)=>{void Promise.resolve().then(()=>callback(request)).catch(()=>false).then(clean=>ipcRenderer.invoke(updatesGuardReply,request.requestId,clean===true)).catch(()=>{})}
    ipcRenderer.on(updatesGuard,listener);return ()=>ipcRenderer.removeListener(updatesGuard,listener)
  },
} satisfies UpdateApi)

const nodeInvoke = async (
  command: 'selectEnvironment' | 'startEnvironment' | 'cancelOperation' | 'getState' | 'refreshCatalog' | 'installManager' | 'install' | 'use' | 'removeStandalone' | 'openMaintenance',
  ...args: [] | [version: string] | [confirmation:StandaloneRemovalConfirmation]
): Promise<NodeManagementResult> => {
  try {
    return await ipcRenderer.invoke(nodeManagementChannel, command, ...args)
  } catch {
    return { ok: false, error: { code: 'ipc-unavailable', message: 'Node 관리 응답을 확인하지 못했습니다. 다시 조회해 주세요.' } }
  }
}
contextBridge.exposeInMainWorld('workrailNodeManagement', {
  selectEnvironment: id => nodeInvoke('selectEnvironment', id),
  startEnvironment: () => nodeInvoke('startEnvironment'),
  cancelOperation: () => nodeInvoke('cancelOperation'),
  getState: () => nodeInvoke('getState'),
  refreshCatalog: () => nodeInvoke('refreshCatalog'),
  install: version => nodeInvoke('install', version),
  use: version => nodeInvoke('use', version),
  installManager: () => nodeInvoke('installManager'),
  removeStandalone: input => nodeInvoke('removeStandalone',input),
  openMaintenance: () => nodeInvoke('openMaintenance'),
  onChange: callback => {
    const listener = (_event: unknown, state: NodeManagementState) => callback(state)
    ipcRenderer.on(nodeManagementChanged, listener)
    return () => ipcRenderer.removeListener(nodeManagementChanged, listener)
  },
} satisfies NodeManagementApi)
