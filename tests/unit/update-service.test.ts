import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readdir, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createUpdateService, type UpdateSharingContext } from '../../src/main/updates/service'
import { createInstallCoordinator, createMutationBarrier } from '../../src/main/updates/installer'
import type { UpdatePublication, UpdateStatus } from '../../src/shared/updates'
const fsFaults=vi.hoisted(()=>({removePath:null as string|null,removeWaitPath:null as string|null,removeWait:null as Promise<void>|null,removeStarted:null as (()=>void)|null,renamePath:null as string|null,renameWaitPath:null as string|null,renameWait:null as Promise<void>|null,renameStarted:null as (()=>void)|null}))
vi.mock('node:fs/promises',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:fs/promises')>()
 return {...actual,
  rm:async(...args:Parameters<typeof actual.rm>)=>{if(String(args[0])===fsFaults.removeWaitPath){fsFaults.removeStarted?.();await fsFaults.removeWait}if(String(args[0])===fsFaults.removePath)throw Object.assign(Error('file locked'),{code:'EPERM'});return actual.rm(...args)},
  rename:async(...args:Parameters<typeof actual.rename>)=>{if(String(args[1])===fsFaults.renameWaitPath){fsFaults.renameStarted?.();await fsFaults.renameWait}if(String(args[1])===fsFaults.renamePath)throw Object.assign(Error('rename denied'),{code:'EACCES'});return actual.rename(...args)},
 }
})
const roots:string[]=[];const services:Awaited<ReturnType<typeof createUpdateService>>[]=[]
afterEach(async()=>{fsFaults.removePath=null;fsFaults.removeWaitPath=null;fsFaults.removeWait=null;fsFaults.removeStarted=null;fsFaults.renamePath=null;fsFaults.renameWaitPath=null;fsFaults.renameWait=null;fsFaults.renameStarted=null;for(const s of services.splice(0))await s.dispose();for(const r of roots.splice(0))await rm(r,{recursive:true,force:true})})
async function fixture(initialRevision=1){
 const root=await mkdtemp(join(tmpdir(),'planrail-update-state-'));roots.push(root)
 const contents=new Map([['installer',Buffer.from('MZ fake')],['metadata',Buffer.from('metadata')],['blockmap',Buffer.from('blockmap')]])
 const publication:UpdatePublication={protocolVersion:1,hostId:'host',revision:initialRevision,publicationId:'11111111-1111-4111-8111-111111111111',releaseId:'a'.repeat(64),manifest:{schemaVersion:1,appId:'com.kdydesign.simpletimeline',version:'0.8.0',sourceSha:'a'.repeat(40),platform:'win32',arch:'x64',installerType:'nsis',installScope:'per-user',signed:false,validationUpdateOnly:false,files:[...contents].map(([id,b])=>({id:id as 'installer'|'metadata'|'blockmap',name:id==='installer'?'Planrail.exe':id==='metadata'?'latest.yml':'Planrail.exe.blockmap',size:b.length,sha256:createHash('sha256').update(b).digest('hex'),sha512:createHash('sha512').update(b).digest('base64')}))}}
 let status:UpdateStatus={protocolVersion:1,hostId:'host',revision:initialRevision,publication},offline=false,dirty=false,installed=0,downloads=0,hold:Promise<void>|undefined
 const context:UpdateSharingContext={role:'member',connected:true,connection:{address:{address:'127.0.0.1',port:1234},trust:{hostId:'host',serverName:'host',certificate:'private main only',pin:'pin'},token:'secret'}}
 const options={root,version:'0.7.0',readStatus:async()=>{if(offline)throw Error('offline');return structuredClone(status)},downloadFile:async(o:any)=>{downloads++;if(hold)await hold;await writeFile(o.destination,contents.get(o.file.id)!);o.progress?.(o.file.size)},install:async()=>{if(dirty)return 'dirty' as const;installed++;return 'installed' as const}}
 const service=await createUpdateService(options);services.push(service);await service.setSharing(context);await service.check()
 return {root,service,context,options,publication,setStatus:(v:UpdateStatus)=>{status=v},setOffline:()=>{offline=true},setDirty:()=>{dirty=true},installed:()=>installed,downloads:()=>downloads,hold:(v:Promise<void>)=>{hold=v}}
}
it('downloads only on click and clean completion installs once',async()=>{
 const f=await fixture();expect(f.service.getState()).toMatchObject({phase:'available',canDownload:true});expect(f.downloads()).toBe(0)
 await f.service.download();expect(f.installed()).toBe(1)
 expect(JSON.stringify(f.service.getState())).not.toMatch(/secret|private main only|127\.0\.0\.1/)
})
it('dirty deferral persists and never auto-installs on later check or ordinary Exit',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();expect(f.service.getState()).toMatchObject({phase:'waiting',requiresExplicitInstall:true,canInstall:true})
 await f.service.check();await f.service.dispose();expect(f.installed()).toBe(0)
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing(f.context);await restored.check();expect(restored.getState()).toMatchObject({phase:'waiting',requiresExplicitInstall:true});expect(f.installed()).toBe(0)
})
it('permits explicit offline install after revalidation with unchanged local trust',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose();f.setOffline()
 let installed=0;const restored=await createUpdateService({...f.options,install:async()=>{installed++;return 'installed' as const}});services.push(restored)
 await restored.setSharing({...f.context,connected:false});await restored.install();expect(installed).toBe(1)
})
it('credential replacement invalidates late completed downloads',async()=>{
 const f=await fixture();let release!:()=>void;f.hold(new Promise<void>(resolve=>{release=resolve}))
 const download=f.service.download();await new Promise(r=>setTimeout(r,10));await f.service.setSharing({...f.context,connection:{...f.context.connection!,token:'replacement'}});release();await download
 expect(f.installed()).toBe(0);expect(f.service.getState().canInstall).toBe(false)
})
it('observed withdrawal cancels ready state and replacement requires another click',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();f.setStatus({protocolVersion:1,hostId:'host',revision:2,publication:null});await f.service.check()
 expect(f.service.getState()).toMatchObject({canInstall:false,error:'withdrawn'})
 f.setStatus({protocolVersion:1,hostId:'host',revision:3,publication:{...f.publication,revision:3,publicationId:'22222222-2222-4222-8222-222222222222'}});await f.service.check()
 expect(f.service.getState()).toMatchObject({phase:'available',canDownload:true});expect(f.installed()).toBe(0)
})
it('host revocation while verified waiting makes offline install impossible',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.setSharing({...f.context,revoked:true});f.setOffline();await f.service.install()
 expect(f.installed()).toBe(0);expect(f.service.getState()).toMatchObject({canInstall:false,error:'trust-changed'})
})
it('healthy target startup alone permits staged-file cleanup',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 const restored=await createUpdateService({...f.options,version:'0.8.0'});services.push(restored)
 expect((await readdir(f.root)).some(n=>/^[a-f0-9-]{36}$/.test(n))).toBe(true)
 await restored.confirmHealthyStartup()
 expect((await readdir(f.root)).some(n=>/^[a-f0-9-]{36}$/.test(n))).toBe(false)
})
it('a malformed authenticated status is not an offline-install permission',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();f.setStatus({protocolVersion:99} as any);await f.service.install()
 expect(f.installed()).toBe(0);expect(f.service.getState().canInstall).toBe(false)
})
it('pending credential loading preserves a restart-ready file without allowing installation',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing({role:'member',connected:false,trustPending:true})
 expect(restored.getState()).toMatchObject({canInstall:false,phase:'waiting'})
 await restored.setSharing(f.context);expect(restored.getState().canInstall).toBe(true)
})
it('a restart at the old version reports an incomplete handoff and requires explicit install',async()=>{
 const f=await fixture();f.setDirty();await f.service.download()
 await f.service.recordAttempt({publication:f.publication,directory:'unused',current:()=>true},[]);await f.service.dispose()
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing(f.context)
 expect(restored.getState()).toMatchObject({phase:'waiting',requiresExplicitInstall:true,error:'install'});expect(f.installed()).toBe(0)
})
it('cancel during installer preparation invalidates the attempt before handoff',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 let started!:()=>void,finish!:()=>void,currentAfterCancel=true
 const startedPromise=new Promise<void>(r=>{started=r}),gate=new Promise<void>(r=>{finish=r})
 const restored=await createUpdateService({...f.options,install:async(input)=>{started();await gate;currentAfterCancel=input.current();return 'dirty' as const}});services.push(restored);await restored.setSharing(f.context)
 const installing=restored.install();await startedPromise;await restored.cancel();finish();await installing
 expect(currentAfterCancel).toBe(false);expect(restored.getState().canInstall).toBe(false)
})
it.each(['withdrawal','replacement','trust change'] as const)('cancel cleanup cannot overwrite %s observed during stage deletion',async transition=>{
 const f=await fixture();f.setDirty();await f.service.download()
 const record=JSON.parse(await readFile(join(f.root,'ready.json'),'utf8'))
 let started!:()=>void,finish!:()=>void
 const deleting=new Promise<void>(resolve=>{started=resolve}),gate=new Promise<void>(resolve=>{finish=resolve})
 fsFaults.removeWaitPath=join(f.root,record.directory);fsFaults.removeWait=gate;fsFaults.removeStarted=started
 const canceling=f.service.cancel();await deleting
 try{
  if(transition==='trust change')await f.service.setSharing({...f.context,revoked:true})
  else{f.setStatus({protocolVersion:1,hostId:'host',revision:2,publication:transition==='withdrawal'?null:{...f.publication,revision:2,publicationId:'22222222-2222-4222-8222-222222222222',manifest:{...f.publication.manifest,version:'0.9.0'}}});await f.service.check()}
 }finally{finish();await canceling}
 expect(f.service.getState()).toMatchObject(transition==='replacement'?{phase:'available',version:'0.9.0',canDownload:true,canInstall:false}:{version:null,canDownload:false,canInstall:false})
 expect(f.installed()).toBe(0)
})
it('withdrawal during ready-record deletion cannot be resurrected by cancel completion',async()=>{
 const f=await fixture();f.setDirty();await f.service.download()
 let started!:()=>void,finish!:()=>void
 const deleting=new Promise<void>(resolve=>{started=resolve}),gate=new Promise<void>(resolve=>{finish=resolve})
 fsFaults.removeWaitPath=join(f.root,'ready.json');fsFaults.removeWait=gate;fsFaults.removeStarted=started
 const canceling=f.service.cancel();await deleting
 f.setStatus({protocolVersion:1,hostId:'host',revision:2,publication:null});const checking=f.service.check()
 try{await Promise.resolve()}finally{finish();await Promise.all([canceling,checking])}
 expect(f.service.getState()).toMatchObject({version:null,canDownload:false,canInstall:false})
})
it('checks authenticated update status with active credentials even when snapshot sharing is disconnected',async()=>{
 const f=await fixture();await f.service.dispose()
 const independent=await createUpdateService(f.options);services.push(independent)
 await independent.setSharing({...f.context,connected:false});await independent.check()
 expect(independent.getState()).toMatchObject({phase:'available',connected:true,canDownload:true})
})
it('reports disk write failure and removes the incomplete staged directory',async()=>{
 const f=await fixture();await f.service.dispose()
 const failed=await createUpdateService({...f.options,downloadFile:async()=>{throw Object.assign(Error('full'),{code:'ENOSPC'})}});services.push(failed)
 await failed.setSharing(f.context);await failed.check();await failed.download()
 expect(failed.getState()).toMatchObject({phase:'error',error:'storage',canInstall:false})
 expect((await readdir(f.root)).some(n=>/^[a-f0-9-]{36}$/.test(n))).toBe(false)
})

