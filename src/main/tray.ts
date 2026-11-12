import {sharingDescription} from '../shared/sharing-status'
import {Menu,Tray,nativeImage} from 'electron'
import type {createLoginStartup,LoginStartupState} from './login-startup'
import type {SharingState} from '../shared/sharing'
interface Actions {show:()=>void;quit:()=>void;about?:()=>void;settings?:()=>void;startup?:ReturnType<typeof createLoginStartup>;startupState?:LoginStartupState;startupError?:(error:unknown)=>void;state?:SharingState}
const actions=new WeakMap<Tray,Actions>()
const rendered=new WeakMap<Tray,string>()
const menus=new WeakMap<Tray,ReturnType<typeof Menu.buildFromTemplate>>()
function statusIcon(color:'green'|'red'|'gray') {
 const bitmap=Buffer.alloc(16*16*4),rgb=color==='green'?[74,163,22]:color==='red'?[38,38,220]:[113,113,122]
 for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x-7.5)**2+(y-7.5)**2<=36){const i=(y*16+x)*4;bitmap[i]=rgb[0];bitmap[i+1]=rgb[1];bitmap[i+2]=rgb[2];bitmap[i+3]=255}
 return nativeImage.createFromBitmap(bitmap,{width:16,height:16,scaleFactor:1})
}
export function updateSharingTray(tray:Tray,state?:SharingState) {
 const callback=actions.get(tray);if(!callback)return;
 callback.state=state
 const key=JSON.stringify([state?.role,state?.status,state?.message,state?.hostingEnabled,callback.startupState]);if(rendered.get(tray)===key)return
 const normal=state?.role==='member'?state.status==='connected':state?.role==='host'&&state.hostingEnabled&&state.status==='connected';
 const label=state?.role==='host'?`호스트 · ${sharingDescription(state)}`:state?.role==='member'?sharingDescription(state):'공유 미설정';
 rendered.set(tray,key)
 tray.setToolTip(`Planrail · ${label}`)
 const menu=Menu.buildFromTemplate([
  {label:'연결 상태',icon:statusIcon(state?.role==='personal'||!state?'gray':normal?'green':'red'),click:callback.settings},
  {type:'separator'}, {label:'About',click:callback.about},
  ...(callback.startup?[{label:'Windows 시작 시 자동 실행',type:'checkbox' as const,checked:callback.startupState?.enabled??false,enabled:callback.startupState?.supported??false,click:async(item:{checked:boolean})=>{try{const result=await callback.startup!.set(item.checked);callback.startupState=result.state;if(result.error)callback.startupError?.(result.error)}catch(error){callback.startupState=undefined;callback.startupError?.(error)}rendered.delete(tray);updateSharingTray(tray,callback.state)}}]:[]), {type:'separator'},
  {label:'Open',click:callback.show}, {label:'Exit',click:callback.quit},
 ])
 if(callback.startup){menus.set(tray,menu)}else tray.setContextMenu(menu)
}
export function createTray(icon:string,show:()=>void,requestQuit:()=>void,showAbout?:()=>void,openSharingSettings?:()=>void,state?:SharingState,startup?:ReturnType<typeof createLoginStartup>,startupError?:(error:unknown)=>void):Tray {
 const tray=new Tray(icon)
 try {
  actions.set(tray,{show,quit:requestQuit,about:showAbout,settings:openSharingSettings,startup,startupError})
  updateSharingTray(tray,state)
  tray.on('click',show)
  if(startup)tray.on('right-click',async()=>{
   const callback=actions.get(tray)
   if(!callback||tray.isDestroyed?.())return
   // Expose Open/Exit immediately. Never offer a stale OS-enabled checkbox.
   callback.startupState=undefined
   rendered.delete(tray);updateSharingTray(tray,callback.state)
   const menu=menus.get(tray)!
   let open=true
   menu.once?.('menu-will-close',()=>{open=false})
   tray.popUpContextMenu(menu)
   try{callback.startupState=await startup.read()}
   catch(error){callback.startupState=undefined;startupError?.(error)}
   if(tray.isDestroyed?.())return
   rendered.delete(tray);updateSharingTray(tray,callback.state)
   if(open){tray.closeContextMenu?.();tray.popUpContextMenu(menus.get(tray))}
  })
  return tray
 }catch(error){actions.delete(tray);tray.destroy();throw error}
}
