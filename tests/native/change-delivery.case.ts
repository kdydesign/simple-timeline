import assert from 'node:assert/strict'
import {setup,type NativeCase} from './helpers'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createChangeInbox} from '../../src/main/db/sharing/change-inbox'
import {validateChangeEnvelope} from '../../src/domain/change-notifications'
import {createChangeNotifications} from '../../src/main/sharing/change-notifications'
import {createSharingService} from '../../src/main/sharing/service'
import {createSharingHost} from '../../src/main/sharing/host'
import {createHostIdentity} from '../../src/main/sharing/identity'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import type {ChangeEnvelope} from '../../src/shared/change-notifications'
const hostId='11111111-1111-4111-8111-111111111111',datasetId='22222222-2222-4222-8222-222222222222'
const envelope=():ChangeEnvelope=>({version:1,cursor:'a'.repeat(64),mode:'delta',snapshot:{protocolVersion:1,hostId,datasetId,projects:[{id:'1',name:'P',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[]},notices:[{id:'notice',projectId:'1',title:'P',body:'P 프로젝트가 공유되었습니다.',target:{kind:'project',id:'1'}}]})
export const cases:NativeCase[]=[
 {name:'late native definite failure updates submitted but cannot revive scrubbed or disabled detail',run(ctx){
  const {db}=setup(ctx),store=createSharingStore(db);store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'ref'})
  const inbox=createChangeInbox(db);inbox.apply(envelope());const n=inbox.pending()[0];assert(inbox.claim(n.id));inbox.finish(n.id,'submitted')
  Reflect.apply(inbox.finish,null,[n.id,'failed',n]);assert.equal(inbox.issues().failed,1,'late definite failure must be durable')
  inbox.retry();const retry=inbox.pending()[0];assert(inbox.claim(retry.id));inbox.finish(retry.id,'unknown');Reflect.apply(inbox.finish,null,[retry.id,'failed',retry]);assert.equal(inbox.issues().failed,1)
  inbox.revoke();Reflect.apply(inbox.finish,null,[retry.id,'failed',retry]);assert.equal(inbox.issues().failed,0)
  inbox.reset();inbox.apply(envelope());const disabled=inbox.pending()[0];assert(inbox.claim(disabled.id));inbox.finish(disabled.id,'submitted');inbox.setEnabled(false);Reflect.apply(inbox.finish,null,[disabled.id,'failed',disabled]);assert.equal(inbox.issues().failed,0)
 }},
 {name:'valid long and control-character source names preserve snapshot but fit change presentation',run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db);store.configureHost({address:'127.0.0.1',port:47831})
  const device=store.saveDevice({name:'A',ip:'127.0.0.2',installationId:hostId}),name='Long\u0001'+ '가'.repeat(2300)
  const project=store.saveProject({name,color:'#2563EB',participants:[{name:'A',deviceId:device.id}]});const first=store.getChangeSnapshot(device.id,null,false)
  const shared=store.getChangeSnapshot(device.id,first.cursor,false)
  const p=repo.createProject({name:'Other',color:'#2563EB',participants:[]});const base=store.getChangeSnapshot(device.id,shared.cursor,false)
  store.saveProject({id:p.id,name,color:p.color,participants:[{name:'A',deviceId:device.id}]});const grant=store.getChangeSnapshot(device.id,base.cursor,false)
  assert.equal(grant.snapshot.projects.find(p=>p.id===project.id)?.name,name);validateChangeEnvelope(grant)
  assert(grant.notices[0].title.length<=256);assert(grant.notices[0].body.length<=2048);assert(!grant.notices[0].body.includes('\u0001'))
  const memberProfile=join(ctx.tempDir,'member');mkdirSync(memberProfile);const m=setup({...ctx,tempDir:memberProfile}),ms=createSharingStore(m.db)
  ms.connectMember({address:'127.0.0.1',port:47831,hostId:grant.snapshot.hostId,datasetId:grant.snapshot.datasetId,certificatePin:'pin',credentialRef:'ref'})
  const inbox=createChangeInbox(m.db);inbox.apply(base);inbox.apply(grant)
  repo.createSchedule({projectId:p.id,name,startDate:'2026-11-11',endDate:'2026-11-11'});const updated=store.getChangeSnapshot(device.id,grant.cursor,false);inbox.apply(updated)
  assert.equal(inbox.pending().length,1);assert.equal(inbox.pending()[0].body,grant.notices[0].body);assert.equal(inbox.pending()[0].target.kind,'project')
  repo.createSchedule({projectId:project.id,name,startDate:'2026-11-11',endDate:'2026-11-11'});validateChangeEnvelope(store.getChangeSnapshot(device.id,grant.cursor,false))
  const hidden=store.saveProject({name:'\u0001',color:'#2563EB',participants:[{name:'A',deviceId:device.id}]});const sanitized=store.getChangeSnapshot(device.id,updated.cursor,false);validateChangeEnvelope(sanitized);assert.equal(sanitized.snapshot.projects.find(p=>p.id===hidden.id)?.name,'\u0001')
 }}
]

