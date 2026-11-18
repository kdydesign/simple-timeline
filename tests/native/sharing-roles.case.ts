import assert from 'node:assert/strict'
import {openDatabase,createRepository} from '../../src/main/db/repository'
import {initializeStorage} from '../../src/main/db/lifecycle'
import {setup,type NativeCase} from './helpers'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createSharingService} from '../../src/main/sharing/service'
import {createReminderStore} from '../../src/main/db/reminders'
import {dueReminders} from '../../src/domain/reminder'
import {createHostIdentity} from '../../src/main/sharing/identity'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'
import {createSharedReminderStore} from '../../src/main/db/sharing/cache'
import {createSharingExtras} from '../../src/main/db/sharing/extras'
const hostId='11111111-1111-4111-8111-111111111111',datasetId='22222222-2222-4222-8222-222222222222'
export const cases:NativeCase[]=[
 {name:'role switches preserve dormant originals and approvals but reject every dormant write and reminder claim',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  store.configureHost({address:'127.0.0.1',port:47831})
  store.setHostIdentity({certificatePin:'local-pin',certificateRef:'local-cert',privateKeyRef:'local-key'})
  const identity=store.getConfig(),device=store.saveDevice({name:'Member',ip:'127.0.0.2'})
  store.putCredential({deviceId:device.id,hash:'a'.repeat(64)});store.activateCredential('a'.repeat(64))
  const personal=repo.createProject({name:'Personal',color:'#2563EB',participants:[]})
  const project=store.saveProject({name:'Original',color:'#2563EB',participants:[{name:'Member',deviceId:device.id}]})
  const input={projectId:project.id,name:'Schedule',startDate:'2026-11-18',endDate:'2026-11-18',reminder:{daysBefore:0,time:'09:00',start:true,end:false}}
  const schedule=repo.createSchedule(input),calendar={weekdays:[2],dates:[]}
  createSharingExtras(db).saveCalendar(calendar)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},reminderClock:()=>new Date(2026,10,18,12)}) as any
  try{
   assert.equal(typeof service.switchRole,'function')
   await service.switchRole({role:'member',confirmed:true})
   assert.equal(service.getState().role,'member');assert.equal(service.getState().hostingEnabled,false)
   assert.deepEqual(service.repository.getSnapshot().projects.map((p:any)=>p.id),[personal.id])
   const dormant=service.getDormantData();assert.equal(dormant.projects[0].id,project.id);assert.equal(dormant.schedules[0].id,schedule.id);assert.deepEqual(dormant.holidays,calendar)
   assert.notDeepEqual(service.getState().holidays.calendar,calendar)
   for(const operation of [()=>service.repository.updateProject({...project,name:'Changed'}),()=>service.repository.deleteProject({id:project.id,confirmed:true}),()=>service.repository.createSchedule(input),()=>service.repository.updateSchedule({...schedule,name:'Changed'}),()=>service.repository.updateScheduleReminder({id:schedule.id,reminder:schedule.reminder}),()=>service.repository.deleteSchedule({id:schedule.id}),()=>repo.deleteSchedule({id:schedule.id}),()=>store.saveProject({id:project.id,name:'Changed',color:project.color,participants:[]})])assert.throws(operation)
   const due=dueReminders(schedule,new Date(2026,10,18,12));assert.equal(createReminderStore(db).claim(due,true).length,0)
   await service.switchRole({role:'host',confirmed:true})
   assert.equal(service.repository.getSnapshot().projects.length,2);assert.equal(store.getConfig().hostId,identity.hostId);assert.equal(store.getConfig().certificatePin,'local-pin')
   assert.equal(store.getDevice(device.id).approved,true);assert.equal(service.getState().hostingEnabled,false)
   assert.equal(createReminderStore(db).claim(due,true).length,0)
   assert.deepEqual(service.getDormantData().projects,[])
  }finally{await service.dispose()}
 }},
 {name:'failed member credential cleanup remains durable and restart finishes stopped without authenticating',async run(ctx){
  const {db,repo,file}=setup(ctx),store=createSharingStore(db),ref='b'.repeat(32)
  store.connectMember({address:'127.0.0.2',port:47832,hostId,datasetId,certificatePin:'remote-pin',credentialRef:ref})
  const p=repo.createProject({name:'Personal',color:'#2563EB',participants:[]})
  store.applyCache({protocolVersion:1,hostId,datasetId,projects:[{...p,name:'Remote'}],schedules:[{id:'1',projectId:p.id,name:'Remote schedule',startDate:'2026-11-18',endDate:'2026-11-18',createdAt:'t',updatedAt:'t'}]})
  store.saveReminder({id:store.readCache().schedules[0].id,reminder:{daysBefore:0,time:'09:00',start:true,end:false}})
  createSharedReminderStore(db).claim(dueReminders(store.readCache().schedules[0],new Date(2026,10,18,12)),false)
  let fail=true,network=0,removed=0
  const options={storage:{state:'ready' as const,db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>({read:async()=>{network++;throw Error('must not read')},write:async()=>{},remove:()=>{if(fail)throw Error('locked');removed++}}),transport:{discover:async()=>{network++;throw Error('must not discover')}}}
  const first=createSharingService(options) as any
  try{
   assert.equal(typeof first.switchRole,'function');await assert.rejects(first.switchRole({role:'host',confirmed:true}))
   assert.equal(first.getState().roleTransition.target,'host');assert.equal(first.getState().roleTransition.phase,'failed');assert.equal(store.getConfig().credentialRef,null)
   assert.equal(store.readCache().projects.length,0);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sharing_reminder_deliveries').get() as {n:bigint}).n,0n);assert.equal(repo.getSnapshot().projects[0].id,p.id)
   await assert.rejects(first.connect({address:'127.0.0.2',port:47832}))
  }finally{await first.dispose()}
  db.close();const reopened=openDatabase(file,true);ctx.defer(()=>reopened.close())
  const restored=createSharingStore(reopened)
  options.storage={state:'ready',db:reopened,repository:createRepository(reopened)}
  fail=false;const second=createSharingService(options) as any
  try{
   await second.start();assert.equal(removed,1);assert.equal(network,0);assert.equal(second.getState().role,'host');assert.equal(second.getState().roleTransition,null);assert.equal(second.getState().status,'stopped')
   await second.switchRole({role:'member',confirmed:true});assert.equal(restored.getConfig().address,'127.0.0.2');assert.equal(restored.getConfig().certificatePin,'remote-pin');assert.equal(restored.getConfig().credentialRef,null);assert.equal(restored.getConfig().remoteHostId,hostId)
   await second.start();assert.equal(second.getState().status,'stopped');assert.equal(network,0)
  }finally{await second.dispose()}
 }},
 {name:'network stop and update withdrawal failures keep a durable disabled intent and block concurrent starts',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  store.configureHost({address:'127.0.0.1',port:47831});store.setHosting({enabled:true})
  let release!:()=>void,stopFails=true,withdrawFails=true,withdrawals=0
  const stopping=new Promise<void>(resolve=>release=resolve)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},
   beforeRoleSwitch:async()=>{withdrawals++;if(withdrawFails)throw Error('withdraw failed')},
   secrets:async()=>({read:async()=>{throw Error('unused')},write:async()=>{},remove:()=>{}}),
   transport:{host:()=>({start:async(address,port)=>({address,port}),stop:async()=>{await stopping;if(stopFails)throw Error('stop failed')},pending:()=>[],needsApproval:()=>false,approve:()=>{},dispose:async()=>{}})}}) as any
  try{
   await service.start();assert.equal(service.getState().status,'connected')
   const pending=service.switchRole({role:'member',confirmed:true});void pending.catch(()=>{})
   assert.equal(store.getConfig().hostingEnabled,false);assert.equal(service.getUpdateContext().role,'personal')
   await assert.rejects(service.switchRole({role:'host',confirmed:true}));await assert.rejects(service.setHosting({enabled:true}))
   release();await assert.rejects(pending);assert.equal(service.getState().roleTransition.phase,'failed')
   assert.equal(service.getState().holidays.status,'pending')
   stopFails=false;await assert.rejects(service.switchRole({role:'member',confirmed:true}));assert.equal(withdrawals,1)
   withdrawFails=false;await service.switchRole({role:'member',confirmed:true});assert.equal(withdrawals,2);assert.equal(service.getState().status,'stopped');assert.equal(service.getState().dormantAvailable,true)
  }finally{release();await service.dispose()}
 }},
 {name:'remote trust never overwrites preserved local host identity across repeated role switches',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  store.configureHost({address:'127.0.0.1',port:47831});store.setHostIdentity({certificatePin:'local-pin',certificateRef:'local-cert',privateKeyRef:'local-key'})
  const id=store.getConfig().hostId
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>({read:async()=>{throw Error('unused')},write:async()=>{},remove:()=>{}})}) as any
  try{
   await service.switchRole({role:'member',confirmed:true})
   store.connectMember({address:'127.0.0.2',port:47832,hostId,datasetId,certificatePin:'remote-pin',credentialRef:'a'.repeat(32)})
   await service.switchRole({role:'host',confirmed:true})
   assert.equal(store.getConfig().hostId,id);assert.equal(store.getConfig().address,'127.0.0.1');assert.equal(store.getConfig().port,47831);assert.equal(store.getConfig().certificatePin,'local-pin');assert.equal(store.getConfig().privateKeyRef,'local-key')
   await service.switchRole({role:'member',confirmed:true})
   assert.equal(store.getConfig().address,'127.0.0.2');assert.equal(store.getConfig().port,47832);assert.equal(store.getConfig().certificatePin,'remote-pin');assert.equal(store.getConfig().privateKeyRef,null);assert.equal(store.getConfig().credentialRef,null)
   assert.throws(()=>store.connectMember({address:'127.0.0.3',port:47832,hostId:datasetId,datasetId,certificatePin:'other-pin',credentialRef:'c'.repeat(32)}))
  }finally{await service.dispose()}
 }}
