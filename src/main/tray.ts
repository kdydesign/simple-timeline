import {sharingDescription} from '../shared/sharing-status'
import {Menu,Tray,nativeImage} from 'electron'
import type {createLoginStartup,LoginStartupState} from './login-startup'
import type {SharingState} from '../shared/sharing'
export interface TrayNotifications {read:()=>boolean;set:(muted:boolean)=>boolean;error?:(error:unknown)=>void}
interface Actions {show:()=>void;quit:()=>void;about?:()=>void;settings?:()=>void;startup?:ReturnType<typeof createLoginStartup>;startupState?:LoginStartupState;startupError?:(error:unknown)=>void;state?:SharingState;notifications?:TrayNotifications;muted?:boolean;sequence:number;queue:Promise<unknown>;reading?:Promise<void>;writing:boolean}
const actions=new WeakMap<Tray,Actions>()
const rendered=new WeakMap<Tray,string>()
const menus=new WeakMap<Tray,ReturnType<typeof Menu.buildFromTemplate>>()
function invalidate(tray:Tray){const a=actions.get(tray);if(a)a.sequence++}
function serial<T>(a:Actions,operation:()=>Promise<T>):Promise<T>{const p=a.queue.then(operation);a.queue=p.catch(()=>{});return p}
function deadline<T>(operation:()=>Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>
 return Promise.race([Promise.resolve().then(operation),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('상태 확인 시간 초과')),10000)})]).finally(()=>clearTimeout(timer))
}
function readSettings(tray:Tray,a:Actions){
 if(a.reading)return a.reading
 a.reading=serial(a,async()=>{
  try{if(a.startup)a.startupState=await deadline(()=>a.startup!.read())}catch{a.startupState=undefined}
  try{if(a.notifications)a.muted=a.notifications.read()}catch{a.muted=undefined}
 }).finally(()=>{a.reading=undefined;if(!tray.isDestroyed?.()){rendered.delete(tray);updateSharingTray(tray,a.state)}})
 return a.reading
}
function statusIcon(color:'green'|'red'|'gray') {
 const bitmap=Buffer.alloc(16*16*4),rgb=color==='green'?[74,163,22]:color==='red'?[38,38,220]:[113,113,122]
 for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x-7.5)**2+(y-7.5)**2<=36){const i=(y*16+x)*4;bitmap[i]=rgb[0];bitmap[i+1]=rgb[1];bitmap[i+2]=rgb[2];bitmap[i+3]=255}
 return nativeImage.createFromBitmap(bitmap,{width:16,height:16,scaleFactor:1})
}
export function updateSharingTray(tray:Tray,state?:SharingState) {
 const callback=actions.get(tray);if(!callback)return;
 callback.state=state
 const key=JSON.stringify([state?.role,state?.status,state?.message,state?.hostingEnabled,callback.startupState,callback.muted,callback.writing]);if(rendered.get(tray)===key)return
 const normal=state?.role==='member'?state.status==='connected':state?.role==='host'&&state.hostingEnabled&&state.status==='connected';
 const label=state?.role==='host'?`호스트 · ${sharingDescription(state)}`:state?.role==='member'?sharingDescription(state):'공유 미설정';
 rendered.set(tray,key)
 tray.setToolTip(`Planrail · ${label}`)
 const menu=Menu.buildFromTemplate([
  {label:'연결 상태',icon:statusIcon(state?.role==='personal'||!state?'gray':normal?'green':'red'),enabled:false},
  {type:'separator'}, {label:'About',click:callback.about},
  ...(callback.startup?[{label:callback.startupState?'Windows 시작 시 자동 실행':'자동 실행 상태 확인 불가',type:callback.startupState?'checkbox' as const:'normal' as const,checked:callback.startupState?.enabled??false,enabled:!callback.writing&&(callback.startupState?.supported??false),click:async(item:{checked:boolean})=>{
   invalidate(tray);callback.writing=true
   try{await serial(callback,async()=>{const result=await callback.startup!.set(item.checked);callback.startupState=result.state;if(result.error)callback.startupError?.(result.error)})}catch(error){callback.startupState=undefined;callback.startupError?.(error)}
   finally{callback.writing=false;if(!tray.isDestroyed?.()){rendered.delete(tray);updateSharingTray(tray,callback.state)}}
  }}]:[]),
  ...(callback.notifications?[{label:callback.muted===undefined?'알림 상태 확인 불가':'전체 알림 끄기',type:callback.muted===undefined?'normal' as const:'checkbox' as const,checked:callback.muted??false,enabled:!callback.writing&&callback.muted!==undefined,click:async(item:{checked:boolean})=>{
   invalidate(tray);callback.writing=true
   try{await serial(callback,async()=>{callback.muted=callback.notifications!.set(item.checked)})}catch(error){try{callback.muted=callback.notifications!.read()}catch{callback.muted=undefined}callback.notifications!.error?.(error)}
   finally{callback.writing=false;if(!tray.isDestroyed?.()){rendered.delete(tray);updateSharingTray(tray,callback.state)}}
  }}]:[]), {type:'separator'},
  {label:'Open',click:()=>{invalidate(tray);callback.show()}}, {label:'Exit',click:()=>{invalidate(tray);callback.quit()}},
 ])
 if(callback.startup||callback.notifications){menus.set(tray,menu)}else tray.setContextMenu(menu)
}
export function createTray(icon:string,show:()=>void,requestQuit:()=>void,showAbout?:()=>void,openSharingSettings?:()=>void,state?:SharingState,startup?:ReturnType<typeof createLoginStartup>,startupError?:(error:unknown)=>void,notifications?:TrayNotifications):Tray {
 const tray=new Tray(icon)
 try {
  const callback:Actions={show,quit:requestQuit,about:showAbout,settings:openSharingSettings,startup,startupError,notifications,sequence:0,queue:Promise.resolve(),writing:false}
  actions.set(tray,callback)
  updateSharingTray(tray,state)
  tray.on('click',()=>{invalidate(tray);show()})
  if(startup||notifications){
   void readSettings(tray,callback)
   tray.on('right-click',async()=>{
    const request=++callback.sequence
    await readSettings(tray,callback)
    if(tray.isDestroyed?.()||request!==callback.sequence)return
    tray.popUpContextMenu(menus.get(tray))
   })
  }
  return tray
 }catch(error){actions.delete(tray);tray.destroy();throw error}
}
