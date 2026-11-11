import { addSensitiveFieldPattern } from 'builder-util-runtime/out/httpExecutor'
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { join } from 'node:path'
import { hashUpdateFile } from './bundle'
import { createLoopbackFeed } from './feed'
import type { UpdatePublication } from '../../shared/updates'
export function createMutationBarrier(){
 let locked=false;const active=new Set<Promise<unknown>>()
 return {blocked:()=>locked,
  async run<T>(operation:()=>T|Promise<T>):Promise<T>{if(locked)throw Error('Update shutdown in progress');const work=Promise.resolve().then(operation);active.add(work);try{return await work}finally{active.delete(work)}},
  async freeze(){locked=true;while(active.size)await Promise.allSettled([...active])},release(){locked=false},
 }
}
export type MutationBarrier=ReturnType<typeof createMutationBarrier>
export interface InstallInput {directory:string;publication:UpdatePublication;current():boolean;signal?:AbortSignal;onInstalling?():void}
export interface PreparedInstaller {validate():Promise<void>;handoff():void|Promise<void>;dispose():Promise<void>;cacheFiles?:string[]}
export function createInstallCoordinator(o:{barrier:MutationBarrier;prepare(input:InstallInput):Promise<PreparedInstaller>;freezeRenderer():Promise<boolean>;releaseRenderer():void;record(input:InstallInput,cacheFiles:string[]):Promise<void>;shutdown():Promise<void>}){
 let running=false
 return {async install(input:InstallInput):Promise<'dirty'|'installed'>{
  if(running)throw Error('Install already in progress');running=true
  let prepared:PreparedInstaller|undefined,teardown=false,frozen=false
  const check=()=>{if(!input.current())throw Error('Update trust changed')}
  try{
   check();prepared=await o.prepare(input);check();await prepared.validate();check()
   frozen=true
   if(!await o.freezeRenderer()){o.releaseRenderer();frozen=false;return 'dirty'}
   check();await o.barrier.freeze();check();input.onInstalling?.();await prepared.validate();check()
   await o.record(input,prepared.cacheFiles??[]);check()
   teardown=true;await o.shutdown();check();await prepared.validate();check()
   await prepared.handoff();return 'installed'
  }catch(error){if(!teardown){o.barrier.release();if(frozen)o.releaseRenderer()}throw error}
  finally{running=false;await prepared?.dispose()}
 }}
}
/** No shell, elevate.exe, /D staging path, fallback launcher, or forced process termination. */
export async function launchPerUserInstaller(path:string,launch:(path:string,args:string[],options:SpawnOptions)=>ChildProcess=spawn):Promise<void>{
 await new Promise<void>((resolve,reject)=>{
  const child=launch(path,['--updated','/S','--force-run'],{detached:true,stdio:'ignore',shell:false})
  child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})
 })
}
export interface UpdaterAdapter {
 logger?: import('electron-updater').Logger | null
 autoDownload:boolean;autoInstallOnAppQuit:boolean;allowPrerelease:boolean;allowDowngrade:boolean;disableDifferentialDownload:boolean;disableWebInstaller:boolean;autoRunAppAfterInstall:boolean
 setFeedURL(options:{provider:'generic';url:string;useMultipleRangeRequest:boolean}):void
 checkForUpdates():Promise<unknown>;downloadUpdate():Promise<string[]>;quitAndInstall(silent:boolean,relaunch:boolean):void
}
let runtimeLoggingProtected=false
export async function prepareUpdater(input:InstallInput,updater:UpdaterAdapter,handoff?:()=>Promise<void>):Promise<PreparedInstaller>{
 // The pinned updater logs error stacks (including capability URLs) through this setter.
 updater.logger=null
 // The runtime's separate DEBUG logger serializes request options independently.
 // Its documented redaction registry avoids intercepting process-wide logging.
 if(!runtimeLoggingProtected){addSensitiveFieldPattern('path');addSensitiveFieldPattern('url');runtimeLoggingProtected=true}
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;updater.disableDifferentialDownload=true;updater.disableWebInstaller=true;updater.autoRunAppAfterInstall=true
 const feed=await createLoopbackFeed(input)
 const abort=()=>{void feed.close()}
 input.signal?.addEventListener('abort',abort,{once:true})
 const dispose=async()=>{input.signal?.removeEventListener('abort',abort);await feed.close()}
 try{
  if(input.signal?.aborted||!input.current())throw Error('Install preparation cancelled')
  updater.setFeedURL({provider:'generic',url:feed.url,useMultipleRangeRequest:false})
  await updater.checkForUpdates();const paths=await updater.downloadUpdate()
  if(paths.length!==1)throw Error('Unexpected installer cache')
  const file=input.publication.manifest.files.find(f=>f.id==='installer')!
  const validate=async()=>{for(const path of [join(input.directory,file.name),paths[0]]){const hash=await hashUpdateFile(path,file.size);if(hash.size!==file.size||hash.sha256!==file.sha256||hash.sha512!==file.sha512)throw Error('Installer cache integrity failed')}}
  await validate()
  return {validate,cacheFiles:paths,handoff:handoff??(()=>updater.quitAndInstall(true,true)),dispose}
 }catch(e){await dispose();throw e}
}
/** Uses protected 6.8.11 NSIS extension points to remove the library's elevation fallback. */
export async function prepareProductionInstaller(input:InstallInput):Promise<PreparedInstaller>{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 required')
 const {NsisUpdater}=await import('electron-updater')
 class PerUserUpdater extends NsisUpdater {
  launch:Promise<void>|undefined
  protected override doInstall(options:{isSilent:boolean;isForceRunAfter:boolean;isAdminRightsRequired:boolean}):boolean{
   if(options.isAdminRightsRequired||!options.isSilent||!options.isForceRunAfter||this.installDirectory||!this.installerPath)throw Error('Unsafe installer options')
   this.launch=launchPerUserInstaller(this.installerPath).then(()=>{this.app.quit()})
   // BaseUpdater must not quit before the asynchronous spawn acknowledgment.
   return false
  }
 }
 const updater=new PerUserUpdater();let updaterError:Error|undefined
 updater.on('error',(error:Error)=>{updaterError=error})
 const prepared=await prepareUpdater(input,updater,async()=>{updater.quitAndInstall(true,true);if(!updater.launch)throw updaterError??Error('Installer launch failed');await updater.launch})
 const original=prepared.validate
 prepared.validate=async()=>{if(updaterError)throw updaterError;await original()}
 return prepared
}
export function createRendererInstallGuard(send:(request:import('../../shared/updates').UpdateGuardRequest)=>void,timeoutMs=30000){
 let pending:{id:string;resolve:(clean:boolean)=>void;timer:ReturnType<typeof setTimeout>}|undefined
 const settle=(clean:boolean)=>{if(!pending)return;clearTimeout(pending.timer);const p=pending;pending=undefined;p.resolve(clean)}
 return {
  freeze():Promise<boolean>{settle(false);return new Promise(resolve=>{const requestId=crypto.randomUUID();pending={id:requestId,resolve,timer:setTimeout(()=>settle(false),timeoutMs)};try{send({requestId,action:'freeze'})}catch{settle(false)}})},
  acknowledge(requestId:string,clean:boolean){if(!pending||pending.id!==requestId)return false;settle(clean);return true},
  release(){settle(false);try{send({requestId:crypto.randomUUID(),action:'release'})}catch{/* Renderer no longer exists. */}},
  dispose(){settle(false)},
 }
}
