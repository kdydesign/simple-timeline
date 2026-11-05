import {reminderChannel,reminderChanged,type ReminderApi} from '../shared/reminder-api'
import { contextBridge, ipcRenderer } from 'electron'
import { channels, type TimelineApi } from '../shared/api'
import { windowChannel, type WindowCommand, type WindowApi } from '../shared/window-api'
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
  command: async (command: WindowCommand) => {
    try { return await ipcRenderer.invoke(windowChannel, command) }
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
