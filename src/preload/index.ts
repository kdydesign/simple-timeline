import {contextBridge,ipcRenderer} from 'electron'
import {channels,type TimelineApi} from '../shared/api'
const api=Object.fromEntries(Object.entries(channels).map(([method,channel])=>[method,async(...args:unknown[])=>{
 try{return await ipcRenderer.invoke(channel,...args)}catch{return {ok:false,error:{code:'IPC_UNAVAILABLE',message:'저장 결과를 확인할 수 없습니다. 먼저 다시 조회해 주세요.'}}}
}])) as unknown as TimelineApi
contextBridge.exposeInMainWorld('simpleTimeline',api)
