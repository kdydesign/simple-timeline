import {contextBridge,ipcRenderer} from 'electron'
import {helpChannel,type HelpApi} from '../shared/help'
contextBridge.exposeInMainWorld('planrailHelp',{
 command:async(command,reading)=>{
  try{return await ipcRenderer.invoke(helpChannel,command,...(reading===undefined?[]:[reading]))}
  catch{return {ok:false}}
 },
} satisfies HelpApi)
