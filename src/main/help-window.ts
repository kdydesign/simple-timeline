import {BrowserWindow,ipcMain,screen} from 'electron'
import {helpChannel,initialHelpTopic,validHelpReading,type HelpReadingState} from '../shared/help'

interface HelpOptions {
 mainWindow:BrowserWindow;url:string;preload:string;role:()=>string;version:string;icon?:string;onError:()=>void
}
/** Read-only, session-scoped help. Never shares the application's capability preload. */
export function createHelpWindow(options:HelpOptions) {
 let window:BrowserWindow|undefined,reading:HelpReadingState|undefined
 let disposed=false,wanted=false,restoreTogether=false,ready=false,focusWhenReady=false,deferredError=false
 const reveal=(focus:boolean)=>{
  if(!window||window.isDestroyed()||!ready||!wanted)return
  if(focus){
   if(window.isMinimized())window.restore()
   window.show();window.focus()
  }else window.showInactive()
 }
 ipcMain.handle(helpChannel,(event,...args:unknown[])=>{
  const w=window
  // Match the full fixed URL even in development, not just its origin.
  if(!w||w.isDestroyed()||event.sender!==w.webContents||event.senderFrame!==w.webContents.mainFrame||event.senderFrame?.url!==options.url)return {ok:false}
  const [command,state]=args
  if(command==='remember'){
   if(args.length!==2||!validHelpReading(state))return {ok:false}
   reading={...state};return {ok:true}
  }
  if(args.length!==1)return {ok:false}
  switch(command){
   case 'state':return {ok:true,reading:{...reading!},version:options.version,maximized:w.isMaximized()}
   case 'minimize':w.minimize();break
   case 'toggle-maximize':w.isMaximized()?w.unmaximize():w.maximize();break
   case 'close':w.close();return {ok:true}
   default:return {ok:false}
  }
  return {ok:true,maximized:w.isMaximized()}
 })
 return {
  open(){
   if(disposed)return
   if(deferredError){deferredError=false;options.onError()}
   wanted=true;restoreTogether=false;focusWhenReady=true
   if(window&&!window.isDestroyed()){reveal(true);return}
   reading??={topicId:initialHelpTopic(options.role()),query:'',scrollTop:0}
   const area=screen.getDisplayMatching(options.mainWindow.getBounds()).workArea
   const width=Math.min(1120,area.width),height=Math.min(800,area.height)
   const w=new BrowserWindow({title:'Planrail 도움말',width,height,x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),show:false,frame:false,backgroundColor:'#222629',icon:options.icon,
    webPreferences:{preload:options.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,partition:'planrail-help'}})
   window=w;ready=false
   w.setMenu(null)
   w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
   w.webContents.on('will-navigate',event=>event.preventDefault())
   w.webContents.on('will-redirect',event=>event.preventDefault())
   w.webContents.on('will-attach-webview',event=>event.preventDefault())
   w.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
   w.webContents.session.setPermissionCheckHandler(()=>false)
   let failed=false
   const fail=()=>{
    if(failed||disposed||w.isDestroyed())return
    failed=true;w.destroy()
    if(wanted)options.onError();else deferredError=true
   }
   w.webContents.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{if(mainFrame&&code!==-3)fail()})
   w.webContents.once('preload-error',fail)
   w.webContents.once('render-process-gone',fail)
   w.once('ready-to-show',()=>{if(window===w){ready=true;reveal(focusWhenReady)}})
   w.once('closed',()=>{if(window===w){window=undefined;ready=false;restoreTogether=false}})
   void w.loadURL(options.url).catch(fail)
  },
  hideWithMain(){if(window&&!window.isDestroyed()){restoreTogether=true;wanted=false;focusWhenReady=false;window.hide()}},
  restoreWithMain(){
   if(disposed)return
   if(deferredError){deferredError=false;options.onError()}
   if(restoreTogether&&window&&!window.isDestroyed()){restoreTogether=false;wanted=true;focusWhenReady=false;reveal(false)}
  },
  dispose(){if(disposed)return;disposed=true;wanted=false;restoreTogether=false;ipcMain.removeHandler(helpChannel);if(window&&!window.isDestroyed())window.destroy()},
 }
}
