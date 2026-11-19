import {createReminderStore} from '../db/reminders'
import {createPersonalHolidays} from '../db/personal-holidays'
import {createSharingExtras} from '../db/sharing/extras'
import {createPairingNotifications} from '../notifications/pairing'
import {DEFAULT_HOLIDAYS,type HolidayCalendar,type HolidayState} from '../../shared/holidays'
import {createMemberPresence} from './presence'
import {createNotificationStore} from '../db/notifications'
import {dueReminders} from '../../domain/reminder'
import type { UpdateRoutes } from '../updates/transport'
import type { UpdateSharingContext } from '../updates/service'
import {createChangeNotifications} from './change-notifications'
import type {ReminderSender} from '../reminders/engine'
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
  client:(options:ConstructorParameters<typeof SharingClient>[0])=>Pick<SharingClient,'beginPair'|'confirmPair'|'poll'|'close'> & Partial<Pick<SharingClient,'pollHolidays'|'acceptHolidayEtag'>>
  host:typeof createSharingHost
  identity:typeof createHostIdentity
  interfaces:()=>string[]
}
const productionTransport:SharingTransport={discover:discoverHost,client:o=>new SharingClient(o),host:createSharingHost,identity:createHostIdentity,interfaces:()=>Object.values(networkInterfaces()).flatMap(list=>(list??[]).filter(i=>i.family==='IPv4').map(i=>i.address))}
interface Options {
  storage:Extract<StorageState,{state:'ready'}>;profile:string;changed:(state:SharingState)=>void
  roleSwitchBlocked?:()=>boolean;beforeRoleSwitch?:()=>Promise<void>;roleChanged?:()=>void
  updates?:UpdateRoutes;updateChanged?:()=>void;mutationsBlocked?:()=>boolean
  changeSender?:ReminderSender;onChangeClick?:()=>void;appVersion?:string
  reminderClock?:()=>Date;clock?:()=>number;transport?:Partial<SharingTransport>;secrets?:(profile:string)=>Promise<ProtectedSecrets>
}
export function createSharingService(o:Options){
  const store=createSharingStore(o.storage.db),transport={...productionTransport,...o.transport},clock=o.clock??(()=>performance.now())
  const policy=createNotificationStore(o.storage.db),memberReminderStore=createSharedReminderStore(o.storage.db),extras=createSharingExtras(o.storage.db)
  const presence=createMemberPresence({now:clock,changed})
  const initial=store.getConfig()
  let holidayPhase:HolidayState['status']=extras.cachedCalendar()?'stale':'pending',holidayError='',versionError=false,approvalRequestToken:string|null=null
  let switching=false
  let snapshotRevision=0,epoch=0,disposed=false,suspended=false,status:SharingState['status']=initial.pendingCredentialDeleteRef?'error':initial.role==='personal'?'personal':'stopped',message=initial.pendingCredentialDeleteRef?new CredentialCleanupError().message:'',lastCheckedAt:string|null=null
  let pendingPair:PendingPair|null=null,pendingAddress:SharingAddress|null=null,settingsRequestToken:string|null=null
  let hostVersion:string|null=null
  let clientCommand:<T>(operation:(signal:AbortSignal)=>Promise<T>)=>Promise<T>
  let host:ReturnType<typeof createSharingHost>|undefined,client:ReturnType<SharingTransport['client']>|undefined,syncController:ReturnType<typeof createSyncController>|undefined
  let updateConnection:ClientConnection|undefined,updateTrustRejected=false
  let secretsPromise:Promise<ProtectedSecrets>|undefined,closing:Promise<void>|undefined,starting:Promise<void>|undefined
  const secrets=()=>secretsPromise??=(o.secrets??electronSecrets)(o.profile).catch(error=>{secretsPromise=undefined;throw error})
  const changes=createChangeNotifications({db:o.storage.db,role:()=>store.getConfig().role,generation:()=>epoch,
    connected:()=>!disposed&&!suspended&&status==='connected'&&!!syncController?.fresh(),revoked:()=>!disposed&&!suspended&&status==='revoked',
    snapshot:()=>store.readCache(),authorize:async()=>{const generation=epoch,active=syncController;if(!active||disposed||suspended)return false;const allowed=await active.authorize();return current(generation)&&active===syncController&&allowed&&store.getConfig().role==='member'},
    changed,send:o.changeSender,onClick:o.onChangeClick,
  })
  const pairing=createPairingNotifications({store:extras,policy,valid:p=>!disposed&&!suspended&&!!host?.needsApproval(p.pairId),send:o.changeSender??(async()=> 'failed'),
    open:()=>{if(disposed||suspended||o.mutationsBlocked?.())return;settingsRequestToken=randomUUID();approvalRequestToken=settingsRequestToken;o.onChangeClick?.();changed()},changed})
  function holidayState():HolidayState{
    if(store.getRoleTransition())return {calendar:DEFAULT_HOLIDAYS,status:'pending',lastReceivedAt:null,message:'역할 전환을 완료한 뒤 공통 휴일표를 사용합니다.'}
    const c=store.getConfig(),cache=c.role==='member'?extras.cachedCalendar():null
    if(c.role==='member'&&changes.isRevoked())return {calendar:{weekdays:[],dates:[]},status:'revoked',lastReceivedAt:null,message:'공유 승인이 취소되어 공통 휴일표를 제거했습니다. 개인 휴일은 유지됩니다.'}
    const phase=c.role==='host'?'host':c.role==='personal'?'local':holidayPhase==='current'&&status!=='connected'?'stale':holidayPhase
    return {calendar:c.role==='host'?extras.hostCalendar().calendar:phase==='unsupported'?DEFAULT_HOLIDAYS:cache?.envelope.calendar??DEFAULT_HOLIDAYS,status:phase,lastReceivedAt:cache?.receivedAt??null,message:holidayError}
  }
  const current=(generation:number)=>!disposed&&!suspended&&!o.mutationsBlocked?.()&&generation===epoch
  const check=(generation:number)=>{if(!current(generation))throw failure('FORBIDDEN')}
  function getState():SharingState{
    const c=store.getConfig(),memberPresence=c.role==='host'?presence.snapshot(store.listDevices().filter(d=>d.approved&&!d.revoked).map(d=>d.id)):undefined
    return {roleTransition:store.getRoleTransition(),dormantAvailable:store.hasDormantData(),personalHolidays:createPersonalHolidays(o.storage.db).read(),holidays:holidayState(),deviceVersions:c.role==='host'?extras.versions():undefined,pairingNotificationError:pairing.error(),deviceVersionError:versionError,approvalRequestToken,...(memberPresence?{memberPresence,connectedMembers:Object.values(memberPresence).filter(p=>p.connected).length}:{}),changeNotifications:changes.state(),snapshotRevision,cleanupPending:c.pendingCredentialDeleteRef!==null,role:c.role,roleHistory:c.roleHistory,address:pendingAddress?.address??c.address,port:pendingAddress?.port??c.port,hostingEnabled:c.hostingEnabled,status,message,lastCheckedAt,
      pendingPair:pendingPair?{pairId:pendingPair.pairId,fingerprint:pendingPair.fingerprint,expiresAt:pendingPair.expiresAt}:null,
      pendingPairs:host?.pending()??[],devices:c.role==='host'?store.listDevices():[],projects:c.role==='host'?store.listSharedProjects():[],settingsRequestToken,
      ...(c.role==='member'?{hostVersion}:{}),
      availableAddresses:transport.interfaces(),
    }
  }
  function changed(){if(disposed)return;try{o.updateChanged?.()}catch{};try{o.changed(getState())}catch{/* An unavailable renderer does not alter committed state. */}}
  function setStatus(value:SharingState['status'],error?:unknown){
    status=value
    if(value==='revoked'||error instanceof SharingNetworkError&&['TLS_UNTRUSTED','UNAUTHORIZED','REVOKED','HOST_MISMATCH','DATASET_MISMATCH','PAIRING_INCOMPLETE','PROTOCOL_MISMATCH'].includes(error.code))hostVersion=null
    if(value!=='connected'&&store.getConfig().role==='host')presence.invalidate()
    if(error instanceof SharingNetworkError&&['TLS_UNTRUSTED','UNAUTHORIZED','REVOKED'].includes(error.code))updateTrustRejected=true
    if(value==='revoked')updateTrustRejected=true
    message=error instanceof SharingNetworkError||error instanceof CredentialCleanupError?error.message:error?'공유 연결을 확인하지 못했습니다. 주소·승인·보호 저장소를 확인하고 다시 연결해 주세요.':''
    if(value==='connected')lastCheckedAt=new Date().toISOString()
    changed()
    if(value==='connected'||value==='revoked')void changes.evaluate()
  }
  function invalidate(){
    hostVersion=null
    presence.invalidate();epoch++;o.updateChanged?.();changes.invalidate();starting=undefined;syncController?.stop();syncController=undefined;client?.close();client=undefined;pendingPair=null;pendingAddress=null
    const previous=host;host=undefined
    // stop invalidates handlers synchronously before its first await.
    return previous?.stop()??Promise.resolve()
  }
  const address=(input:SharingAddress):SharingAddress=>({address:normalizeIPv4(input.address),port:validatePort(input.port)})
  function clientFor(trust:HostTrust,target:SharingAddress,generation:number,saved:ClientConnection|null){
    if(saved){updateConnection=saved;updateTrustRejected=false;o.updateChanged?.()}
    const ref=secretRef();let connection=saved,operationSignal:AbortSignal|undefined
    const persistence:CredentialPersistence={load:async()=>{check(generation);return connection},save:async(value)=>{
      const signal=operationSignal,live=()=>current(generation)&&!signal?.aborted
      const vault=await secrets();if(!live())throw failure('FORBIDDEN')
      await vault.write(ref,value,live);if(!live())throw failure('FORBIDDEN')
      const old=store.getConfig().credentialRef
      store.connectMember({...target,hostId:value.trust.hostId,datasetId:value.datasetId,certificatePin:value.trust.pin,credentialRef:ref})
      if(value.activation==='active')pendingAddress=null
      connection=value;updateConnection=value;updateTrustRejected=false
      o.updateChanged?.()
      if(old&&old!==ref)vault.remove(old)
    }}
    holidayPhase=extras.cachedCalendar()?'stale':'pending';holidayError=''
    client=transport.client({installationId:store.getConfig().hostId,trust,address:target,persistence,appVersion:o.appVersion,expectedDatasetId:store.getConfig().remoteDatasetId??undefined})
    const activeClient=client
    const generations=new WeakMap<object,number>()
    const settle=(result:object)=>{changes.confirmAccess();policy.resumeShared(generations.get(result)??-1,()=>memberReminderStore.suppress(store.readCache().schedules.flatMap(s=>dueReminders(s,(o.reminderClock??(()=>new Date()))()))))}
    syncController=createSyncController({now:clock,cursor:changes.cursor,poll:async options=>{operationSignal=options.signal;const generation=policy.state().generation;const result=await activeClient.poll(options);generations.set(result,generation);return result},apply:(result,reconnecting)=>{check(generation);const before=JSON.stringify(store.readCache());o.storage.db.transaction(()=>{if(result.changes)changes.apply(result.changes,reconnecting,generations.get(result)??-1);else{store.applyCache(result.snapshot);if(result.changesSupported===false)changes.unsupported()}settle(result)})();if(before!==JSON.stringify(store.readCache())){snapshotRevision++;changed()}},
      outcome:result=>{check(generation);if(result.kind==='unchanged')settle(result);if(result.kind==='snapshot'||result.kind==='unchanged')hostVersion=result.hostVersion??null;if(result.kind==='revoked'){hostVersion=null;extras.clearCalendar();holidayPhase='pending';holidayError='';changes.revoke();snapshotRevision++;pendingPair=null}else if(result.kind==='unchanged'&&result.changesSupported===false)changes.unsupported();else if(result.kind==='pending')pendingPair=result.pair;else if(result.kind==='ready')pendingPair=null;changed()},
      afterSync:async options=>{
        if(!current(generation)||options.signal.aborted)return
        try{
          const result=await activeClient.pollHolidays?.(options)
          if(!current(generation)||options.signal.aborted)return
          if(!result||result.kind==='unsupported'){holidayPhase='unsupported';holidayError='호스트가 휴일 동기화를 지원하지 않습니다. 호스트를 업데이트하세요.'}
          else if(result.kind==='updated'){extras.applyCalendar(result.envelope);activeClient.acceptHolidayEtag?.(result.etag);holidayPhase='current';holidayError=''}
          else if(extras.cachedCalendar()){holidayPhase='current';holidayError=''}
          else throw Error('HOLIDAY_CACHE_MISSING')
        }catch(error){
          if(!current(generation)||options.signal.aborted)return
          if(error instanceof SharingNetworkError&&error.code==='REVOKED'&&error.status===403)return 'revoked'
          holidayPhase='error';holidayError='휴일표를 갱신하지 못했습니다. 마지막 수신 자료를 표시합니다. 다시 동기화해 주세요.'
          if(error instanceof SharingNetworkError&&['UNAUTHORIZED','TLS_UNTRUSTED','HOST_MISMATCH','DATASET_MISMATCH'].includes(error.code))throw error
        }finally{if(current(generation))changed()}
      },
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
    const activeHost=transport.host({identity,store,appVersion:o.appVersion,updates:o.updates,holidays:extras.hostCalendar,onPairConfirmed:p=>{if(current(generation))void pairing.observe(p)},onSyncComplete:(id,version,bindingCurrent)=>{if(current(generation)){if(bindingCurrent!==false){try{extras.recordVersion(id,version);versionError=false}catch{versionError=true}}presence.record(id)}},onChange:()=>{if(current(generation))changed()},now:clock});host=activeHost
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
  const mutable=()=>{if(disposed||suspended||switching||store.getRoleTransition()||o.mutationsBlocked?.())throw failure('FORBIDDEN')}
  async function finishRoleSwitch(){
    const drain=invalidate(),generation=epoch
    updateConnection=undefined;updateTrustRejected=false;lastCheckedAt=null
    try{
      await drain;check(generation)
      await o.beforeRoleSwitch?.();check(generation)
      store.prepareRoleCleanup();snapshotRevision++;changed();o.roleChanged?.()
      await cleanupCredential(generation);check(generation)
      // Record due occurrences while the originals are still dormant, so returning
      // to host never sends a backlog accumulated during the dormant interval.
      const due=store.dormantSnapshot().schedules.flatMap(s=>dueReminders(s,(o.reminderClock??(()=>new Date()))()))
      o.storage.db.transaction(()=>{createReminderStore(o.storage.db).suppress(due);store.completeRoleTransition()})()
      holidayPhase='pending';holidayError='';snapshotRevision++;setStatus('stopped');o.roleChanged?.()
      return getState()
    }catch(error){
      try{store.failRoleTransition()}catch{/* The original durable intent still prevents auto-start. */}
      if(current(generation))setStatus('error',error)
      throw error
    }
  }
  async function switchRole(input:{role:'host'|'member';confirmed:true}){
    if(disposed||suspended||switching||o.mutationsBlocked?.()||o.roleSwitchBlocked?.())throw failure('FORBIDDEN')
    if(input.confirmed!==true||!['host','member'].includes(input.role))throw failure('FORBIDDEN')
    const transition=store.beginRoleTransition(input)
    if(!transition)return getState()
    switching=true;changed()
    try{return await finishRoleSwitch()}finally{switching=false;changed()}
  }
  async function launch(){
    if(disposed||suspended)return
    if(store.getRoleTransition()){
      if(switching)return
      switching=true
      try{await finishRoleSwitch()}catch{/* Retain failed transition for explicit retry. */}finally{switching=false;changed()}
      return
    }
    const generation=epoch,c=store.getConfig()
    try{await cleanupCredential(generation);check(generation);if(c.role==='host'&&c.hostingEnabled){setStatus('connecting');await startHost(generation)}else if(c.role==='member'&&c.credentialRef){setStatus('connecting');await startMember(generation)}else setStatus(c.role==='personal'?'personal':'stopped')}
    catch(error){if(current(generation))setStatus('error',error)}
  }
  function start(){if(!starting){const task=launch().finally(()=>{if(starting===task)starting=undefined});starting=task}return starting}
  async function configureHost(input:SharingAddress){
    mutable()
    if(store.getConfig().roleHistory==='member')throw failure('FORBIDDEN')
    const target=address(input);if(!transport.interfaces().includes(target.address))throw failure('FORBIDDEN')
    const drain=invalidate(),generation=epoch;await drain;check(generation)
    store.configureHost(target);await start();check(generation);return getState()
  }
  async function setHosting(input:{enabled:boolean}){
    mutable()
    store.setHosting(input);const drain=invalidate(),generation=epoch;await drain;check(generation);await start();check(generation);return getState()
  }
  async function connect(input:SharingAddress){
    mutable()
    if(store.getConfig().roleHistory==='host')throw failure('FORBIDDEN')
    const target=address(input),c=store.getConfig(),drain=invalidate(),generation=epoch;await drain;check(generation)
    pendingAddress=target
    setStatus('connecting')
    try{
      await cleanupCredential(generation);check(generation)
      let trust:HostTrust
      if(c.role==='member'&&c.credentialRef){
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
    mutable()
    if(input.confirmed!==true||!pendingPair||input.pairId!==pendingPair.pairId||!client)throw failure('FORBIDDEN')
    const generation=epoch,active=client,pair=pendingPair
    // The poll coordinator is the only owner of client operations. Wait for a normal pending read first.
    const outcome=await clientCommand!(signal=>active.confirmPair(pair.pairId,pair.fingerprint,{signal}));check(generation)
    pendingPair=outcome.kind==='pending'?outcome.pair:null
    await syncController?.refresh(true);check(generation);changed();return getState()
  }
  function approve(input:{pairId:string;confirmed:true}){mutable();if(input.confirmed!==true||!host)throw failure('FORBIDDEN');host.approve(input.pairId);changed();return getState()}
  function saveDevice(input:{id?:string;name:string;ip:string}){mutable();const previous=input.id?store.getDevice(input.id):undefined;const value=store.saveDevice(input);if(previous&&previous.ip!==value.ip)presence.invalidate(value.id);changed();return value}
  function revokeDevice(input:{id:string}){mutable();store.revokeDevice(input);presence.invalidate(input.id);changed();return getState()}
  function deleteDevice(input:{id:string}){mutable();store.deleteDevice(input);presence.invalidate(input.id);snapshotRevision++;changed();return getState()}
  function saveProject(input:SharedProjectInput){mutable();const value=store.saveProject(input);snapshotRevision++;changed();return value}
  function saveReminder(input:{id:string;reminder:ReminderSettings}){mutable();const value=store.saveReminder(input);snapshotRevision++;changed();return value}
  async function disconnect(input:{confirmed:true}){
    mutable()
    if(input.confirmed!==true||store.getConfig().role==='host')throw failure('FORBIDDEN')
    const drain=invalidate(),generation=epoch;await drain;check(generation)
    const c=store.getConfig()
    // Atomically detach active credentials/cache and retain a durable non-active deletion obligation.
    if(c.role==='member'){store.disconnectMember(input);updateConnection=undefined;updateTrustRejected=false;o.updateChanged?.();snapshotRevision++}
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
  function dispose(){if(closing)return closing;disposed=true;presence.dispose();pairing.dispose();const notifications=changes.dispose();closing=Promise.all([invalidate(),notifications]).then(()=>{});return closing}
  return {getState,start,switchRole,getDormantData:()=>({...store.dormantSnapshot(),holidays:extras.hostCalendar().calendar}),
    getUpdateHostId:()=>store.getConfig().hostId,
    getUpdateContext():UpdateSharingContext{
      if(store.getRoleTransition())return {role:'personal',connected:false,trustPending:false,revoked:true}
      const c=store.getConfig(),saved=updateConnection
      return {role:c.role,connected:status==='connected',trustPending:c.role==='member'&&!!c.credentialRef&&!saved,revoked:updateTrustRejected||status==='revoked',
        ...(c.role==='member'&&c.credentialRef&&c.address&&saved?.activation==='active'?{connection:{address:{address:c.address,port:c.port},trust:saved.trust,token:saved.token}}:{})}
    },configureHost,setHosting,connect,confirmHost,approve,saveDevice,revokeDevice,deleteDevice,saveProject,saveReminder,disconnect,
    savePersonalHolidays(input:{calendar:HolidayCalendar}){mutable();createPersonalHolidays(o.storage.db).save(input.calendar);changed();return getState()},
    saveHolidays(input:{calendar:HolidayCalendar}){mutable();extras.saveCalendar(input.calendar);changed();return getState()},
    setChangeNotifications(input:{enabled:boolean}){mutable();changes.setEnabled(input);return getState()},
    retryChangeNotifications:async()=>{mutable();await changes.retry();return getState()},
    acknowledgeChange(input:{token:string}){changes.acknowledge(input);return getState()},
    sync:async()=>{mutable();const generation=epoch;await syncController?.refresh(true);check(generation);return getState()},
    authorizeReminder:async()=>{const generation=epoch,active=syncController;if(!active||disposed||suspended)return false;const allowed=await active.authorize();return current(generation)&&active===syncController&&allowed&&store.getConfig().role==='member'},
    notifyLocalMutation(){if(!disposed){snapshotRevision++;changed()}},
    requestSettings(){if(disposed)throw failure('FORBIDDEN');settingsRequestToken=randomUUID();changed();return getState()},
    acknowledgeSettings({token}:{token:string}){if(disposed)throw failure('FORBIDDEN');if(settingsRequestToken===token)settingsRequestToken=null;return getState()},
    suspend,resume,dispose,repository:createSharingRepository(o.storage.repository,store),memberSnapshot:()=>store.getRoleTransition()?{projects:[],schedules:[]}:store.readCache(),memberReminderStore,
  }
}
export type SharingService=ReturnType<typeof createSharingService>
