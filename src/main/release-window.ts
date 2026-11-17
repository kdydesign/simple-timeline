import {BrowserWindow,ipcMain,screen} from 'electron'
import {releaseChannel,releaseOpened,validReleaseReading,type ReleaseReading} from '../shared/release-notes'
import {releaseNotes} from '../shared/release-content'
interface Options {mainWindow:BrowserWindow;url:string;preload:string;version:string;icon?:string;onError:()=>void}
/** Lazy, read-only singleton. User-close and tray hiding deliberately have different restoration rules. */
export function createReleaseWindow(o:Options){
 let window:BrowserWindow|undefined,disposed=false,wanted=false,restoreTogether=false,ready=false,focusWhenReady=false
 let reading:ReleaseReading={version:releaseNotes.some(n=>n.version===o.version)?o.version:releaseNotes[0].version,scrollTop:0}
 const reveal=()=>{if(!window||window.isDestroyed()||!ready||!wanted)return;if(focusWhenReady){if(window.isMinimized())window.restore();window.show();window.focus()}else window.showInactive()}
 const notify=()=>window?.webContents.send(releaseOpened)
 ipcMain.handle(releaseChannel,(event,...args:unknown[])=>{
  const w=window
  if(!w||w.isDestroyed()||event.sender!==w.webContents||event.senderFrame!==w.webContents.mainFrame||event.senderFrame?.url!==o.url)return {ok:false}
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
  if(disposed||(window&&!window.isDestroyed()))return
  const a=screen.getDisplayMatching(o.mainWindow.getBounds()).workArea,width=Math.min(1120,a.width),height=Math.min(800,a.height)
  const w=new BrowserWindow({title:'Planrail 릴리즈노트',width,height,x:a.x+Math.floor((a.width-width)/2),y:a.y+Math.floor((a.height-height)/2),show:false,frame:false,backgroundColor:'#222629',icon:o.icon,webPreferences:{preload:o.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,partition:'planrail-release-notes'}})
  window=w;ready=false;w.setMenu(null)
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  w.webContents.on('will-navigate',e=>e.preventDefault())
  w.webContents.on('will-redirect',e=>e.preventDefault())
  w.webContents.on('will-attach-webview',e=>e.preventDefault())
  w.webContents.session.setPermissionRequestHandler((_c,_p,callback)=>callback(false));w.webContents.session.setPermissionCheckHandler(()=>false)
  let failed=false
  const fail=()=>{if(failed||disposed||w.isDestroyed())return;failed=true;w.destroy();if(wanted)o.onError()}
  w.webContents.on('did-fail-load',(_e,code,_d,_u,main)=>{if(main&&code!==-3)fail()});w.webContents.once('preload-error',fail);w.webContents.once('render-process-gone',fail)
  w.once('ready-to-show',()=>{if(window===w){ready=true;if(wanted)notify();reveal()}})
  w.on('close',e=>{if(disposed)return;e.preventDefault();wanted=false;restoreTogether=false;focusWhenReady=false;w.hide()})
  w.once('closed',()=>{if(window===w){window=undefined;ready=false;restoreTogether=false}})
  void w.loadURL(o.url).catch(fail)
 }
 return {
  open(){if(disposed)return;wanted=true;restoreTogether=false;focusWhenReady=true;prepare();if(ready){notify();reveal()}},
  hideWithMain(){if(wanted&&window&&!window.isDestroyed()){restoreTogether=true;wanted=false;focusWhenReady=false;window.hide()}},
  restoreWithMain(){if(!disposed&&restoreTogether&&window&&!window.isDestroyed()){restoreTogether=false;wanted=true;focusWhenReady=false;notify();reveal()}},
  dispose(){if(disposed)return;disposed=true;wanted=false;restoreTogether=false;ipcMain.removeHandler(releaseChannel);if(window&&!window.isDestroyed())window.destroy()},
 }
}
