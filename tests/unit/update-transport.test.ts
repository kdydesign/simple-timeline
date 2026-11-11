import { afterEach, beforeAll, expect, it } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createHostIdentity, type HostIdentity } from '../../src/main/sharing/identity'
import { createSharingHost, hashCredential, type HostStore } from '../../src/main/sharing/host'
import { createUpdateRoutes, downloadUpdateFile, readUpdateStatus } from '../../src/main/updates/transport'
import type { UpdateFile } from '../../src/shared/updates'
const hostId='11111111-1111-4111-8111-111111111111', token='a'.repeat(64), releaseId='b'.repeat(64)
let identity:HostIdentity
const cleanup:(()=>Promise<unknown>)[]=[]
beforeAll(async()=>{identity=await createHostIdentity(hostId)})
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f()})
async function fixture(delay=0,leaseDelay=0){
 const bytes=Buffer.from('installer bytes'), file:UpdateFile={id:'installer',name:'Planrail.exe',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sha512:createHash('sha512').update(bytes).digest('base64')}
 const device={id:'device',ip:'127.0.0.1',name:'Member',approved:true,revoked:false}
 const store={getConfig:()=>({hostId,datasetId:hostId}),listDevices:()=>[device],getDevice:()=>device,revokePendingCredentials:()=>{},findCredential:(hash:string)=>hash===hashCredential(token)?{deviceId:'device',status:'active'}:undefined} as unknown as HostStore
 const routes=createUpdateRoutes({wireStatus:()=>({protocolVersion:1,hostId,revision:1,publication:{releaseId,manifest:{files:[file]}}} as any),readFile:async()=>{if(leaseDelay)await new Promise(r=>setTimeout(r,leaseDelay));return {file,stream:Readable.from((async function*(){yield bytes.subarray(0,1);if(delay)await new Promise(r=>setTimeout(r,delay));yield bytes.subarray(1)})()),release:()=>{}}}})
 const host=createSharingHost({identity,store,updates:routes});const address=await host.start('127.0.0.1',0);cleanup.push(()=>host.stop())
 const root=await mkdtemp(join(tmpdir(),'planrail-update-tls-'));cleanup.push(()=>rm(root,{recursive:true,force:true}))
 return {root,file,device,connection:{address,trust:identity,token},host}
}
it('authenticated update bytes continue past the unchanged five second sync deadline',async()=>{
 const f=await fixture(5200), destination=join(f.root,'installer.part')
 await downloadUpdateFile({...f.connection,releaseId,file:f.file,destination})
 expect(await readFile(destination,'utf8')).toBe('installer bytes')
 expect(await readUpdateStatus(f.connection)).toMatchObject({hostId,publication:{releaseId}})
},10000)
it('rejects wrong token, source IP and pin before accepting bytes',async()=>{
 const f=await fixture()
 await expect(readUpdateStatus({...f.connection,token:'c'.repeat(64)})).rejects.toMatchObject({code:'UNAUTHORIZED'})
 await expect(readUpdateStatus({...f.connection,localAddress:'127.0.0.2'})).rejects.toMatchObject({code:'UNAUTHORIZED'})
 await expect(readUpdateStatus({...f.connection,trust:{...identity,pin:'d'.repeat(64)}})).rejects.toMatchObject({code:'TLS_UNTRUSTED'})
 f.device.revoked=true
 await expect(readUpdateStatus(f.connection)).rejects.toMatchObject({code:'REVOKED'})
})
it('removes incomplete files when integrity fails',async()=>{
 const f=await fixture(),destination=join(f.root,'bad.part')
 await expect(downloadUpdateFile({...f.connection,releaseId,file:{...f.file,sha256:'0'.repeat(64)},destination})).rejects.toMatchObject({code:'INTEGRITY'})
 await expect(readFile(destination)).rejects.toMatchObject({code:'ENOENT'})
})
it('limits each device to one stream while keeping status reachable',async()=>{
 const f=await fixture(200),first=downloadUpdateFile({...f.connection,releaseId,file:f.file,destination:join(f.root,'first.part')})
 await new Promise(r=>setTimeout(r,40))
 await expect(downloadUpdateFile({...f.connection,releaseId,file:f.file,destination:join(f.root,'second.part')})).rejects.toMatchObject({code:'RATE_LIMITED'})
 expect(await readUpdateStatus(f.connection)).toMatchObject({hostId})
 await first
})
it('revocation during a stream rejects later bytes and removes the partial file',async()=>{
 const f=await fixture(100),destination=join(f.root,'revoked.part')
 const transfer=downloadUpdateFile({...f.connection,releaseId,file:f.file,destination,progress:()=>{f.device.revoked=true}})
 await expect(transfer).rejects.toThrow();await expect(readFile(destination)).rejects.toMatchObject({code:'ENOENT'})
})

it('sends bounded file headers before a large catalog integrity read completes',async()=>{
 const f=await fixture(0,5200),destination=join(f.root,'slow-hash.part')
 await downloadUpdateFile({...f.connection,releaseId,file:f.file,destination})
 expect(await readFile(destination,'utf8')).toBe('installer bytes')
},10000)