it('restores the revision floor from verified ready state before accepting status',async()=>{
 const f=await fixture(10);f.setDirty();await f.service.download();await f.service.dispose()
 await rm(join(f.root,'observed.json'),{force:true}) // Upgrade from a ready record predating the observation file.
 f.setStatus({protocolVersion:1,hostId:'host',revision:9,publication:{...f.publication,revision:9,publicationId:'22222222-2222-4222-8222-222222222222'}})
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing(f.context);await restored.check()
 expect(restored.getState()).toMatchObject({error:'integrity',canDownload:false,canInstall:false});expect(f.installed()).toBe(0)
})
it('persists an observed withdrawal revision across restart and rejects an older publication',async()=>{
 const f=await fixture(10);f.setStatus({protocolVersion:1,hostId:'host',revision:11,publication:null});await f.service.check();await f.service.dispose()
 f.setStatus({protocolVersion:1,hostId:'host',revision:10,publication:f.publication})
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing(f.context);await restored.check()
 expect(restored.getState()).toMatchObject({error:'integrity',canDownload:false,canInstall:false})
})
it('persists the highest observed revision even before download is selected',async()=>{
 const f=await fixture(10);await f.service.dispose()
 f.setStatus({protocolVersion:1,hostId:'host',revision:9,publication:{...f.publication,revision:9}})
 const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing(f.context);await restored.check()
 expect(restored.getState()).toMatchObject({error:'integrity',canDownload:false})
})
it('binds persisted revision floors to trust and retains the original floor after credential changes',async()=>{
 const f=await fixture(10);await f.service.dispose()
 f.setStatus({protocolVersion:1,hostId:'host',revision:1,publication:{...f.publication,revision:1}})
 const restored=await createUpdateService(f.options);services.push(restored)
 await restored.setSharing({...f.context,connection:{...f.context.connection!,token:'new approved credential'}});await restored.check()
 expect(restored.getState()).toMatchObject({phase:'available',canDownload:true})
 await restored.setSharing(f.context);await restored.check()
 expect(restored.getState()).toMatchObject({error:'integrity',canDownload:false,canInstall:false})
})

