import {contextBridge,ipcRenderer} from 'electron'
import {releaseChannel,releaseOpened,type ReleaseApi} from '../shared/release-notes'
contextBridge.exposeInMainWorld('planrailReleaseNotes',{
 command:async(command,reading)=>{try{return await ipcRenderer.invoke(releaseChannel,command,...(reading===undefined?[]:[reading]))}catch{return {ok:false}}},
 onOpen(listener){const handler=()=>listener();ipcRenderer.on(releaseOpened,handler);return()=>ipcRenderer.removeListener(releaseOpened,handler)},
} satisfies ReleaseApi)