const vault={isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'isolated-test',encryptStringAsync:async(v:string)=>Buffer.from(v),decryptStringAsync:async(v:Buffer)=>({result:v.toString(),shouldReEncrypt:false})}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve))
async function until(predicate:()=>boolean){const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for change state');await new Promise(resolve=>setTimeout(resolve,10))}}
cases.push({name:'member change service commits before OS, deduplicates, retries and validates typed clicks and OFF baseline',async run(ctx){
 const hostProfile=join(ctx.tempDir,'host');mkdirSync(hostProfile);const h=setup({...ctx,tempDir:hostProfile}),hs=createSharingStore(h.db)
 hs.configureHost({address:'127.0.0.1',port:47831});const device=hs.saveDevice({name:'Member',ip:'127.0.0.1'}),p=hs.saveProject({name:'P',color:'#2563EB',participants:[{name:'Member',deviceId:device.id}]})
 const schedule=h.repo.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-11'}),identity=await createHostIdentity(hs.getConfig().hostId),host=createSharingHost({identity,store:hs}),target=await host.start('127.0.0.1',0)
 const {db,repo}=setup(ctx),inbox=createChangeInbox(db),sent:any[]=[],clicks:(()=>void)[]=[],failures:(()=>void)[]=[];let result:'submitted'|'failed'|'unknown'='submitted',shown=0
 const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>createProtectedSecrets(ctx.tempDir,vault),changeSender:async(message:any,onClick:()=>void,onFailure?:()=>void)=>{
  assert(inbox.cursor(),'cursor must commit before OS');assert.equal((db.prepare("SELECT count(*) n FROM sharing_change_inbox WHERE state='claimed'").get() as any).n,1n);sent.push(message);clicks.push(onClick);failures.push(onFailure!);return result
 },onChangeClick:()=>{shown++}} as any)
 try{
  const pair=(await service.connect(target)).pendingPair!;host.approve(pair.pairId);await service.confirmHost({pairId:pair.pairId,confirmed:true});await flush()
  assert.equal(sent.length,1,'initial notification');assert.equal((service.getState() as any).changeNotifications.supported,true)
  await service.sync();await flush();assert.equal(sent.length,1)
  h.repo.updateSchedule({...schedule,name:'Changed'});await service.sync();await flush();assert.equal(sent.length,2)
  clicks[1]();await until(()=>!!(service.getState() as any).changeNotifications.openRequest);const open=(service.getState() as any).changeNotifications.openRequest;assert.equal(open.target.kind,'schedule');assert.equal(shown,1)
  Reflect.get(service,'acknowledgeChange')({token:'wrong'});assert.equal((service.getState() as any).changeNotifications.openRequest.token,open.token);Reflect.get(service,'acknowledgeChange')({token:open.token});assert.equal((service.getState() as any).changeNotifications.openRequest,null)
  failures[1]();assert.equal((service.getState() as any).changeNotifications.failed,1);await service.sync();assert.equal(sent.length,2)
  await Reflect.get(service,'retryChangeNotifications')();await flush();assert.equal(sent.length,3)
  Reflect.get(service,'setChangeNotifications')({enabled:false});h.repo.updateSchedule({...schedule,name:'While off'});await service.sync();await flush();assert.equal(sent.length,3)
  Reflect.get(service,'setChangeNotifications')({enabled:true});assert.equal((service.getState() as any).changeNotifications.baselining,true);await service.sync();await flush();assert.equal(sent.length,3)
  result='unknown';h.repo.updateSchedule({...schedule,name:'Unknown'});await service.sync();await flush();assert.equal(sent.length,4);await Reflect.get(service,'retryChangeNotifications')();assert.equal(sent.length,4)
  h.repo.deleteSchedule({id:schedule.id});await service.sync();await flush();clicks[3]();await until(()=>!!(service.getState() as any).changeNotifications.openRequest);assert.equal((service.getState() as any).changeNotifications.openRequest.target.kind,'list')
  const before=inbox.cursor(),count=sent.length;db.exec("CREATE TRIGGER fail_change_apply BEFORE UPDATE ON sharing_change_settings BEGIN SELECT RAISE(ABORT,'full'); END");hs.saveProject({id:p.id,name:'Uncommitted',color:p.color,participants:[{name:'Member',deviceId:device.id}]});await service.sync();await flush();assert.equal(sent.length,count);assert.equal(inbox.cursor(),before);assert.equal(service.memberSnapshot().projects[0].name,'P');db.exec('DROP TRIGGER fail_change_apply')
  await service.sync();await flush();hs.revokeDevice({id:device.id});await service.sync();await flush();assert.equal(service.getState().status,'revoked');assert.equal(service.memberSnapshot().projects.length,0);assert.equal(sent.at(-1).body,'공유가 종료되었습니다.');const after=sent.length;failures[1]();assert.equal(inbox.issues().failed,0);await service.sync();assert.equal(sent.length,after)
 }finally{await service.dispose();await host.stop()}
}})
cases.push({name:'change settings are member-only and uncommitted preference failure never reports success',run(ctx){
 const {db,repo}=setup(ctx),service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{}})
 try{
  assert.throws(()=>Reflect.get(service,'setChangeNotifications')({enabled:false}));assert.equal(createChangeInbox(db).settings().enabled,true)
  createSharingStore(db).connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'ref'})
  db.exec("CREATE TRIGGER fail_preference BEFORE UPDATE ON sharing_change_settings BEGIN SELECT RAISE(ABORT,'full'); END")
  assert.throws(()=>Reflect.get(service,'setChangeNotifications')({enabled:false}));assert.equal(createChangeInbox(db).settings().enabled,true);assert.equal((service.getState() as any).changeNotifications.storageError,true)
 }finally{void service.dispose()}
}})

cases.push({name:'change click awaiting authorization cannot reopen navigation after preference OFF',async run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db);store.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'ref'})
 let click=()=>{},resolve!:(allowed:boolean)=>void,shown=0
 const authorization=new Promise<boolean>(r=>{resolve=r})
 const changes=createChangeNotifications({db,role:()=> 'member',generation:()=>0,connected:()=>true,revoked:()=>false,snapshot:()=>store.readCache(),authorize:()=>authorization,changed:()=>{},send:async(_message,onClick)=>{click=onClick;return 'submitted'},onClick:()=>{shown++}})
 changes.apply(envelope(),false);await changes.evaluate();click();changes.setEnabled({enabled:false});resolve(true);await flush()
 assert.equal(changes.state().openRequest,null);assert.equal(shown,0);changes.dispose()
}})
