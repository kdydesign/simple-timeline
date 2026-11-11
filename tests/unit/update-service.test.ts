import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createUpdateService, type UpdateSharingContext } from '../../src/main/updates/service'
import type { UpdatePublication, UpdateStatus } from '../../src/shared/updates'
const roots:string[]=[];const services:Awaited<ReturnType<typeof createUpdateService>>[]=[]
afterEach(async()=>{for(const s of services.splice(0))await s.dispose();for(const r of roots.splice(0))await rm(r,{recursive:true,force:true})})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'planrail-update-state-'));roots.push(root)
 const contents=new Map([['installer',Buffer.from('MZ fake')],['metadata',Buffer.from('metadata')],['blockmap',Buffer.from('blockmap')]])
 const publication:UpdatePublication={protocolVersion:1,hostId:'host',revision:1,publicationId:'11111111-1111-4111-8111-111111111111',releaseId:'a'.repeat(64),manifest:{schemaVersion:1,appId:'com.kdydesign.simpletimeline',version:'0.8.0',sourceSha:'a'.repeat(40),platform:'win32',arch:'x64',installerType:'nsis',installScope:'per-user',signed:false,validationUpdateOnly:false,files:[...contents].map(([id,b])=>({id:id as 'installer'|'metadata'|'blockmap',name:id==='installer'?'Planrail.exe':id==='metadata'?'latest.yml':'Planrail.exe.blockmap',size:b.length,sha256:createHash('sha256').update(b).digest('hex'),sha512:createHash('sha512').update(b).digest('base64')}))}}
 let status:UpdateStatus={protocolVersion:1,hostId:'host',revision:1,publication},offline=false,dirty=false,installed=0,hold:Promise<void>|undefined
 const context:UpdateSharingContext={role:'member',connected:true,connection:{address:{address:'127.0.0.1',port:1234},trust:{hostId:'host',serverName:'host',certificate:'private main only',pin:'pin'},token:'secret'}}
 const options={root,version:'0.7.0',readStatus:async()=>{if(offline)throw Error('offline');return structuredClone(status)},downloadFile:async(o:any)=>{if(hold)await hold;await writeFile(o.destination,contents.get(o.file.id)!);o.progress?.(o.file.size)},install:async()=>{if(dirty)return 'dirty' as const;installed++;return 'installed' as const}}
 const service=await createUpdateService(options);services.push(service);await service.setSharing(context);await service.check()
 return {root,service,context,options,publication,setStatus:(v:UpdateStatus)=>{status=v},setOffline:()=>{offline=true},setDirty:()=>{dirty=true},installed:()=>installed,hold:(v:Promise<void>)=>{hold=v}}
}
it('downloads only on click and clean completion installs once',async()=>{
 const f=await fixture();expect(f.service.getState()).toMatchObject({phase:'available',canDownload:true});expect(await readdir(f.root)).toEqual([])
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
