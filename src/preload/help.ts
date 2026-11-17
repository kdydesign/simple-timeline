import {contextBridge,ipcRenderer} from 'electron'
import {helpChannel,helpOpened,type HelpApi} from '../shared/help'
const started=performance.now()
contextBridge.exposeInMainWorld('planrailHelp',{
 command:async(command,reading)=>{
  try{return await ipcRenderer.invoke(helpChannel,command,...(reading===undefined?[]:[reading]))}
  catch{return {ok:false}}
 },
 onOpen(listener){const handler=()=>listener();ipcRenderer.on(helpOpened,handler);return()=>ipcRenderer.removeListener(helpOpened,handler)},
} satisfies HelpApi)

void ipcRenderer.invoke(helpChannel,'preload-timing',{timeOrigin:performance.timeOrigin,started,completed:performance.now()}).catch(()=>{})
