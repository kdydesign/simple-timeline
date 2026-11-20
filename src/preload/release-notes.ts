import {contextBridge,ipcRenderer} from 'electron'
import {releaseChannel,releaseOpened,releaseUnload,type ReleaseApi} from '../shared/release-notes'
contextBridge.exposeInMainWorld('planrailReleaseNotes',{
 command:async(command,reading)=>{try{return await ipcRenderer.invoke(releaseChannel,command,...(reading===undefined?[]:[reading]))}catch{return {ok:false}}},
 onOpen(listener){const handler=()=>listener();ipcRenderer.on(releaseOpened,handler);return()=>ipcRenderer.removeListener(releaseOpened,handler)},
} satisfies ReleaseApi)

window.addEventListener('beforeunload',()=>{
 const main=document.querySelector('main[data-release-version]')
 if(main instanceof HTMLElement){
  ipcRenderer.sendSync(releaseUnload,{version:main.dataset.releaseVersion,scrollTop:main.scrollTop})
 }
})