it('surfaces locked stage cleanup without rejection and preserves the retry record',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 const stage=(await readdir(f.root)).find(name=>/^[a-f0-9-]{36}$/.test(name))!
 const restored=await createUpdateService({...f.options,version:'0.8.0'});services.push(restored)
 fsFaults.removePath=join(f.root,stage)
 await expect(restored.confirmHealthyStartup()).resolves.toBeUndefined()
 expect(restored.getState().error).toBe('storage');expect(JSON.parse(await readFile(join(f.root,'ready.json'),'utf8')).directory).toBe(stage)
 fsFaults.removePath=null;await restored.confirmHealthyStartup()
 await expect(readFile(join(f.root,'ready.json'))).rejects.toMatchObject({code:'ENOENT'})
 expect((await readdir(f.root)).includes(stage)).toBe(false)
})
it('retries ready-record persistence after staged files were already removed',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 const restored=await createUpdateService({...f.options,version:'0.8.0'});services.push(restored)
 fsFaults.removePath=join(f.root,'ready.json')
 await expect(restored.confirmHealthyStartup()).resolves.toBeUndefined()
 expect(restored.getState().error).toBe('storage');expect(await readFile(join(f.root,'ready.json'),'utf8')).toContain('directory')
 fsFaults.removePath=null;await restored.confirmHealthyStartup()
 await expect(readFile(join(f.root,'ready.json'))).rejects.toMatchObject({code:'ENOENT'})
})
it('retains a cleanup attempt when its final healthy record cannot be persisted',async()=>{
 const f=await fixture();f.setDirty();await f.service.download();await f.service.dispose()
 const stage=(await readdir(f.root)).find(name=>/^[a-f0-9-]{36}$/.test(name))!,cacheRoot=join(f.root,'updater-cache'),cached=join(cacheRoot,'pending','Planrail.exe')
 await mkdir(join(cacheRoot,'pending'),{recursive:true});await writeFile(cached,await readFile(join(f.root,stage,'Planrail.exe')))
 const restored=await createUpdateService({...f.options,version:'0.8.0',updaterCacheRoot:cacheRoot});services.push(restored)
 await restored.recordAttempt({publication:f.publication,directory:'unused',current:()=>true},[cached])
 fsFaults.renamePath=join(f.root,'attempt.json')
 await expect(restored.confirmHealthyStartup()).resolves.toBeUndefined()
 expect(restored.getState().error).toBe('storage');expect(JSON.parse(await readFile(join(f.root,'attempt.json'),'utf8'))).toMatchObject({stage:'handoff',cacheFiles:[cached]})
 fsFaults.renamePath=null;await restored.confirmHealthyStartup()
 expect(JSON.parse(await readFile(join(f.root,'attempt.json'),'utf8'))).toMatchObject({stage:'healthy',cacheFiles:[]})
})
it('does not revive an older ready record left behind after a persisted withdrawal',async()=>{
 const f=await fixture(10);f.setDirty();await f.service.download()
 const record=await readFile(join(f.root,'ready.json'),'utf8'),ready=JSON.parse(record),stage=join(f.root,ready.directory)
 const files=await Promise.all(f.publication.manifest.files.map(async file=>({name:file.name,bytes:await readFile(join(stage,file.name))})))
 f.setStatus({protocolVersion:1,hostId:'host',revision:11,publication:null});await f.service.check();await f.service.dispose()
 // Simulate a crash after observation commit but before ready/cache invalidation.
 await mkdir(stage,{recursive:true});for(const file of files)await writeFile(join(stage,file.name),file.bytes);await writeFile(join(f.root,'ready.json'),record)
 f.setOffline();const restored=await createUpdateService(f.options);services.push(restored);await restored.setSharing({...f.context,connected:false});await restored.install()
 expect(restored.getState().canInstall).toBe(false);expect(f.installed()).toBe(0)
})
it('does not expose a new publication when its revision cannot be persisted',async()=>{
 const f=await fixture(10)
 f.setStatus({protocolVersion:1,hostId:'host',revision:11,publication:{...f.publication,revision:11,publicationId:'22222222-2222-4222-8222-222222222222'}})
 fsFaults.renamePath=join(f.root,'observed.json');await f.service.check()
 expect(f.service.getState()).toMatchObject({error:'storage',canDownload:false,canInstall:false})
})

