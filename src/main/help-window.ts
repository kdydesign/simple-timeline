import {BrowserWindow,ipcMain,screen} from 'electron'
import {helpChannel,helpOpened,initialHelpTopic,validHelpReading,type HelpReadingState} from '../shared/help'
import {helpTimingProbe,observeHelpRequests} from './help-diagnostics'
import type {createHelpPerformance} from './help-performance'
interface HelpOptions {
 mainWindow:BrowserWindow;url:string;preload:string;role:()=>string;version:string;icon?:string;onError:()=>void
 performance?:ReturnType<typeof createHelpPerformance>
}
/** A prepared window is not an open window: only explicit opens participate in tray restoration. */
export function createHelpWindow(options:HelpOptions) {
 let window:BrowserWindow|undefined,reading:HelpReadingState|undefined
 let disposed=false,wanted=false,restoreTogether=false,ready=false,focusWhenReady=false,opened=false,openId=0,serial=0
 const reveal=(focus:boolean)=>{
  if(!window||window.isDestroyed()||!ready||!wanted)return
  if(focus){if(window.isMinimized())window.restore();window.show();window.focus()}else window.showInactive()
  options.performance?.shown(openId)
 }
 const collectTiming=(w:BrowserWindow)=>{
  if(!options.performance)return Promise.resolve()
  return w.webContents.executeJavaScript(helpTimingProbe).then(value=>{if(window===w&&!disposed&&!w.isDestroyed())options.performance?.renderer(value)}).catch(()=>{})
 }
 const notifyOpen=()=>{if(window&&!window.isDestroyed())window.webContents.send(helpOpened)}
 ipcMain.handle(helpChannel,(event,...args:unknown[])=>{
  const w=window
  if(!w||w.isDestroyed()||event.sender!==w.webContents||event.senderFrame!==w.webContents.mainFrame||event.senderFrame?.url!==options.url)return {ok:false}
  const [command,state]=args
  if(command==='preload-timing')return {ok:args.length===2&&(options.performance?.preload(state)??false)}
  if(command==='remember'){
   if(args.length!==2||!validHelpReading(state)||!opened)return {ok:false}
   reading={...state};return {ok:true}
  }
  if(command==='ready'){
   if(args.length!==2||!wanted||typeof state!=='number'||state!==openId||openId===0)return {ok:false}
   options.performance?.ready(openId);void collectTiming(w);return {ok:true}
  }
  if(args.length!==1)return {ok:false}
  switch(command){
   case 'state':return {ok:true,reading:{...(reading??{topicId:initialHelpTopic(options.role()),query:'',scrollTop:0})},openId,version:options.version,maximized:w.isMaximized()}
   case 'minimize':w.minimize();break
   case 'toggle-maximize':w.isMaximized()?w.unmaximize():w.maximize();break
   case 'close':w.close();return {ok:true}
   default:return {ok:false}
  }
  return {ok:true,maximized:w.isMaximized()}
 })
 const prepare=()=>{
  if(disposed||(window&&!window.isDestroyed()))return
  options.performance?.mark('prepare-start')
  const area=screen.getDisplayMatching(options.mainWindow.getBounds()).workArea
  const width=Math.min(1120,area.width),height=Math.min(800,area.height)
  const w=new BrowserWindow({title:'Planrail 도움말',width,height,x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),show:false,frame:false,backgroundColor:'#222629',icon:options.icon,
   webPreferences:{preload:options.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,partition:'planrail-help'}})
  window=w;ready=false;options.performance?.mark('window-created')
  w.setMenu(null)
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  w.webContents.on('will-navigate',event=>event.preventDefault())
  w.webContents.on('will-redirect',event=>event.preventDefault())
  w.webContents.on('will-attach-webview',event=>event.preventDefault())
  w.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
  w.webContents.session.setPermissionCheckHandler(()=>false)
  let failed=false
  const fail=()=>{if(failed||disposed||w.isDestroyed())return;failed=true;options.performance?.mark('failed');w.destroy();if(wanted)options.onError()}
  w.webContents.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{if(mainFrame&&code!==-3)fail()})
  w.webContents.once('preload-error',fail);w.webContents.once('render-process-gone',fail)
  const stopRequests=options.performance?observeHelpRequests(w,options.performance):()=>{}
  w.webContents.once('did-finish-load',()=>{
   options.performance?.mark('renderer-loaded')
   void collectTiming(w).finally(stopRequests)
  })
  w.webContents.once('dom-ready',()=>options.performance?.mark('dom-ready'))
  w.once('ready-to-show',()=>{if(window===w){ready=true;options.performance?.mark('first-paint-ready');if(wanted)notifyOpen();reveal(focusWhenReady)}})
  w.on('close',event=>{if(disposed)return;event.preventDefault();wanted=false;restoreTogether=false;focusWhenReady=false;w.hide()})
  w.once('closed',()=>{if(window===w){window=undefined;ready=false;restoreTogether=false}})
  options.performance?.mark('load-requested');void w.loadURL(options.url).catch(fail)
 }
 return {
  prepare,
  open(){
   if(disposed)return
   const kind=!window||window.isDestroyed()?'cold':!opened?'prepared':wanted?'existing':'reopen'
   openId=options.performance?.open(kind)??++serial
   wanted=true;restoreTogether=false;focusWhenReady=true
   if(!opened){reading={topicId:initialHelpTopic(options.role()),query:'',scrollTop:0};opened=true}
   prepare();if(ready){notifyOpen();reveal(true)}
  },
  hideWithMain(){if(wanted&&window&&!window.isDestroyed()){restoreTogether=true;wanted=false;focusWhenReady=false;window.hide()}},
  restoreWithMain(){
   if(disposed)return
   if(restoreTogether&&window&&!window.isDestroyed()){restoreTogether=false;wanted=true;focusWhenReady=false;notifyOpen();reveal(false)}
  },
  dispose(){if(disposed)return;disposed=true;wanted=false;restoreTogether=false;ipcMain.removeHandler(helpChannel);if(window&&!window.isDestroyed())window.destroy()},
 }
}
