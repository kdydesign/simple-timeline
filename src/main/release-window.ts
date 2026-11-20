import {BrowserWindow,ipcMain,screen,type Rectangle} from 'electron'
import {releaseChannel,releaseOpened,releaseUnload,validReleaseReading,type ReleaseReading} from '../shared/release-notes'
import {releaseNotes} from '../shared/release-content'
interface Options {mainWindow:BrowserWindow;url:string;preload:string;version:string;icon?:string;onError:()=>void}
/** Lazy, read-only singleton. User-close and tray hiding deliberately have different restoration rules. */
export function createReleaseWindow(o:Options){
 let window:BrowserWindow|undefined,disposed=false,wanted=false,restoreTogether=false,ready=false,focusWhenReady=false
 let closing=false,normalBounds:Rectangle|undefined,maximizeOnReveal=false
 let reading:ReleaseReading={version:releaseNotes.some(n=>n.version===o.version)?o.version:releaseNotes[0].version,scrollTop:0}
 const reveal=()=>{
  if(!window||window.isDestroyed()||!ready||!wanted)return
  if(maximizeOnReveal){maximizeOnReveal=false;window.maximize()}
  if(focusWhenReady){if(window.isMinimized())window.restore();window.show();window.focus()}else window.showInactive()
 }
 const notify=()=>window?.webContents.send(releaseOpened)
 ipcMain.handle(releaseChannel,(event,...args:unknown[])=>{
  const w=window
  if(!w||closing||w.isDestroyed()||event.sender!==w.webContents||event.senderFrame!==w.webContents.mainFrame||event.senderFrame?.url!==o.url)return {ok:false}
  const [command,value]=args
  if(command==='remember'){if(args.length!==2||!validReleaseReading(value))return {ok:false};reading={...value};return {ok:true}}
  if(args.length!==1)return {ok:false}
  switch(command){
   case 'state':return {ok:true,reading:{...reading},version:o.version,maximized:w.isMaximized()}
   case 'minimize':w.minimize();break
   case 'toggle-maximize':w.isMaximized()?w.unmaximize():w.maximize();break
   case 'close':w.close();return {ok:true}
   default:return {ok:false}
  }
  return {ok:true,maximized:w.isMaximized()}
 })
 const prepare=()=>{
  if(disposed||closing||(window&&!window.isDestroyed()))return
  const area=screen.getDisplayMatching(normalBounds??o.mainWindow.getBounds()).workArea
  const width=Math.min(normalBounds?.width??1120,area.width)
  const height=Math.min(normalBounds?.height??800,area.height)
  const targetX=normalBounds?.x??area.x+Math.floor((area.width-width)/2)
  const targetY=normalBounds?.y??area.y+Math.floor((area.height-height)/2)
  const x=Math.min(area.x+area.width-width,Math.max(area.x,targetX))
  const y=Math.min(area.y+area.height-height,Math.max(area.y,targetY))
  const w=new BrowserWindow({title:'WorkRail 릴리즈노트',width,height,x,y,show:false,frame:false,backgroundColor:'#222629',icon:o.icon,webPreferences:{preload:o.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,partition:'planrail-release-notes'}})
  window=w;ready=false;w.setMenu(null)
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  w.webContents.on('will-navigate',e=>e.preventDefault())
  w.webContents.on('will-redirect',e=>e.preventDefault())
  w.webContents.on('will-attach-webview',e=>e.preventDefault())
  w.webContents.session.setPermissionRequestHandler((_c,_p,callback)=>callback(false));w.webContents.session.setPermissionCheckHandler(()=>false)
  // The preload's beforeunload checkpoint also covers Alt+F4 and taskbar Close.
  w.webContents.ipc.on(releaseUnload,(event,...args:unknown[])=>{
   if(window===w&&closing&&!disposed&&!w.isDestroyed()&&event.sender===w.webContents
    &&event.senderFrame===w.webContents.mainFrame&&event.senderFrame?.url===o.url
    &&args.length===1&&validReleaseReading(args[0])){
    reading={...args[0]}
    event.returnValue=true
   }else event.returnValue=false
  })
  let closeTimeout:ReturnType<typeof setTimeout>|undefined
  let failed=false
  const fail=()=>{if(failed||disposed||closing||window!==w||w.isDestroyed())return;failed=true;w.destroy();if(wanted)o.onError()}
  w.webContents.on('did-fail-load',(_e,code,_d,_u,main)=>{if(main&&code!==-3)fail()});w.webContents.once('preload-error',fail);w.webContents.once('render-process-gone',fail)
  w.once('ready-to-show',()=>{if(window===w&&!closing){ready=true;if(wanted)notify();reveal()}})
  w.once('close',()=>{
   if(window!==w)return
   normalBounds=w.getNormalBounds()
   maximizeOnReveal=maximizeOnReveal||w.isMaximized()
   closing=true
   // Keep the current frame available for its checkpoint, even on an immediate reopen.
   w.hide()
   closeTimeout=setTimeout(()=>{if(!w.isDestroyed())w.destroy()},1000)
   wanted=false
   ready=false
   restoreTogether=false
   focusWhenReady=false
  })
  w.once('closed',()=>{
   clearTimeout(closeTimeout)
   if(window!==w)return
   window=undefined
   ready=false
   const reopen=closing&&(wanted||restoreTogether)
   closing=false
   if(reopen)prepare()
   else restoreTogether=false
  })
  void w.loadURL(o.url).catch(fail)
 }
 return {
  open(){if(disposed)return;wanted=true;restoreTogether=false;focusWhenReady=true;prepare();if(ready){notify();reveal()}},
  hideWithMain(){
   if(!wanted||!window||(!closing&&window.isDestroyed()))return
   restoreTogether=true;wanted=false;focusWhenReady=false
   if(!closing)window.hide()
  },
  restoreWithMain(){
   if(disposed||!restoreTogether||!window||(!closing&&window.isDestroyed()))return
   restoreTogether=false;wanted=true;focusWhenReady=false
   if(ready)notify()
   reveal()
  },
  dispose(){if(disposed)return;disposed=true;wanted=false;restoreTogether=false;ipcMain.removeHandler(releaseChannel);if(window&&!window.isDestroyed())window.destroy()},
 }
}