,
 {name:'transition immediately hides received cache and rejects personal writes while update withdrawal waits',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db)
  store.connectMember({address:'127.0.0.2',port:47832,hostId,datasetId,certificatePin:'remote-pin',credentialRef:'b'.repeat(32)})
  const p=repo.createProject({name:'Personal',color:'#2563EB',participants:[]})
  store.applyCache({protocolVersion:1,hostId,datasetId,projects:[{...p,name:'Remote'}],schedules:[]})
  let release!:()=>void
  const blocked=new Promise<void>(resolve=>release=resolve)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},beforeRoleSwitch:()=>blocked,secrets:async()=>({read:async()=>{throw Error('unused')},write:async()=>{},remove:()=>{}})}) as any
  try{
   const pending=service.switchRole({role:'host',confirmed:true});void pending.catch(()=>{})
   assert.deepEqual(service.repository.getSnapshot().projects.map((p:any)=>p.name),['Personal'])
   assert.throws(()=>service.repository.createProject({name:'Busy',color:'#2563EB',participants:[]}))
   release();await pending
  }finally{release();await service.dispose()}
 }}
,
 {name:'a missing role transition journal blocks startup rather than reverting to legacy auto-start behavior',async run(ctx){
  const state=await initializeStorage(ctx.tempDir);assert.equal(state.state,'ready');if(state.state!=='ready')return
  state.db.exec('DROP TABLE sharing_role_state');state.db.close()
  const reopened=await initializeStorage(ctx.tempDir)
  if(reopened.state==='ready')ctx.defer(()=>reopened.db.close())
  assert.equal(reopened.state,'blocked')
 }}
