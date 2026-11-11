// Test-entry only: real service, TLS, catalog, IPC and guard; no installer can execute.
import {ipcMain,type BrowserWindow} from 'electron'
import {join} from 'node:path'
import {mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createHostIdentity} from '../../src/main/sharing/identity'
import {createSharingHost,hashCredential,type HostStore} from '../../src/main/sharing/host'
import {createUpdateRoutes,type UpdateConnection} from '../../src/main/updates/transport'
import {UpdateCatalog} from '../../src/main/updates/catalog'
import {createUpdateService,type UpdateService} from '../../src/main/updates/service'
import {createInstallCoordinator,createMutationBarrier} from '../../src/main/updates/installer'
import {registerUpdateIpc} from '../../src/main/updates/ipc'
import {updatesChannel,updatesGuardReply} from '../../src/shared/updates'
import {createUpdateBundle} from '../../scripts/release/update-bundle.mjs'
export function exposeUpdateFixture(window:BrowserWindow,profile:string,closeStorage:()=>void){
 const g=globalThis as any;g.updateTrace=[]
 const attach=(service:()=>UpdateService|undefined)=>{
  ipcMain.removeHandler(updatesChannel);ipcMain.removeHandler(updatesGuardReply)
  return registerUpdateIpc(window,window.webContents.getURL(),service)
 }
 g.setupUpdateHost=async()=>{
  const hostId='11111111-1111-4111-8111-111111111111',token='a'.repeat(64),identity=await createHostIdentity(hostId)
  const directory=join(profile,'update-fixture');await mkdir(directory,{recursive:true})
  const bytes=Buffer.from('MZ fixture only - cannot execute'),sha512=createHash('sha512').update(bytes).digest('base64'),installer='Planrail-0.9.0.exe'
  await writeFile(join(directory,installer),bytes);await writeFile(join(directory,installer+'.blockmap'),'blockmap')
  await writeFile(join(directory,'latest.yml'),`version: 0.9.0\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${sha512}\n`)
  const {zipPath}=await createUpdateBundle({directory,manifest:{version:'0.9.0',sourceSha:'a'.repeat(40),arch:'x64',installer,signed:false,validationUpdateOnly:false}})
  const catalog=await UpdateCatalog.open({root:join(profile,'fixture-catalog'),hostId,hostVersion:'0.9.0',hostSourceSha:'a'.repeat(40)})
  await catalog.importBundle(zipPath);await catalog.publish()
  const device={id:'device',ip:'127.0.0.2',name:'Member',approved:true,revoked:false}
  const store={getConfig:()=>({hostId,datasetId:hostId}),listDevices:()=>[device],getDevice:()=>device,revokePendingCredentials:()=>{},findCredential:(hash:string)=>hash===hashCredential(token)?{deviceId:'device',status:'active'}:undefined} as unknown as HostStore
  const host=createSharingHost({identity,store,updates:createUpdateRoutes(catalog)}),address=await host.start('127.0.0.1',0)
  g.withdrawUpdate=()=>catalog.withdraw()
  // Identity/key/token remain in test main/controller processes, never renderer.
  return{address,trust:identity,token,localAddress:'127.0.0.2'}
 }
 g.setupUpdateMember=async(connection:UpdateConnection)=>{
  let service:UpdateService|undefined
  const ipc=attach(()=>service),barrier=createMutationBarrier()
  const coordinator=createInstallCoordinator({barrier,freezeRenderer:()=>ipc.guard.freeze(),releaseRenderer:()=>ipc.guard.release(),
   prepare:async()=>({validate:async()=>{},dispose:async()=>{},handoff:async()=>{g.updateTrace.push('handoff-failed');throw Error('Controlled installer failure')}}),
   record:(input,files)=>service!.recordAttempt(input,files),shutdown:async()=>{g.updateTrace.push('shutdown');closeStorage()}})
  service=await createUpdateService({root:join(profile,'fixture-member'),version:'0.8.0',editingBlocked:()=>barrier.blocked(),install:input=>coordinator.install(input),changed:s=>ipc.changed(s)})
  await service.setSharing({role:'member',connected:true,connection});await service.check();ipc.changed(service.getState())
  g.checkUpdate=()=>service!.check()
 }
}