it.each(['withdrawal','replacement'] as const)('fences %s synchronously while observation persistence is stalled',async transition=>{
 const f=await fixture(10);f.setDirty();await f.service.download();await f.service.dispose()
 let prepareStarted!:()=>void,finishPrepare!:()=>void,observationStarted!:()=>void,finishObservation!:()=>void
 const preparing=new Promise<void>(resolve=>{prepareStarted=resolve}),prepareGate=new Promise<void>(resolve=>{finishPrepare=resolve})
 const observing=new Promise<void>(resolve=>{observationStarted=resolve}),observationGate=new Promise<void>(resolve=>{finishObservation=resolve})
 let handoffs=0,freezes=0;const barrier=createMutationBarrier()
 const coordinator=createInstallCoordinator({barrier,
  prepare:async()=>{prepareStarted();await prepareGate;return {validate:async()=>{},handoff:()=>{handoffs++},dispose:async()=>{}}},
  freezeRenderer:async()=>{freezes++;return true},releaseRenderer:()=>{},record:async()=>{},shutdown:async()=>{},
 })
 const restored=await createUpdateService({...f.options,install:input=>coordinator.install(input),editingBlocked:()=>barrier.blocked()});services.push(restored)
 await restored.setSharing(f.context);await restored.check()
 const installing=restored.install();await preparing
 f.setStatus({protocolVersion:1,hostId:'host',revision:11,publication:transition==='withdrawal'?null:{...f.publication,revision:11,publicationId:'22222222-2222-4222-8222-222222222222'}})
 fsFaults.renameWaitPath=join(f.root,'observed.json');fsFaults.renameWait=observationGate;fsFaults.renameStarted=observationStarted
 const checking=restored.check();await observing
 try{
  finishPrepare();await installing
  expect(handoffs).toBe(0);expect(freezes).toBe(0)
  expect(restored.getState()).toMatchObject({canInstall:false,canDownload:false})
 }finally{finishObservation();await checking}
 expect(restored.getState()).toMatchObject(transition==='withdrawal'?{error:'withdrawn',canDownload:false}:{phase:'available',canDownload:true})
})
