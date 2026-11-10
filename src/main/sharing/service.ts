import {networkInterfaces} from 'node:os'
import {randomUUID} from 'node:crypto'
import {createSharingStore} from '../db/sharing/store'
import {createSharedReminderStore} from '../db/sharing/cache'
import type {StorageState} from '../db/lifecycle'
import type {SharingAddress,SharingState,SharedProjectInput} from '../../shared/sharing'
import type {ReminderSettings} from '../../shared/types'
import {normalizeIPv4,validatePort} from '../../domain/sharing'
import {failure} from '../errors'
import {createSharingRepository} from './repository'
import {createSyncController} from './sync'
import {electronSecrets,secretRef,CredentialCleanupError,type ProtectedSecrets} from './secrets'
import {createHostIdentity,hostServerName,certificatePin,type HostIdentity} from './identity'
import {discoverHost,SharingNetworkError,type HostTrust} from './transport'
import {createSharingHost,type PendingPair} from './host'
import {SharingClient,type ClientConnection,type CredentialPersistence} from './client'
export interface SharingTransport {
  discover:typeof discoverHost
  client:(options:ConstructorParameters<typeof SharingClient>[0])=>Pick<SharingClient,'beginPair'|'confirmPair'|'poll'|'close'>
  host:typeof createSharingHost
  identity:typeof createHostIdentity
  interfaces:()=>string[]
}
const productionTransport:SharingTransport={discover:discoverHost,client:o=>new SharingClient(o),host:createSharingHost,identity:createHostIdentity,interfaces:()=>Object.values(networkInterfaces()).flatMap(list=>(list??[]).filter(i=>i.family==='IPv4').map(i=>i.address))}
interface Options {
  storage:Extract<StorageState,{state:'ready'}>;profile:string;changed:(state:SharingState)=>void
  clock?:()=>number;transport?:Partial<SharingTransport>;secrets?:(profile:string)=>Promise<ProtectedSecrets>
}
export function createSharingService(o:Options){
  const store=createSharingStore(o.storage.db),transport={...productionTransport,...o.transport},clock=o.clock??(()=>performance.now())
  const initial=store.getConfig()
  let snapshotRevision=0,epoch=0,disposed=false,suspended=false,status:SharingState['status']=initial.pendingCredentialDeleteRef?'error':initial.role==='personal'?'personal':'stopped',message=initial.pendingCredentialDeleteRef?new CredentialCleanupError().message:'',lastCheckedAt:string|null=null
  let pendingPair:PendingPair|null=null,pendingAddress:SharingAddress|null=null,settingsRequestToken:string|null=null
  let clientCommand:<T>(operation:(signal:AbortSignal)=>Promise<T>)=>Promise<T>
  let host:ReturnType<typeof createSharingHost>|undefined,client:ReturnType<SharingTransport['client']>|undefined,syncController:ReturnType<typeof createSyncController>|undefined
  let secretsPromise:Promise<ProtectedSecrets>|undefined,closing:Promise<void>|undefined,starting:Promise<void>|undefined
  const secrets=()=>secretsPromise??=(o.secrets??electronSecrets)(o.profile).catch(error=>{secretsPromise=undefined;throw error})
  const current=(generation:number)=>!disposed&&!suspended&&generation===epoch
  const check=(generation:number)=>{if(!current(generation))throw failure('FORBIDDEN')}
  function getState():SharingState{
    const c=store.getConfig()
    return {snapshotRevision,cleanupPending:c.pendingCredentialDeleteRef!==null,role:c.role,roleHistory:c.roleHistory,address:pendingAddress?.address??c.address,port:pendingAddress?.port??c.port,hostingEnabled:c.hostingEnabled,status,message,lastCheckedAt,
      pendingPair:pendingPair?{pairId:pendingPair.pairId,fingerprint:pendingPair.fingerprint,expiresAt:pendingPair.expiresAt}:null,
      pendingPairs:host?.pending()??[],devices:c.role==='host'?store.listDevices():[],projects:c.role==='host'?store.listSharedProjects():[],settingsRequestToken,
      availableAddresses:transport.interfaces(),
    }
  }
  function changed(){if(disposed)return;try{o.changed(getState())}catch{/* An unavailable renderer does not alter committed state. */}}
  function setStatus(value:SharingState['status'],error?:unknown){
    status=value
    message=error instanceof SharingNetworkError||error instanceof CredentialCleanupError?error.message:error?'공유 연결을 확인하지 못했습니다. 주소·승인·보호 저장소를 확인하고 다시 연결해 주세요.':''
    if(value==='connected')lastCheckedAt=new Date().toISOString()
    changed()
  }
  function invalidate(){
    epoch++;starting=undefined;syncController?.stop();syncController=undefined;client?.close();client=undefined;pendingPair=null;pendingAddress=null
    const previous=host;host=undefined
    // stop invalidates handlers synchronously before its first await.
    return previous?.stop()??Promise.resolve()
  }
  const address=(input:SharingAddress):SharingAddress=>({address:normalizeIPv4(input.address),port:validatePort(input.port)})
  function clientFor(trust:HostTrust,target:SharingAddress,generation:number,saved:ClientConnection|null){
    const ref=secretRef();let connection=saved,operationSignal:AbortSignal|undefined
    const persistence:CredentialPersistence={load:async()=>{check(generation);return connection},save:async(value)=>{
      const signal=operationSignal,live=()=>current(generation)&&!signal?.aborted
      const vault=await secrets();if(!live())throw failure('FORBIDDEN')
      await vault.write(ref,value,live);if(!live())throw failure('FORBIDDEN')
      const old=store.getConfig().credentialRef
      store.connectMember({...target,hostId:value.trust.hostId,datasetId:value.datasetId,certificatePin:value.trust.pin,credentialRef:ref})
      if(value.activation==='active')pendingAddress=null
      connection=value
      if(old&&old!==ref)vault.remove(old)
    }}
    client=transport.client({installationId:store.getConfig().hostId,trust,address:target,persistence,expectedDatasetId:store.getConfig().remoteDatasetId??undefined})
    const activeClient=client
    syncController=createSyncController({now:clock,poll:options=>{operationSignal=options.signal;return activeClient.poll(options)},apply:result=>{check(generation);const before=JSON.stringify(store.readCache());store.applyCache(result.snapshot);if(before!==JSON.stringify(store.readCache())){snapshotRevision++;changed()}},
      outcome:result=>{check(generation);if(result.kind==='revoked'){store.clearCache();snapshotRevision++;pendingPair=null}else if(result.kind==='pending')pendingPair=result.pair;else if(result.kind==='ready')pendingPair=null;changed()},
      state:(value,error)=>{if(current(generation))setStatus(value,error)},
    })
    clientCommand=<T>(operation:(signal:AbortSignal)=>Promise<T>)=>syncController!.command(signal=>{operationSignal=signal;return operation(signal)})
    return activeClient
  }
  async function startHost(generation:number){
    const c=store.getConfig()
    if(!c.address||!transport.interfaces().includes(c.address))throw failure('FORBIDDEN')
    const vault=await secrets();check(generation)
    let identity:HostIdentity
    if(c.certificateRef&&c.privateKeyRef){
      identity=await vault.read<HostIdentity>(c.privateKeyRef,()=>current(generation));check(generation)
      if(identity.hostId!==c.hostId||identity.pin!==c.certificatePin||certificatePin(identity.certificate)!==c.certificatePin||identity.serverName!==hostServerName(c.hostId))throw failure('STORAGE_IO')
    }else{
      if(c.certificatePin||c.certificateRef||c.privateKeyRef)throw failure('STORAGE_IO')
      identity=await transport.identity(c.hostId);check(generation)
      const ref=secretRef();await vault.write(ref,identity,()=>current(generation));check(generation)
      store.setHostIdentity({certificatePin:identity.pin,certificateRef:ref,privateKeyRef:ref})
    }
    check(generation)
    const activeHost=transport.host({identity,store,onChange:()=>{if(current(generation))changed()},now:clock});host=activeHost
    await activeHost.start(c.address,c.port);check(generation);setStatus('connected')
  }
  async function loadMember(generation:number){
    const c=store.getConfig();if(!c.credentialRef||!c.address)throw failure('STORAGE_IO')
    const vault=await secrets();check(generation)
    const saved=await vault.read<ClientConnection>(c.credentialRef,()=>current(generation));check(generation)
    if(saved.trust.hostId!==c.remoteHostId||saved.trust.pin!==c.certificatePin||saved.datasetId!==c.remoteDatasetId||certificatePin(saved.trust.certificate)!==c.certificatePin)throw failure('STORAGE_IO')
    return saved
  }
  async function startMember(generation:number){
    const c=store.getConfig(),saved=await loadMember(generation);check(generation)
    if(saved.activation!=='active')throw new SharingNetworkError('PAIRING_INCOMPLETE')
    clientFor(saved.trust,{address:c.address!,port:c.port},generation,saved)
    await syncController!.refresh(true)
  }
  async function cleanupCredential(generation:number){
    const ref=store.getConfig().pendingCredentialDeleteRef
    if(!ref)return
    try{
      const vault=await secrets();check(generation)
      vault.remove(ref);check(generation)
      store.completeCredentialDeletion(ref)
    }catch(error){if(!current(generation))throw error;throw new CredentialCleanupError()}
  }
  async function launch(){
    if(disposed||suspended)return
    const generation=epoch,c=store.getConfig()
    try{await cleanupCredential(generation);check(generation);if(c.role==='host'&&c.hostingEnabled){setStatus('connecting');await startHost(generation)}else if(c.role==='member'){setStatus('connecting');await startMember(generation)}else setStatus(c.role==='personal'?'personal':'stopped')}
    catch(error){if(current(generation))setStatus('error',error)}
  }
  function start(){if(!starting){const task=launch().finally(()=>{if(starting===task)starting=undefined});starting=task}return starting}
  async function configureHost(input:SharingAddress){
    if(disposed||store.getConfig().roleHistory==='member')throw failure('FORBIDDEN')
    const target=address(input);if(!transport.interfaces().includes(target.address))throw failure('FORBIDDEN')
    const drain=invalidate(),generation=epoch;await drain;check(generation)
    store.configureHost(target);await start();check(generation);return getState()
  }
  async function setHosting(input:{enabled:boolean}){
    if(disposed)throw failure('FORBIDDEN')
    store.setHosting(input);const drain=invalidate(),generation=epoch;await drain;check(generation);await start();check(generation);return getState()
  }
  async function connect(input:SharingAddress){
    if(disposed||store.getConfig().roleHistory==='host')throw failure('FORBIDDEN')
    const target=address(input),c=store.getConfig(),drain=invalidate(),generation=epoch;await drain;check(generation)
    pendingAddress=target
    setStatus('connecting')
    try{
      await cleanupCredential(generation);check(generation)
      let trust:HostTrust
      if(c.role==='member'){
        const saved=await loadMember(generation);check(generation)
        trust=saved.trust
        if(saved.activation==='active'){
          // An address edit retains the approved credential and protected expected trust.
          store.connectMember({...target,hostId:trust.hostId,datasetId:saved.datasetId,certificatePin:trust.pin,credentialRef:c.credentialRef!})
          clientFor(trust,target,generation,saved)
          await syncController!.refresh(true);check(generation);return getState()
        }
      }else{
        // After explicit disconnect only, same-host reapproval may accept a new pin.
        trust=await transport.discover(target.address,target.port);check(generation)
        if(c.remoteHostId&&trust.hostId!==c.remoteHostId)throw new SharingNetworkError('HOST_MISMATCH')
      }
      const active=clientFor(trust,target,generation,null)
      const pair=await clientCommand!(signal=>active.beginPair({signal}));check(generation);pendingPair=pair;setStatus('pairing')
      void syncController!.refresh();return getState()
    }catch(error){if(current(generation))setStatus('error',error);throw error}
  }
  async function confirmHost(input:{pairId:string;confirmed:true}){
    if(input.confirmed!==true||!pendingPair||input.pairId!==pendingPair.pairId||!client)throw failure('FORBIDDEN')
    const generation=epoch,active=client,pair=pendingPair
    // The poll coordinator is the only owner of client operations. Wait for a normal pending read first.
    const outcome=await clientCommand!(signal=>active.confirmPair(pair.pairId,pair.fingerprint,{signal}));check(generation)
    pendingPair=outcome.kind==='pending'?outcome.pair:null
    await syncController?.refresh(true);check(generation);changed();return getState()
  }
  function approve(input:{pairId:string;confirmed:true}){if(input.confirmed!==true||!host)throw failure('FORBIDDEN');host.approve(input.pairId);changed();return getState()}
  function saveDevice(input:{id?:string;name:string;ip:string}){if(disposed)throw failure('FORBIDDEN');const value=store.saveDevice(input);changed();return value}
  function revokeDevice(input:{id:string}){if(disposed)throw failure('FORBIDDEN');store.revokeDevice(input);changed();return getState()}
  function saveProject(input:SharedProjectInput){if(disposed)throw failure('FORBIDDEN');const value=store.saveProject(input);snapshotRevision++;changed();return value}
  function saveReminder(input:{id:string;reminder:ReminderSettings}){if(disposed)throw failure('FORBIDDEN');const value=store.saveReminder(input);snapshotRevision++;changed();return value}
  async function disconnect(input:{confirmed:true}){
    if(input.confirmed!==true||disposed||store.getConfig().role==='host')throw failure('FORBIDDEN')
    const drain=invalidate(),generation=epoch;await drain;check(generation)
    const c=store.getConfig()
    // Atomically detach active credentials/cache and retain a durable non-active deletion obligation.
    if(c.role==='member'){store.disconnectMember(input);snapshotRevision++}
    try{await cleanupCredential(generation)}
    catch(error){if(current(generation))setStatus('error',error);throw error}
    check(generation);lastCheckedAt=null;setStatus('personal');return getState()
  }
  function suspend(){if(disposed)return; suspended=true;const drain=invalidate();setStatus('disconnected');void drain.catch(()=>{});return drain}
  async function resume(){
    if(disposed)return
    suspended=false;const drain=invalidate(),generation=epoch
    try{await drain;if(current(generation))await start()}catch(error){if(current(generation))setStatus('error',error)}
  }
  function dispose(){if(closing)return closing;disposed=true;closing=invalidate();return closing}
  return {getState,start,configureHost,setHosting,connect,confirmHost,approve,saveDevice,revokeDevice,saveProject,saveReminder,disconnect,
    sync:async()=>{if(disposed)throw failure('FORBIDDEN');const generation=epoch;await syncController?.refresh(true);check(generation);return getState()},
    authorizeReminder:async()=>{const generation=epoch,active=syncController;if(!active||disposed||suspended)return false;const allowed=await active.authorize();return current(generation)&&active===syncController&&allowed&&store.getConfig().role==='member'},
    notifyLocalMutation(){if(!disposed){snapshotRevision++;changed()}},
    requestSettings(){if(disposed)throw failure('FORBIDDEN');settingsRequestToken=randomUUID();changed();return getState()},
    acknowledgeSettings({token}:{token:string}){if(disposed)throw failure('FORBIDDEN');if(settingsRequestToken===token)settingsRequestToken=null;return getState()},
    suspend,resume,dispose,repository:createSharingRepository(o.storage.repository,store),memberSnapshot:()=>store.readCache(),memberReminderStore:createSharedReminderStore(o.storage.db),
  }
}
export type SharingService=ReturnType<typeof createSharingService>
