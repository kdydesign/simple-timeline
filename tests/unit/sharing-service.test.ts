import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createSyncController} from '../../src/main/sharing/sync'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'
import type {PollOutcome} from '../../src/main/sharing/client'
afterEach(()=>vi.useRealTimers())
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
const snapshot={kind:'snapshot',snapshot:{protocolVersion:1,hostId:'host',datasetId:'dataset',projects:[],schedules:[]},etag:'etag'} as PollOutcome
it('serializes manual forced fetch behind normal poll and publishes ETag only after cache commit',async()=>{
 vi.useFakeTimers();const first=deferred<PollOutcome>(),second=deferred<PollOutcome>();const calls:any[]=[];const applied:any[]=[]
 const sync=createSyncController({poll:async(o)=>{calls.push(o);return calls.length===1?first.promise:second.promise},apply:o=>applied.push(o),state:()=>{},now:()=>Date.now()})
 const normal=sync.refresh();const forced=sync.refresh(true);expect(calls.length).toBe(1)
 first.resolve(snapshot);await normal;await Promise.resolve();expect(calls.length).toBe(2);expect(calls[1].force).toBe(true);expect(calls[1].etag).toBe('etag')
 second.resolve({kind:'unchanged'});await forced;expect(applied.length).toBe(1);expect(sync.fresh()).toBe(true);sync.stop()
})
it('does not retain ETag after failed commit; timeout fences an unabortable response and follows 2/4/8 backoff',async()=>{
 vi.useFakeTimers();const late=deferred<PollOutcome>();const calls:any[]=[];const states:string[]=[];let commits=0
 const sync=createSyncController({poll:async(o)=>{calls.push(o);if(calls.length===1)return snapshot;if(calls.length===2)return late.promise;throw Error('offline')},apply:()=>{commits++;throw Error('disk')},state:s=>states.push(s),now:()=>Date.now()})
 await sync.refresh();expect(sync.fresh()).toBe(false)
 await vi.advanceTimersByTimeAsync(2000);expect(calls[1].etag).toBeUndefined()
 await vi.advanceTimersByTimeAsync(5000);late.resolve(snapshot);await Promise.resolve();expect(commits).toBe(1)
 await vi.advanceTimersByTimeAsync(3999);expect(calls.length).toBe(2)
 await vi.advanceTimersByTimeAsync(1);expect(calls.length).toBe(3)
 await vi.advanceTimersByTimeAsync(8000);expect(calls.length).toBe(4);expect(states).toContain('disconnected');sync.stop()
})
it('disconnect/resume epochs reject late completions and 304 cannot establish a first cache',async()=>{
 vi.useFakeTimers();const late=deferred<PollOutcome>();let count=0
 const sync=createSyncController({poll:()=>late.promise,apply:()=>{count++},state:()=>{},now:()=>Date.now()})
 const pending=sync.refresh();sync.stop();late.resolve(snapshot);await pending;expect(count).toBe(0);expect(sync.fresh()).toBe(false)
 const empty=createSyncController({poll:async()=>({kind:'unchanged'}),apply:()=>{},state:()=>{}})
 await empty.refresh();expect(empty.fresh()).toBe(false);empty.stop()
})
it('freshness expires at seven seconds and failed authorization never returns true',async()=>{
 vi.useFakeTimers();let succeed=true
 const sync=createSyncController({poll:async()=>{if(succeed)return snapshot;throw Error('offline')},apply:()=>{},state:()=>{},now:()=>Date.now()})
 await sync.refresh();expect(sync.fresh()).toBe(true);succeed=false
 await vi.advanceTimersByTimeAsync(7000);expect(sync.fresh()).toBe(false);expect(await sync.authorize()).toBe(false);sync.stop()
})
it('protected storage is lazy, atomic and fences delayed encryption before file writes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'planrail-secrets-'));const encrypted=deferred<Buffer>();let checks=0,live=true
 const vault={isAsyncEncryptionAvailable:async()=>{checks++;return true},getSelectedStorageBackend:()=> 'kwallet' as const,encryptStringAsync:()=>encrypted.promise,decryptStringAsync:async()=>({result:'{}',shouldReEncrypt:false})}
 const secrets=createProtectedSecrets(dir,vault);expect(checks).toBe(0)
 const ref='1'.repeat(32);const save=secrets.write(ref,{token:'secret'},()=>live);await Promise.resolve();live=false;encrypted.resolve(Buffer.from('encrypted'))
 await expect(save).rejects.toThrow();expect(existsSync(join(dir,'sharing-secrets',ref))).toBe(false);rmSync(dir,{recursive:true,force:true})
})
it('refuses unavailable OS protection without writing plaintext',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'planrail-secrets-'));const secrets=createProtectedSecrets(dir,{isAsyncEncryptionAvailable:async()=>false,getSelectedStorageBackend:()=> 'basic_text',encryptStringAsync:async()=>Buffer.from('plain'),decryptStringAsync:async()=>({result:'{}',shouldReEncrypt:false})})
 await expect(secrets.write('2'.repeat(32),{token:'secret'},()=>true)).rejects.toThrow();expect(existsSync(join(dir,'sharing-secrets'))).toBe(false);rmSync(dir,{recursive:true,force:true})
})
