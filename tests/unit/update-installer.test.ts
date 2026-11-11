import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createLoopbackFeed } from '../../src/main/updates/feed'
import { createInstallCoordinator, createMutationBarrier } from '../../src/main/updates/installer'
import type { UpdatePublication } from '../../src/shared/updates'
const cleanup:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f()})
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'planrail-installer-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}))
 const bytes=Buffer.from('MZ safe fake'),file={id:'installer' as const,name:'Planrail.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sha512:createHash('sha512').update(bytes).digest('base64')}
 await writeFile(join(directory,file.name),bytes)
 const publication={releaseId:'a'.repeat(64),manifest:{version:'0.8.0',files:[file]}} as UpdatePublication
 return {directory,publication}
}
it('loopback feed exposes only capability protected exact GET/HEAD paths',async()=>{
 const f=await fixture(),feed=await createLoopbackFeed(f);cleanup.push(()=>feed.close())
 expect(await (await fetch(feed.url+'latest.yml')).json()).toMatchObject({version:'0.8.0'})
 expect(await (await fetch(feed.url+'Planrail.exe')).text()).toBe('MZ safe fake')
 expect((await fetch(feed.url+'Planrail.exe',{method:'HEAD'})).status).toBe(200)
 expect((await fetch(feed.url+'Planrail.exe',{headers:{Origin:'https://evil.test'}})).status).toBe(403)
 expect((await fetch(feed.url+'../Planrail.exe')).status).toBe(404)
 expect((await fetch(feed.url+'Planrail.exe',{method:'POST'})).status).toBe(405)
})
it('dirty renderer defers without shutdown or installation',async()=>{
 const f=await fixture(),events:string[]=[],barrier=createMutationBarrier()
 const coordinator=createInstallCoordinator({barrier,prepare:async()=>({validate:async()=>{},handoff:()=>{events.push('install')},dispose:async()=>{}}),freezeRenderer:async()=>false,releaseRenderer:()=>{events.push('release')},record:async()=>{events.push('record')},shutdown:async()=>{events.push('close')}})
 expect(await coordinator.install({...f,current:()=>true})).toBe('dirty');expect(events).toEqual(['release']);expect(barrier.blocked()).toBe(false)
})
it('waits for accepted mutation completion and closes DB before installer handoff',async()=>{
 const f=await fixture(),events:string[]=[],barrier=createMutationBarrier();let finish!:()=>void
 const mutation=barrier.run(()=>new Promise<void>(resolve=>{finish=()=>{events.push('commit');resolve()}}))
 const coordinator=createInstallCoordinator({barrier,prepare:async()=>({validate:async()=>{},handoff:()=>{events.push('install')},dispose:async()=>{}}),freezeRenderer:async()=>true,releaseRenderer:()=>{},record:async()=>{events.push('record')},shutdown:async()=>{events.push('close')}})
 const installing=coordinator.install({...f,current:()=>true});await new Promise(r=>setTimeout(r,10))
 await expect(barrier.run(()=>{events.push('late')})).rejects.toThrow();expect(events).toEqual([])
 finish();await mutation;expect(await installing).toBe('installed');expect(events).toEqual(['commit','record','close','install'])
})
it('teardown failure never spawns installer and keeps editing blocked',async()=>{
 const f=await fixture(),events:string[]=[],barrier=createMutationBarrier()
 const coordinator=createInstallCoordinator({barrier,prepare:async()=>({validate:async()=>{},handoff:()=>{events.push('install')},dispose:async()=>{}}),freezeRenderer:async()=>true,releaseRenderer:()=>{events.push('release')},record:async()=>{},shutdown:async()=>{throw Error('close failed')}})
 await expect(coordinator.install({...f,current:()=>true})).rejects.toThrow('close failed');expect(events).toEqual([]);expect(barrier.blocked()).toBe(true)
})
it('observed trust change while preparing prevents installer handoff',async()=>{
 const f=await fixture(),barrier=createMutationBarrier();let current=true,installed=false
 const coordinator=createInstallCoordinator({barrier,prepare:async()=>{current=false;return {validate:async()=>{},handoff:()=>{installed=true},dispose:async()=>{}}},freezeRenderer:async()=>true,releaseRenderer:()=>{},record:async()=>{},shutdown:async()=>{}})
 await expect(coordinator.install({...f,current:()=>current})).rejects.toThrow();expect(installed).toBe(false);expect(barrier.blocked()).toBe(false)
})
it('adapter disables implicit install and rehashes cached installer before explicit handoff',async()=>{
 const {prepareUpdater}=await import('../../src/main/updates/installer'),f=await fixture(),events:string[]=[]
 const updater={autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:true,allowDowngrade:true,disableDifferentialDownload:false,disableWebInstaller:false,autoRunAppAfterInstall:false,
  setFeedURL:()=>{},checkForUpdates:async()=>{},downloadUpdate:async()=>[join(f.directory,'Planrail.exe')],quitAndInstall:(silent:boolean,relaunch:boolean)=>{events.push(`${silent}:${relaunch}`)}}
 const prepared=await prepareUpdater({...f,current:()=>true},updater);cleanup.push(()=>prepared.dispose())
 expect(updater).toMatchObject({autoDownload:false,autoInstallOnAppQuit:false,allowPrerelease:false,allowDowngrade:false,disableDifferentialDownload:true,disableWebInstaller:true});expect(events).toEqual([])
 await writeFile(join(f.directory,'Planrail.exe'),'tampered');await expect(prepared.validate()).rejects.toThrow()
})
it('permission denied direct spawn never retries with elevation or shell',async()=>{
 const {launchPerUserInstaller}=await import('../../src/main/updates/installer'),{EventEmitter}=await import('node:events');const calls:unknown[]=[]
 await expect(launchPerUserInstaller('C:\\Users\\member\\cache\\Planrail.exe',(file,args,options)=>{
  calls.push({file,args,options});const child=new EventEmitter();queueMicrotask(()=>child.emit('error',Object.assign(Error('denied'),{code:'EACCES'})));return child as any
 })).rejects.toMatchObject({code:'EACCES'})
 expect(calls).toEqual([{file:'C:\\Users\\member\\cache\\Planrail.exe',args:['--updated','/S','--force-run'],options:{detached:true,stdio:'ignore',shell:false}}])
})
it('changed installer bytes during teardown are rejected before launch',async()=>{
 const f=await fixture(),barrier=createMutationBarrier();let changed=false,installed=false
 const coordinator=createInstallCoordinator({barrier,prepare:async()=>({validate:async()=>{if(changed)throw Error('cache changed')},handoff:()=>{installed=true},dispose:async()=>{}}),freezeRenderer:async()=>true,releaseRenderer:()=>{},record:async()=>{},shutdown:async()=>{changed=true}})
 await expect(coordinator.install({...f,current:()=>true})).rejects.toThrow('cache changed');expect(installed).toBe(false)
})
it('serves the exact noCache metadata URL produced by pinned updater6.8.11',async()=>{
 const {createRequire}=await import('node:module'),{newUrlFromBase}=createRequire(import.meta.url)('electron-updater/out/util')
 const f=await fixture(),feed=await createLoopbackFeed(f);cleanup.push(()=>feed.close())
 const response=await fetch(newUrlFromBase('latest.yml',new URL(feed.url),true));expect(response.status).toBe(200)
 expect((await fetch(feed.url+'latest.yml?redirect=https://evil.test')).status).toBe(404)
})
it('cancellation closes the internal feed before updater preparation can complete',async()=>{
 const {prepareUpdater}=await import('../../src/main/updates/installer'),f=await fixture(),controller=new AbortController();let feedUrl='',release!:()=>void,started!:()=>void
 const gate=new Promise<void>(r=>{release=r}),start=new Promise<void>(r=>{started=r})
 const updater={autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:true,allowDowngrade:true,disableDifferentialDownload:false,disableWebInstaller:false,autoRunAppAfterInstall:false,
  setFeedURL:(v:{url:string})=>{feedUrl=v.url},checkForUpdates:async()=>{started();await gate;await fetch(feedUrl+'latest.yml')},downloadUpdate:async()=>[join(f.directory,'Planrail.exe')],quitAndInstall:()=>{}}
 const preparing=prepareUpdater({...f,current:()=>!controller.signal.aborted,signal:controller.signal},updater)
 await start;controller.abort();release();await expect(preparing).rejects.toThrow()
})
