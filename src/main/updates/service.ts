import { SharingNetworkError } from '../sharing/transport'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, lstat, statfs } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { compareStableVersions, type UpdateState, type UpdatePublication, type UpdateStatus, type UpdateErrorCode } from '../../shared/updates'
import { parseUpdateManifest, hashUpdateFile } from './bundle'
import { UpdateHostMismatchError, type UpdateCatalog } from './catalog'
import { readUpdateStatus, downloadUpdateFile, type UpdateConnection } from './transport'
import type { InstallInput } from './installer'
export interface UpdateSharingContext {role:UpdateState['role'];connected:boolean;connection?:UpdateConnection;revoked?:boolean;trustPending?:boolean}
interface Ready {schemaVersion:1;publication:UpdatePublication;trust:string;directory:string}
interface Options {
 root:string;version:string;updaterCacheRoot?:string;catalog?:()=>Promise<UpdateCatalog>;chooseBundle?:()=>Promise<string|undefined>
 readStatus?:typeof readUpdateStatus;downloadFile?:typeof downloadUpdateFile
 install(input:InstallInput):Promise<'dirty'|'installed'>;changed?:(state:UpdateState)=>void;editingBlocked?:()=>boolean
}
const fingerprint=(c:UpdateConnection)=>createHash('sha256').update(JSON.stringify([c.address,c.trust.hostId,c.trust.pin,c.token])).digest('hex')
export async function atomicUpdateRecord(path:string,value:unknown):Promise<void>{
 const temporary=`${path}.${randomUUID()}.tmp`,file=await open(temporary,'wx',0o600)
 try{await file.writeFile(JSON.stringify(value));await file.sync()}finally{await file.close()}
 try{await rename(temporary,path)}finally{await rm(temporary,{force:true})}
}
export function parseUpdateStatus(value:unknown,hostId:string):UpdateStatus{
 const s=value as UpdateStatus
 if(!s||s.protocolVersion!==1||s.hostId!==hostId||!Number.isSafeInteger(s.revision)||s.revision<0)throw new SharingNetworkError('INVALID_RESPONSE')
 let publication:UpdatePublication|null=null
 if(s.publication!==null){const p=s.publication
  if(!p||p.protocolVersion!==1||p.hostId!==hostId||p.revision!==s.revision||!/^[a-f0-9]{64}$/.test(p.releaseId)||!/^[a-f0-9-]{36}$/.test(p.publicationId))throw new SharingNetworkError('INVALID_RESPONSE')
  publication={protocolVersion:1,hostId,revision:s.revision,publicationId:p.publicationId,releaseId:p.releaseId,manifest:parseUpdateManifest(p.manifest)}
 }
 return {protocolVersion:1,hostId,revision:s.revision,publication}
}
export async function createUpdateService(o:Options){
 await mkdir(o.root,{recursive:true,mode:0o700})
 if((await lstat(o.root)).isSymbolicLink())throw Error('Invalid member update directory')
 let context:UpdateSharingContext={role:'personal',connected:false},trust:string|undefined,publication:UpdatePublication|null=null,ready:Ready|undefined
 let phase:UpdateState['phase']='idle',error:UpdateErrorCode|null=null,connected=false,explicit=false,received=0,revision=0,generation=0,disposed=false,importing=false,installing=false
 let completedReady:Ready|undefined,cleanupFailed=false
 let observed:Record<string,number>={}
 let catalog:UpdateCatalog|undefined,downloadTask:Promise<void>|undefined,checkTask:Promise<void>|undefined,installTask:Promise<void>|undefined
 let abort:AbortController|undefined,checkAbort:AbortController|undefined,io:Promise<unknown>=Promise.resolve()
 const listeners=new Set<(state:UpdateState)=>void>()
 const serialize=<T>(f:()=>Promise<T>):Promise<T>=>{const work=io.then(f);io=work.catch(()=>{});return work}
 const readyPath=join(o.root,'ready.json'),observedPath=join(o.root,'observed.json')
 async function observe(binding:string,value:number){
  if(value<=(observed[binding]??-1))return
  const floors={...observed,[binding]:value},record={schemaVersion:1,floors}
  try{
   if(Buffer.byteLength(JSON.stringify(record))>1024*1024)throw Error('Observation limit exceeded')
   await serialize(async()=>{await atomicUpdateRecord(observedPath,record);observed=floors})
  }catch{throw Object.assign(Error('Unable to persist update revision'),{code:'STORAGE_IO'})}
 }
 try{
  const info=await lstat(observedPath)
  if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024)throw Error('Invalid update observations')
  const saved=JSON.parse(await readFile(observedPath,'utf8'))
  if(saved?.schemaVersion!==1||!saved.floors||typeof saved.floors!=='object'||Array.isArray(saved.floors))throw Error('Invalid update observations')
  for(const [binding,value] of Object.entries(saved.floors)){
   if(!/^[a-f0-9]{64}$/.test(binding)||!Number.isSafeInteger(value)||Number(value)<0)throw Error('Invalid update observation')
  }
  observed={...saved.floors}
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Update revision storage unavailable')}

 const persist=()=>{const value=ready?structuredClone(ready):undefined;return serialize(()=>value?atomicUpdateRecord(readyPath,value):rm(readyPath,{force:true}))}
 function getState():UpdateState{
  const h=catalog?.status(),file=publication?.manifest.files.find(f=>f.id==='installer'),busy=phase==='downloading'||phase==='verifying'||installing
  return {revision,role:context.role,phase,version:publication?.manifest.version??null,totalBytes:file?.size??0,receivedBytes:received,connected,requiresExplicitInstall:explicit,editingBlocked:o.editingBlocked?.()??false,
   canDownload:context.role==='member'&&!!publication&&connected&&!busy&&!ready,canCancel:!!publication&&phase!=='installing'&&!o.editingBlocked?.()&&(!!ready||phase==='downloading'||phase==='verifying'),canRetry:context.role==='member'&&!!publication&&phase==='error'&&connected&&!ready,
   canInstall:!!ready&&trust===ready.trust&&!installing&&!disposed&&!o.editingBlocked?.(),error,
   host:context.role==='host'?{importing,currentVersion:h?.current?.manifest.version??null,candidateVersion:h?.candidate?.manifest.version??null,candidateBytes:h?.candidate?.manifest.files.find(f=>f.id==='installer')?.size??0,publishing:!!h?.publication,canPublish:!!h?.current||!!h?.candidate}:null}
 }
 function changed(){revision++;const s=getState();try{o.changed?.(s)}catch{/* Observers do not change committed state. */}for(const listener of listeners)try{listener(s)}catch{/* Ignore detached views. */}}
 const current=(g:number)=>!disposed&&generation===g
 async function invalidate(code:UpdateErrorCode|null,keepPublication=false){const obsolete=ready;generation++;abort?.abort();checkAbort?.abort();ready=undefined;if(!keepPublication)publication=null;received=0;explicit=false;phase=code?'error':publication?'available':'idle';error=code;changed();await persist();if(obsolete)try{await rm(join(o.root,obsolete.directory),{recursive:true,force:true})}catch{error='storage';changed()}}
 async function verify(value:Ready){
  for(const f of value.publication.manifest.files){const hash=await hashUpdateFile(join(o.root,value.directory,f.name),f.size);if(hash.size!==f.size||hash.sha256!==f.sha256||hash.sha512!==f.sha512)throw Error('Staged integrity mismatch')}
 }
 try{
  const info=await lstat(readyPath);if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024)throw Error('Invalid ready record')
  const r=JSON.parse(await readFile(readyPath,'utf8')) as Ready
  if(r.schemaVersion!==1||!/^[a-f0-9-]{36}$/.test(r.directory)||!/^[a-f0-9]{64}$/.test(r.trust))throw Error('Invalid ready record')
  r.publication=parseUpdateStatus({protocolVersion:1,hostId:r.publication.hostId,revision:r.publication.revision,publication:r.publication},r.publication.hostId).publication!
  if(r.publication.revision<(observed[r.trust]??-1))throw new SharingNetworkError('INVALID_RESPONSE')
  await observe(r.trust,r.publication.revision)
  if(compareStableVersions(r.publication.manifest.version,o.version)>0){await verify(r);ready=r;publication=r.publication;phase='waiting';explicit=true}
  else completedReady=r
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){phase='error';error=e instanceof SharingNetworkError?'integrity':'storage'}}
 try{const attempt=JSON.parse(await readFile(join(o.root,'attempt.json'),'utf8'));if(ready&&attempt.schemaVersion===1&&attempt.stage==='handoff'&&attempt.fromVersion===o.version&&attempt.targetVersion===ready.publication.manifest.version)error='install'}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){error='storage'}}
 // Only update-owned stage directories and temporary records are touched.
 for(const name of await readdir(o.root))if((/^[a-f0-9-]{36}$/.test(name)&&name!==ready?.directory&&name!==completedReady?.directory)||name.endsWith('.tmp'))await rm(join(o.root,name),{recursive:true,force:true})
 async function check(){
  if(disposed||phase==='installing'||context.role!=='member'||!context.connection||context.revoked)return
  if(checkTask)return checkTask
  const g=generation,c=context.connection,controller=new AbortController();checkAbort=controller
  let requestGeneration=g
  const work=(async()=>{
   try{
    const response=await (o.readStatus??readUpdateStatus)({...c,signal:controller.signal})
    let status:UpdateStatus
    try{status=parseUpdateStatus(response,c.trust.hostId)}catch{throw new SharingNetworkError('INVALID_RESPONSE')}
    if(!current(g))return
    if(status.revision<(observed[fingerprint(c)]??-1))throw new SharingNetworkError('INVALID_RESPONSE')
    const next=status.publication&&compareStableVersions(status.publication.manifest.version,o.version)>0?status.publication:null
    let invalidating:Promise<void>|undefined
    if(publication&&publication.publicationId!==next?.publicationId){
     // Fence/abort the old attempt before any filesystem await; an authenticated
     // withdrawal/replacement is already observed even if its durable write stalls.
     invalidating=invalidate(next?'replaced':'withdrawn');requestGeneration=g+1
    }else if(publication&&next&&JSON.stringify(publication)!==JSON.stringify(next))throw new SharingNetworkError('INVALID_RESPONSE')
    await Promise.all([invalidating,observe(fingerprint(c),status.revision)])
    if(!current(requestGeneration))return
    connected=true
    if(next&&!publication){publication=next;phase='available';error=null;received=0}
    if(!next&&!publication&&phase!=='error')phase='idle'
    changed()
   }catch(e){if(!current(requestGeneration))return;connected=false
    const code=(e as {code?:string}).code
    if(['UNAUTHORIZED','REVOKED','TLS_UNTRUSTED'].includes(code??'')){await invalidate('trust-changed');context={...context,revoked:true}}
    else if(code==='STORAGE_IO'){await invalidate('storage')}
    else if(['INVALID_RESPONSE','UNSUPPORTED','PROTOCOL_MISMATCH'].includes(code??'')){await invalidate(code==='UNSUPPORTED'?'unsupported':'integrity')}
    else{if(!publication){phase='error';error='network'}changed()}
   }
  })().finally(()=>{if(checkTask===work)checkTask=undefined})
  checkTask=work;return work
 }
 async function setSharing(next:UpdateSharingContext){
  if(disposed)return
  const old=context,nextTrust=next.connection&&!next.revoked?fingerprint(next.connection):undefined
  context=next
  if(next.trustPending){changed();return}
  const changedTrust=(trust!==undefined&&trust!==nextTrust)||(ready&&ready.trust!==nextTrust)||next.revoked
  trust=nextTrust
  if(changedTrust){await invalidate('trust-changed')}
  if(context!==next)return
  if(old.connected&&!next.connected)connected=false
  connected=next.role==='host'?next.connected:connected&&!!nextTrust
  if(next.role==='host'&&!catalog&&o.catalog)try{catalog=await o.catalog()}catch{error='storage';phase='error'}
  changed()
  if(next.role==='member'&&nextTrust&&(!old.connection||old.connected!==next.connected))void check()
 }
 async function install(){
  if(installTask)return installTask
  const work=(async()=>{
   if(!ready||disposed||trust!==ready.trust||installing)return
   await check()
   const value=ready,g=generation;if(!value||trust!==value.trust||disposed)return
   const controller=new AbortController();abort=controller
   installing=true;phase='verifying';changed()
   try{
    await verify(value);if(!current(g)||ready!==value)return
    const outcome=await o.install({directory:join(o.root,value.directory),publication:value.publication,signal:controller.signal,onInstalling:()=>{phase='installing';changed()},current:()=>current(g)&&ready===value&&trust===value.trust})
    if(!current(g)||ready!==value)return
    if(outcome==='dirty'){explicit=true;phase='waiting';await persist()}else phase='installing'
   }catch{if(current(g)){phase='waiting';explicit=true;error=o.editingBlocked?.()?'shutdown':'install';await persist()}}
   finally{installing=false;changed()}
  })().finally(()=>{if(installTask===work)installTask=undefined})
  installTask=work;return work
 }
 async function download(){
  if(downloadTask||installing||disposed||!getState().canDownload)return downloadTask
  const g=generation,selected=publication!,c=context.connection!,controller=new AbortController();abort=controller
  const dir=randomUUID(),directory=join(o.root,dir)
  const work=(async()=>{
   phase='downloading';error=null;received=0;explicit=false;changed()
   try{
    await check();if(!current(g)||publication!==selected)return
    const space=await statfs(o.root),installerBytes=selected.manifest.files.find(f=>f.id==='installer')!.size
    if(space.bavail*space.bsize<selected.manifest.files.reduce((sum,file)=>sum+file.size,0)+installerBytes*2+64*1024*1024)throw Object.assign(Error('Insufficient update space'),{code:'ENOSPC'})
    await mkdir(directory,{mode:0o700})
    for(const file of selected.manifest.files){
     await (o.downloadFile??downloadUpdateFile)({...c,releaseId:selected.releaseId,file,destination:join(directory,file.name),signal:controller.signal,progress:bytes=>{if(current(g)&&file.id==='installer'){received=bytes;changed()}}})
     if(!current(g))return
    }
    phase='verifying';changed();await check();if(!current(g)||publication!==selected)return
    const value:Ready={schemaVersion:1,publication:selected,trust:trust!,directory:dir};await verify(value);if(!current(g))return
    ready=value;phase='waiting';await persist();if(!current(g)||ready!==value)return
    await install()
   }catch(e){if(current(g)){phase='error';const code=(e as {code?:string}).code;error=code==='INTEGRITY'?'integrity':['ENOSPC','EDQUOT','EACCES','EIO','EROFS'].includes(code??'')?'storage':'network';changed()}}
   finally{if(ready?.directory!==dir)await rm(directory,{recursive:true,force:true});changed()}
  })().finally(()=>{if(downloadTask===work)downloadTask=undefined})
  downloadTask=work;return work
 }
 async function hostCommand(command:'import'|'publish'|'withdraw'){
  if(context.role!=='host'||disposed||installing)throw Error('Host required')
  try{
   catalog??=await o.catalog?.();if(!catalog)throw Error('Catalog unavailable')
   if(command==='import'){if(importing)return;importing=true;changed();const path=await o.chooseBundle?.();if(path)await catalog.importBundle(path)}
   else if(command==='publish'){if(!context.connected)throw Error('Host stopped');await catalog.publish()}
   else await catalog.withdraw()
   error=null
  }catch(e){error=e instanceof UpdateHostMismatchError?'host-mismatch':command==='import'?'invalid-bundle':'storage'}finally{importing=false;changed()}
 }
 const timer=setInterval(()=>{void check()},300000);timer.unref()
 return {getState,check,setSharing,download,install,
  async recordAttempt(input:InstallInput,cacheFiles:string[]){
   if(cacheFiles.some(p=>!o.updaterCacheRoot||dirname(p)!==join(o.updaterCacheRoot,'pending')))throw Error('Unexpected updater cache path')
   await atomicUpdateRecord(join(o.root,'attempt.json'),{schemaVersion:1,id:randomUUID(),fromVersion:o.version,targetVersion:input.publication.manifest.version,releaseId:input.publication.releaseId,sha256:input.publication.manifest.files.find(f=>f.id==='installer')!.sha256,stage:'handoff',cacheFiles})
  },
  async confirmHealthyStartup(){
   // The entire best-effort cleanup is contained: the ready-UI caller intentionally does not await it.
   try{
    if(completedReady&&completedReady.publication.manifest.version===o.version){
     await rm(join(o.root,completedReady.directory),{recursive:true,force:true})
     await persist()
     // Retain the in-memory retry obligation until the durable ready record was removed too.
     completedReady=undefined
    }
    let attemptText:string|undefined
    try{attemptText=await readFile(join(o.root,'attempt.json'),'utf8')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    if(attemptText!==undefined){
     const attempt=JSON.parse(attemptText)
     if(attempt.schemaVersion!==1)throw Error('Invalid install attempt')
     if(attempt.targetVersion===o.version){
      if(!Array.isArray(attempt.cacheFiles))throw Error('Invalid install attempt')
      for(const path of attempt.cacheFiles){
       if(typeof path!=='string'||!o.updaterCacheRoot||dirname(path)!==join(o.updaterCacheRoot,'pending'))throw Error('Invalid cache path')
       try{if((await hashUpdateFile(path)).sha256===attempt.sha256)await rm(path,{force:true})}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
      }
      await atomicUpdateRecord(join(o.root,'attempt.json'),{...attempt,stage:'healthy',cacheFiles:[]})
     }
    }
    if(cleanupFailed){cleanupFailed=false;if(error==='storage')error=null;changed()}
   }catch{cleanupFailed=true;error='storage';changed()}
  },
  subscribe(listener:(s:UpdateState)=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}},
  importBundle:()=>hostCommand('import'),publish:()=>hostCommand('publish'),withdraw:()=>hostCommand('withdraw'),
  // Cancel only the transfer; authoritative status/trust observations remain
  // free to replace this publication while the old files are being removed.
  async cancel(){if(phase==='installing'||o.editingBlocked?.())return;await invalidate(null,true)},
  async retry(){await check();await download()},
  async dispose(){if(disposed)return;disposed=true;generation++;abort?.abort();checkAbort?.abort();clearInterval(timer);await Promise.allSettled([downloadTask,checkTask]);await io;listeners.clear()},
 }
}
export type UpdateService=Awaited<ReturnType<typeof createUpdateService>>
