import assert from 'node:assert/strict'
import {openDatabase,createRepository} from '../../src/main/db/repository'
import {setup,type NativeCase} from './helpers'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createSharingService} from '../../src/main/sharing/service'
import {sharedId} from '../../src/domain/sharing'
import {createHostIdentity} from '../../src/main/sharing/identity'
import {pinnedRequest} from '../../src/main/sharing/transport'
import {createSharingHost} from '../../src/main/sharing/host'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'
import {createServer} from 'node:net'
import {mkdirSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {dispatch} from '../../src/main/ipc-core'
const hostId='11111111-1111-4111-8111-111111111111',datasetId='22222222-2222-4222-8222-222222222222'
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
const pair={pairId:'pair',deviceId:'device',name:'Member',ip:'127.0.0.1',fingerprint:'F'.repeat(64),expiresAt:new Date(Date.now()+300000).toISOString()}
const vault={isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'kwallet',encryptStringAsync:async(v:string)=>Buffer.from(v),decryptStringAsync:async(v:Buffer)=>({result:v.toString(),shouldReEncrypt:false})}
export const cases:NativeCase[]=[
 {name:'pending target survives public settings reopen without committing role and is cleared on invalidation',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db);
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},transport:{discover:async()=>({hostId,serverName:'host',certificate:'cert',pin:'pin'}),client:()=>({beginPair:async()=>pair,confirmPair:async()=>({kind:'pending',pair}),poll:async()=>({kind:'pending',pair}),close:()=>{}})}});
  try{
   await service.connect({address:'127.0.0.1',port:48999});
   assert.equal(service.getState().address,'127.0.0.1');assert.equal(service.getState().port,48999);assert.equal(service.getState().role,'personal');
   assert.equal(store.getConfig().address,null);assert.equal(store.getConfig().credentialRef,null);
   const requested=service.requestSettings();service.acknowledgeSettings({token:requested.settingsRequestToken!});
   assert.equal(service.getState().address,'127.0.0.1');assert.equal(service.getState().port,48999);
   await service.disconnect({confirmed:true});assert.equal(service.getState().address,null);assert.equal(service.getState().port,47831);assert.equal(service.getState().pendingPair,null);
  }finally{await service.dispose()}
 }},
 {name:'failed credential deletion remains non-active and is retried on the next disconnect',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),protectedSecrets=createProtectedSecrets(ctx.tempDir,vault),ref='d'.repeat(32)
  await protectedSecrets.write(ref,{token:'must never authenticate'},()=>true)
  store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:ref})
  let removes=0,network=0
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>({...protectedSecrets,remove:id=>{removes++;if(removes===1)throw Object.assign(Error('locked'),{code:'EACCES'});protectedSecrets.remove(id)}}),transport:{discover:async()=>{network++;throw Error('must not authenticate')}}})
  try{
   await assert.rejects(service.disconnect({confirmed:true}));assert.equal(store.getConfig().credentialRef,null);assert.equal(store.getConfig().pendingCredentialDeleteRef,ref)
   assert.equal(service.getState().status,'error');assert.equal(service.getState().cleanupPending,true);assert.equal(JSON.stringify(service.getState()).includes(ref),false);assert.match(service.getState().message,/연결 해제.*다시/);assert(existsSync(join(ctx.tempDir,'sharing-secrets',ref)))
   assert.equal(service.memberSnapshot().schedules.length,0);assert.equal(await service.authorizeReminder(),false)
   assert.throws(()=>store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:ref}))
   assert.equal(service.repository.createProject({name:'Still personal',color:'#2563EB',participants:[]}).name,'Still personal')
   const state=await service.disconnect({confirmed:true});assert.equal(state.status,'personal');assert.equal(state.cleanupPending,false);assert.equal(removes,2);assert.equal(network,0);assert.equal(store.getConfig().pendingCredentialDeleteRef,null);assert.equal(existsSync(join(ctx.tempDir,'sharing-secrets',ref)),false)
  }finally{await service.dispose()}
 }},
 {name:'credential deletion obligation survives database reopen and startup retries without network authentication',async run(ctx){
  const first=setup(ctx),ref='e'.repeat(32),protectedSecrets=createProtectedSecrets(ctx.tempDir,vault),store=createSharingStore(first.db)
  await protectedSecrets.write(ref,{token:'old'},()=>true);store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:ref})
  let removes=0,network=0
  const secrets=async()=>({...protectedSecrets,remove:(id:string)=>{removes++;if(removes<3)throw Object.assign(Error('locked'),{code:'EACCES'});protectedSecrets.remove(id)}})
  const transport={discover:async()=>{network++;throw Error('must not authenticate')},client:()=>{network++;throw Error('must not authenticate')}}
  const original=createSharingService({storage:{state:'ready',db:first.db,repository:first.repo},profile:ctx.tempDir,changed:()=>{},secrets,transport})
  await assert.rejects(original.disconnect({confirmed:true}));await original.dispose();first.db.close()
  const db=openDatabase(first.file,true);ctx.defer(()=>{if(db.open)db.close()});const repository=createRepository(db)
  const failedRestart=createSharingService({storage:{state:'ready',db,repository},profile:ctx.tempDir,changed:()=>{},secrets,transport})
  assert.equal(failedRestart.getState().cleanupPending,true);await failedRestart.start();assert.equal(failedRestart.getState().cleanupPending,true);assert.equal(failedRestart.getState().status,'error');assert.match(failedRestart.getState().message,/연결 해제.*다시/);assert.equal(createSharingStore(db).getConfig().pendingCredentialDeleteRef,ref);assert.equal(createSharingStore(db).getConfig().credentialRef,null);await failedRestart.dispose()
  const successfulRestart=createSharingService({storage:{state:'ready',db,repository},profile:ctx.tempDir,changed:()=>{},secrets,transport})
  await successfulRestart.start();assert.equal(successfulRestart.getState().status,'personal');assert.equal(successfulRestart.getState().cleanupPending,false);assert.equal(removes,3);assert.equal(network,0);assert.equal(createSharingStore(db).getConfig().pendingCredentialDeleteRef,null);assert.equal(existsSync(join(ctx.tempDir,'sharing-secrets',ref)),false);await successfulRestart.dispose()
 }},
 {name:'a disposed startup cannot clear pending deletion after its awaited vault resolves',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),ref='f'.repeat(32),protectedSecrets=createProtectedSecrets(ctx.tempDir,vault)
  await protectedSecrets.write(ref,{token:'old'},()=>true);store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:ref})
  const first=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>({...protectedSecrets,remove:()=>{throw Error('locked')}})})
  await assert.rejects(first.disconnect({confirmed:true}));await first.dispose();assert.equal(store.getConfig().pendingCredentialDeleteRef,ref)
  const delayed=deferred<typeof protectedSecrets>(),began=deferred<void>();let removes=0
  const stale=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:()=>{began.resolve();return delayed.promise}})
  const pending=stale.start();await began.promise;await stale.dispose();delayed.resolve({...protectedSecrets,remove:id=>{removes++;protectedSecrets.remove(id)}});await pending
  assert.equal(removes,0);assert.equal(store.getConfig().pendingCredentialDeleteRef,ref);assert.equal(store.getConfig().credentialRef,null);assert(existsSync(join(ctx.tempDir,'sharing-secrets',ref)))
 }},
 {name:'disconnect fences a delayed pairing result before publishing pending DTO state',async run(ctx){
  const {db,repo}=setup(ctx),late=deferred<typeof pair>(),began=deferred<void>()
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},transport:{discover:async()=>({hostId,serverName:'host',certificate:'cert',pin:'pin'}),client:()=>({beginPair:()=>{began.resolve();return late.promise},confirmPair:async()=>({kind:'pending',pair}),poll:async()=>({kind:'pending',pair}),close:()=>{}})}})
  const connection=service.connect({address:'127.0.0.1',port:47831});await began.promise
  await service.disconnect({confirmed:true});late.resolve(pair);await assert.rejects(connection)
  assert.equal(service.getState().pendingPair,null);assert.equal(service.getState().status,'personal');await service.dispose()
 }},
 {name:'OS encryption finishing after disconnect cannot recreate a credential file or config reference',async run(ctx){
  const {db,repo}=setup(ctx),encryption=deferred<Buffer>(),encrypting=deferred<void>()
  const protectedSecrets=createProtectedSecrets(ctx.tempDir,{...vault,encryptStringAsync:()=>{encrypting.resolve();return encryption.promise}})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>protectedSecrets,transport:{discover:async()=>({hostId,serverName:'host',certificate:'cert',pin:'pin'}),client:options=>({beginPair:async()=>pair,confirmPair:async()=>{await options.persistence.save({address:options.address,trust:options.trust,datasetId,token:'secret',activation:'pending'});return {kind:'pending',pair}},poll:async()=>({kind:'pending',pair}),close:()=>{}})}})
  await service.connect({address:'127.0.0.1',port:47831})
  const confirm=service.confirmHost({pairId:pair.pairId,confirmed:true});await encrypting.promise
  await service.disconnect({confirmed:true});encryption.resolve(Buffer.from('cipher'));await assert.rejects(confirm)
  assert.equal(createSharingStore(db).getConfig().credentialRef,null)
  assert.equal(existsSync(join(ctx.tempDir,'sharing-secrets')),false);await service.dispose()
 }},
 {name:'confirmation deadline fences encryption that completes after timeout',async run(ctx){
  const {db,repo}=setup(ctx),encryption=deferred<Buffer>(),encrypting=deferred<void>()
  const protectedSecrets=createProtectedSecrets(ctx.tempDir,{...vault,encryptStringAsync:()=>{encrypting.resolve();return encryption.promise}})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>protectedSecrets,transport:{discover:async()=>({hostId,serverName:'host',certificate:'cert',pin:'pin'}),client:options=>({beginPair:async()=>pair,confirmPair:async()=>{await options.persistence.save({address:options.address,trust:options.trust,datasetId,token:'secret',activation:'pending'});return {kind:'pending',pair}},poll:async()=>({kind:'pending',pair}),close:()=>{}})}})
  await service.connect({address:'127.0.0.1',port:47831})
  const confirm=service.confirmHost({pairId:pair.pairId,confirmed:true});await encrypting.promise
  // Release after the protocol deadline. Even an uncancellable OS encryption must not commit.
  const release=setTimeout(()=>encryption.resolve(Buffer.from('cipher')),5100)
  try{await assert.rejects(confirm);await new Promise(resolve=>setTimeout(resolve,150));assert.equal(createSharingStore(db).getConfig().credentialRef,null);assert.equal(existsSync(join(ctx.tempDir,'sharing-secrets')),false);assert.notEqual(service.getState().status,'connected')}
  finally{clearTimeout(release);encryption.resolve(Buffer.from('cipher'));await service.dispose()}
 }},
 {name:'real host/member service pairs, commits a filtered cache, forces sync and purges on pinned revocation',async run(ctx){
  const hostProfile=join(ctx.tempDir,'host');mkdirSync(hostProfile)
  const hostDb=setup({...ctx,tempDir:hostProfile}),hostStore=createSharingStore(hostDb.db)
  hostStore.configureHost({address:'127.0.0.1',port:47831})
  const device=hostStore.saveDevice({name:'Member',ip:'127.0.0.1'})
  const project=hostStore.saveProject({name:'LAN',color:'#2563EB',participants:[{name:'Member',deviceId:device.id}]})
  hostDb.repo.createSchedule({projectId:project.id,name:'Shared alarm',startDate:'2026-11-11',endDate:'2026-11-11'})
  hostDb.repo.createProject({name:'Private',color:'#2563EB',participants:[]})
  const identity=await createHostIdentity(hostStore.getConfig().hostId),host=createSharingHost({identity,store:hostStore})
  const target=await host.start('127.0.0.1',0)
  const {db,repo}=setup(ctx),service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>createProtectedSecrets(ctx.tempDir,vault)})
  try{
   const pairing=await service.connect(target);assert(pairing.pendingPair);host.approve(pairing.pendingPair.pairId)
   const state=await service.confirmHost({pairId:pairing.pendingPair.pairId,confirmed:true});assert.equal(state.status,'connected')
   assert.equal(service.memberSnapshot().projects.length,1);assert.equal(service.memberSnapshot().projects[0].name,'LAN')
   const revision=state.snapshotRevision;await service.sync();assert.equal(service.getState().snapshotRevision,revision)
   const ref=createSharingStore(db).getConfig().credentialRef
   const edited=await service.connect(target);assert.equal(edited.status,'connected');assert.equal(edited.pendingPair,null);assert.equal(createSharingStore(db).getConfig().credentialRef,ref)
   assert.equal(await service.authorizeReminder(),true)
   hostStore.revokeDevice({id:device.id});await service.sync();assert.equal(service.getState().status,'revoked');assert.equal(service.memberSnapshot().projects.length,0)
   assert.equal(await service.authorizeReminder(),false)
   const replacement=await createHostIdentity(identity.hostId)
   await assert.rejects(pinnedRequest({address:target,trust:replacement,path:'/v1/identity'}),(error:any)=>error.code==='TLS_UNTRUSTED')
  }finally{await service.dispose();await host.stop()}
 }},
 {name:'resume discards an old response and refreshes before shared reminder authorization',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),identity=await createHostIdentity(hostId),protectedSecrets=createProtectedSecrets(ctx.tempDir,vault),ref='a'.repeat(32)
  const connection={address:{address:'127.0.0.1',port:47831},trust:identity,datasetId,token:'token',activation:'active' as const}
  await protectedSecrets.write(ref,connection,()=>true)
  store.connectMember({...connection.address,hostId,datasetId,certificatePin:identity.pin,credentialRef:ref})
  const late=deferred<any>(),started=deferred<void>();let clients=0
  const wire={protocolVersion:1 as const,hostId,datasetId,projects:[{id:'1',name:'Current',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[]}
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>protectedSecrets,transport:{client:()=>{const number=++clients;return {beginPair:async()=>pair,confirmPair:async()=>({kind:'pending',pair}),poll:async()=>{if(number===1){started.resolve();return late.promise}return {kind:'snapshot',snapshot:wire,etag:'current'}},close:()=>{}}}}})
  const initial=service.start();await started.promise;await service.suspend();assert.equal(await service.authorizeReminder(),false)
  await service.resume();assert.equal(service.getState().status,'connected');assert.equal(service.memberSnapshot().projects[0].name,'Current')
  late.resolve({kind:'snapshot',snapshot:{...wire,projects:[{...wire.projects[0],name:'Stale'}]},etag:'stale'});await initial
  assert.equal(service.memberSnapshot().projects[0].name,'Current');assert.equal(await service.authorizeReminder(),true);await service.dispose()
 }},
 {name:'host service persists protected identity and restores desired hosting without issuing a new certificate',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),probe=createServer()
  await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const bound=probe.address();assert(bound&&typeof bound!=='string');const port=bound.port
  await new Promise<void>(resolve=>probe.close(()=>resolve()))
  const options={storage:{state:'ready' as const,db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>createProtectedSecrets(ctx.tempDir,vault)}
  const first=createSharingService(options)
  await first.configureHost({address:'127.0.0.1',port});assert.equal(existsSync(join(ctx.tempDir,'sharing-secrets')),false)
  await first.setHosting({enabled:true});assert.equal(first.getState().status,'connected');const before=store.getConfig();assert(before.certificateRef);assert(existsSync(join(ctx.tempDir,'sharing-secrets',before.certificateRef)))
  await first.dispose();assert.equal(store.getConfig().hostingEnabled,true)
  const second=createSharingService({...options,transport:{identity:async()=>{throw Error('identity must survive restart')}}})
  try{await second.start();assert.equal(second.getState().status,'connected');assert.equal(store.getConfig().certificatePin,before.certificatePin);await second.setHosting({enabled:false});assert.equal(second.getState().status,'stopped')}
  finally{await second.dispose()}
 }},
 {name:'resume reports host stop storage failure without escaping into the personal lifecycle',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db);store.configureHost({address:'127.0.0.1',port:47831});store.setHosting({enabled:true})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>createProtectedSecrets(ctx.tempDir,vault),transport:{host:()=>({start:async(address,port)=>({address,port}),stop:async()=>{throw Error('disk failure')},pending:()=>[],approve:()=>{},dispose:async()=>{}})}})
  await service.start();assert.equal(service.getState().status,'connected');await assert.doesNotReject(service.resume());assert.equal(service.getState().status,'error');await service.dispose()
 }},
 {name:'orderly host disposal preserves desired hosting and refuses an unselected bind interface',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db);store.configureHost({address:'127.0.0.1',port:47831});store.setHosting({enabled:true})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},transport:{interfaces:()=>[]}})
  await service.start();assert.equal(service.getState().status,'error');assert.equal(store.getConfig().hostingEnabled,true)
  await assert.rejects(service.configureHost({address:'0.0.0.0',port:47831}));await assert.rejects(service.disconnect({confirmed:true}))
  await service.dispose();await service.dispose();assert.equal(store.getConfig().hostingEnabled,true)
 }},
 {name:'service facade combines namespaced member cache and protects source/participants while personal CRUD stays independent',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  const local=repo.createProject({name:'Legacy',color:'#2563EB',participants:['Read only']})
  store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'1'.repeat(32)})
  store.applyCache({protocolVersion:1,hostId,datasetId,projects:[{...local,name:'Remote'}],schedules:[{id:'1',projectId:local.id,name:'Shared',startDate:'2026-11-11',endDate:'2026-11-11',createdAt:'t',updatedAt:'t'}]})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{}})
  ctx.defer(()=>{void service.dispose()})
  const state={state:'ready' as const,db,repository:service.repository}
  const call=(method:string,value?:unknown)=>dispatch(state,method,value===undefined?[]:[value],true)
  const snapshot=call('getSnapshot');assert(snapshot.ok);assert.equal((snapshot.data as any).projects.length,2)
  assert.equal(call('createProject',{name:'Forbidden',color:'#2563EB',participants:['X']}).ok,false)
  assert.equal(call('updateProject',{...local,createdAt:undefined}).ok,false)
  const changed=call('updateProject',{id:local.id,name:'Renamed',color:local.color,participants:[]});assert.equal(changed.ok,false)
  const valid=call('updateProject',{id:local.id,name:'Renamed',color:local.color,participants:local.participants});assert(valid.ok)
  assert.equal(call('createProject',{name:'Personal',color:'#2563EB',participants:[]}).ok,true)
  assert.equal(call('deleteSchedule',{id:sharedId(hostId,datasetId,'1')}).ok,false)
  const id=sharedId(hostId,datasetId,'1'),reminder={daysBefore:0,time:'09:00',start:true,end:false}
  service.saveReminder({id,reminder});assert.equal(store.readCache().schedules[0].reminder.start,true)
  store.clearCache();assert.throws(()=>service.saveReminder({id,reminder}))
  assert.equal(repo.getSnapshot().projects.find(p=>p.id===local.id)?.participants[0],'Read only')
 }},
 {name:'legacy host shared project update preserves ACL and delivery identity; invalid endpoint cannot clear recipients',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db);store.configureHost({address:'127.0.0.1',port:47831})
  const device=store.saveDevice({name:'Member',ip:'127.0.0.2'}),project=store.saveProject({name:'Shared',color:'#2563EB',participants:[{name:'Member',deviceId:device.id}]})
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{}});ctx.defer(()=>{void service.dispose()})
  service.repository.updateProject({id:project.id,name:'Renamed',color:project.color,participants:['Member']})
  assert.equal(store.listSharedProjects()[0].participants[0].deviceId,device.id)
  assert.throws(()=>service.repository.updateProject({id:project.id,name:'Bad',color:project.color,participants:[]}))
  assert.equal(store.getWireSnapshot(device.id).projects[0].name,'Renamed')
  assert.equal(service.repository.getSnapshot().projects[0].sharing,'host')
 }},
 {name:'explicit disconnect allows a new same-host pin only through another approved pairing',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'old-pin',credentialRef:'1'.repeat(32)})
  store.disconnectMember({confirmed:true})
  let pairs=0
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},transport:{discover:async()=>({hostId,serverName:'host',certificate:'cert',pin:'replacement-pin'}),client:()=>({beginPair:async()=>{pairs++;return pair},confirmPair:async()=>({kind:'pending',pair}),poll:async()=>({kind:'pending',pair}),close:()=>{}})}})
  const state=await service.connect({address:'127.0.0.1',port:47831});assert.equal(state.status,'pairing');assert.equal(pairs,1)
  assert.equal(store.getConfig().certificatePin,'old-pin');assert.equal(store.getConfig().role,'personal');await service.dispose()
 }},
 {name:'personal service startup never initializes safeStorage or starts a network',async run(ctx){
  const {db,repo}=setup(ctx);let accesses=0
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>{accesses++;throw Error('must stay lazy')}})
  await service.start();assert.equal(accesses,0);assert.equal(service.getState().status,'personal');await service.dispose();await service.dispose()
 }}
]
