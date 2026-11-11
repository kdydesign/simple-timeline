// Loaded only by Playwright's privileged main-process inspector on a disposable Windows VM.
// Never part of app.asar; production catalog acceptance stays unchanged.
import {app,BrowserWindow,ipcMain} from 'electron'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {prepareProductionInstaller,createRendererInstallGuard,type PreparedInstaller} from '../../src/main/updates/installer'
import {isTrustedSender} from '../../src/main/ipc-core'
import {updatesGuard,updatesGuardReply,type UpdatePublication} from '../../src/shared/updates'
let prepared:PreparedInstaller|undefined,guard:ReturnType<typeof createRendererInstallGuard>|undefined,clean=false,evidencePath=''
function requireVM(){if(process.platform!=='win32'||process.arch!=='x64'||!app.isPackaged||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Disposable packaged Windows VM required')}
export async function prepare(directory:string,report:string){
 requireVM();const manifest=JSON.parse(await readFile(join(directory,'release-manifest.json'),'utf8'))
 if(manifest.validationUpdateOnly!==true)throw Error('Explicit synthetic lifecycle fixture required')
 const bytes=await readFile(join(directory,manifest.installer)),sha256=createHash('sha256').update(bytes).digest('hex')
 if(sha256!==manifest.sha256)throw Error('Lifecycle fixture hash mismatch')
 const publication:UpdatePublication={protocolVersion:1,hostId:'disposable-vm',revision:1,publicationId:'11111111-1111-4111-8111-111111111111',releaseId:sha256,manifest:{schemaVersion:1,appId:'com.kdydesign.simpletimeline',version:manifest.version,sourceSha:manifest.sourceSha,platform:'win32',arch:'x64',installerType:'nsis',installScope:'per-user',signed:false,validationUpdateOnly:false,files:[{id:'installer',name:manifest.installer,size:bytes.length,sha256,sha512:createHash('sha512').update(bytes).digest('base64')}]}}
 // The synthetic file enters the adapter directly, never the production catalog or LAN service.
 prepared=await prepareProductionInstaller({directory,publication,current:()=>true});await prepared.validate();evidencePath=report
 const window=BrowserWindow.getAllWindows()[0],url=window.webContents.getURL()
 guard=createRendererInstallGuard(request=>window.webContents.send(updatesGuard,request))
 ipcMain.removeHandler(updatesGuardReply)
 ipcMain.handle(updatesGuardReply,(event,id,value)=>isTrustedSender(event,window,url)&&typeof id==='string'&&typeof value==='boolean'?guard!.acknowledge(id,value):false)
 return{cachePrepared:true,targetVersion:manifest.version}
}
export async function freeze(){if(!guard)throw Error('Prepare first');clean=await guard.freeze();if(!clean)guard.release();return clean}
export function release(){guard?.release();clean=false}
export function handoffAfterShutdown(){
 requireVM();if(!prepared||!clean)throw Error('Clean renderer acknowledgment required')
 const installer=prepared
 // Observe the real bootstrap will-quit listener. Its first event is prevented while
 // services/SQLite drain; only the later uncancelled event means shutdown completed.
 const observe=(event:Electron.Event)=>{
  if(event.defaultPrevented)return
  event.preventDefault();app.removeListener('will-quit',observe)
  void(async()=>{await installer.validate();await writeFile(evidencePath,JSON.stringify({shutdownCompletedBeforeHandoff:true,pid:process.pid,at:new Date().toISOString()}));await installer.handoff()})().catch(async()=>{await writeFile(evidencePath+'.error','Real updater handoff failed')})
 }
 app.on('will-quit',observe);setImmediate(()=>app.quit())
}
