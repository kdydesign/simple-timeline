import {sharingDescription} from '../shared/sharing-status'
import {Menu,Tray,nativeImage} from 'electron'
import type {SharingState} from '../shared/sharing'
interface Actions {show:()=>void;quit:()=>void;about?:()=>void;settings?:()=>void}
const actions=new WeakMap<Tray,Actions>()
const rendered=new WeakMap<Tray,string>()
function statusIcon(color:'green'|'red'|'gray') {
 const bitmap=Buffer.alloc(16*16*4),rgb=color==='green'?[74,163,22]:color==='red'?[38,38,220]:[113,113,122]
 for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x-7.5)**2+(y-7.5)**2<=36){const i=(y*16+x)*4;bitmap[i]=rgb[0];bitmap[i+1]=rgb[1];bitmap[i+2]=rgb[2];bitmap[i+3]=255}
 return nativeImage.createFromBitmap(bitmap,{width:16,height:16,scaleFactor:1})
}
export function updateSharingTray(tray:Tray,state?:SharingState) {
 const callback=actions.get(tray);if(!callback)return;
 const key=JSON.stringify([state?.role,state?.status,state?.message,state?.hostingEnabled]);if(rendered.get(tray)===key)return
 const normal=state?.role==='member'?state.status==='connected':state?.role==='host'&&state.hostingEnabled&&state.status==='connected';
 const label=state?.role==='host'?`호스트 · ${sharingDescription(state)}`:state?.role==='member'?sharingDescription(state):'공유 미설정';
 rendered.set(tray,key)
 tray.setToolTip(`Planrail · ${label}`)
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'연결 상태',icon:statusIcon(state?.role==='personal'||!state?'gray':normal?'green':'red'),click:callback.settings},
  {type:'separator'}, {label:'About',click:callback.about}, {type:'separator'},
  {label:'Open',click:callback.show}, {label:'Exit',click:callback.quit},
 ]))
}
export function createTray(icon:string,show:()=>void,requestQuit:()=>void,showAbout?:()=>void,openSharingSettings?:()=>void,state?:SharingState):Tray {
 const tray=new Tray(icon)
 try{actions.set(tray,{show,quit:requestQuit,about:showAbout,settings:openSharingSettings});updateSharingTray(tray,state);tray.on('click',show);return tray}
 catch(error){actions.delete(tray);tray.destroy();throw error}
}