,
 {name:'a delayed member snapshot cannot repopulate received data after switching to host',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),identity=await createHostIdentity(hostId)
  const vault=createProtectedSecrets(ctx.tempDir,{isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'kwallet',encryptStringAsync:async(v:string)=>Buffer.from(v),decryptStringAsync:async(v:Buffer)=>({result:v.toString(),shouldReEncrypt:false})})
  const ref='e'.repeat(32),connection={address:{address:'127.0.0.2',port:47832},trust:identity,datasetId,token:'token',activation:'active' as const}
  await vault.write(ref,connection,()=>true);store.connectMember({...connection.address,hostId,datasetId,certificatePin:identity.pin,credentialRef:ref})
  let release!:(v:any)=>void,started!:()=>void
  const late=new Promise<any>(resolve=>release=resolve),polling=new Promise<void>(resolve=>started=resolve)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>vault,transport:{client:()=>({beginPair:async()=>{throw Error('unused')},confirmPair:async()=>{throw Error('unused')},poll:async()=>{started();return late},close:()=>{}})}})
  try{
   const initial=service.start();await polling
   await service.switchRole({role:'host',confirmed:true})
   release({kind:'snapshot',snapshot:{protocolVersion:1,hostId,datasetId,projects:[{id:'1',name:'Stale',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[]},etag:'old'})
   await initial
   assert.equal(service.getState().role,'host');assert.equal(service.getState().status,'stopped');assert.deepEqual(service.repository.getSnapshot().projects,[]);assert.deepEqual(store.readCache().projects,[]);assert.equal(await service.authorizeReminder(),false)
  }finally{await service.dispose()}
 }}

]
