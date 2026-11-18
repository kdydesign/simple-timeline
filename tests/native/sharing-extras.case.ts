import assert from 'node:assert/strict'
import {setup,type NativeCase} from './helpers'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createPersonalHolidays} from '../../src/main/db/personal-holidays'
import {createSharingExtras} from '../../src/main/db/sharing/extras'
import {createNotificationStore} from '../../src/main/db/notifications'
import {createPairingNotifications} from '../../src/main/notifications/pairing'
import {createSharingService} from '../../src/main/sharing/service'
import {createSharingHost} from '../../src/main/sharing/host'
import {pinnedRequest} from '../../src/main/sharing/transport'
import {createHostIdentity} from '../../src/main/sharing/identity'
import {createProtectedSecrets} from '../../src/main/sharing/secrets'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
const hostId='11111111-1111-4111-8111-111111111111',datasetId='22222222-2222-4222-8222-222222222222'
export const cases:NativeCase[]=[
 {name:'real TLS holidays reach members without projects, survive outage, reject invalid refresh, and purge on revocation',async run(ctx){
  const profile=join(ctx.tempDir,'host');mkdirSync(profile)
  const h=setup({...ctx,tempDir:profile}),store=createSharingStore(h.db),extras=createSharingExtras(h.db)
  store.configureHost({address:'127.0.0.1',port:47831});const device=store.saveDevice({name:'Member',ip:'127.0.0.1'})
  let invalid=false
  const identity=await createHostIdentity(store.getConfig().hostId),host=createSharingHost({identity,store,holidays:()=>invalid?{invalid:true}:extras.hostCalendar(),onSyncComplete:(id,version)=>extras.recordVersion(id,version)})
  const target=await host.start('127.0.0.1',0),m=setup(ctx)
  const vault={isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'kwallet',encryptStringAsync:async(v:string)=>Buffer.from(v),decryptStringAsync:async(v:Buffer)=>({result:v.toString(),shouldReEncrypt:false})}
  let notifications=0
  const service=createSharingService({storage:{state:'ready',db:m.db,repository:m.repo},profile:ctx.tempDir,changed:()=>{},appVersion:'0.8.6',secrets:async()=>createProtectedSecrets(ctx.tempDir,vault),changeSender:async()=>{notifications++;return 'submitted'}})
  try{
   const pair=await service.connect(target);assert(pair.pendingPair);host.approve(pair.pendingPair.pairId)
   await service.confirmHost({pairId:pair.pendingPair.pairId,confirmed:true});await service.sync()
   assert.equal(service.memberSnapshot().projects.length,0);assert.equal(service.getState().holidays?.status,'current')
   assert.equal(extras.versions()[device.id].version,'0.8.6')
   const count=()=>h.db.prepare('SELECT COUNT(*) AS n FROM sharing_change_events').get()
   const before=count(),sent=notifications,calendar={weekdays:[3],dates:[{date:'2026-11-20',endDate:'2026-11-22',name:'창립기념일'}]}
   extras.saveCalendar(calendar);const revision=extras.hostCalendar().revision
   const connection=service.getUpdateContext().connection!;assert(connection)
   const responses=[]
   for(const path of ['/v1/holidays','/v1/holidays/ranges'])responses.push({path,response:await pinnedRequest({...connection,path})})
   createPersonalHolidays(h.db).save({weekdays:[1],dates:[{date:'2026-11-26',name:'호스트 비공개 연차'}]})
   service.savePersonalHolidays({calendar:{weekdays:[2],dates:[{date:'2026-11-27',name:'멤버 비공개 연차'}]}})
   for(const {path,response} of responses){
    assert.equal(response.status,200)
    const fresh=await pinnedRequest({...connection,path})
    assert.deepEqual(fresh,response);assert.equal(JSON.stringify(fresh.body).includes('비공개'),false)
    assert.equal((await pinnedRequest({...connection,path,etag:response.etag})).status,304)
   }
   await service.sync();assert.equal(extras.hostCalendar().revision,revision);assert.equal(service.getState().personalHolidays?.dates[0].name,'멤버 비공개 연차')
   assert.deepEqual(service.getState().holidays?.calendar,calendar);assert.deepEqual(count(),before);assert.equal(notifications,sent)
   invalid=true;await service.sync();assert.equal(service.getState().holidays?.status,'error');assert.deepEqual(service.getState().holidays?.calendar,calendar)
   invalid=false;await service.sync();assert.equal(service.getState().holidays?.status,'current')
   await host.stop();await service.sync();assert.equal(service.getState().holidays?.status,'stale');assert.deepEqual(service.getState().holidays?.calendar,calendar)
   await host.start(target.address,target.port);await service.sync();assert.equal(service.getState().holidays?.status,'current')
   store.revokeDevice({id:device.id});await service.sync();assert.equal(service.getState().status,'revoked');assert.equal(createSharingExtras(m.db).cachedCalendar(),null);assert.deepEqual(service.getState().holidays?.calendar,{weekdays:[],dates:[]})
  }finally{await service.dispose();await host.stop()}
 }},
 {name:'pair notification click opens current settings and failed deliveries never repeat or escape global mute',async run(ctx){
  const {db}=setup(ctx),s=createSharingStore(db),x=createSharingExtras(db),policy=createNotificationStore(db);s.configureHost({address:'127.0.0.1',port:47831})
  const d=s.saveDevice({name:'A',ip:'127.0.0.1'});let sent=0,opened=0,click=()=>{},live=true
  const n=createPairingNotifications({store:x,policy,valid:()=>live,send:async(_m,c)=>{sent++;click=c;return 'failed'},open:()=>opened++,changed:()=>{}})
  const pair={pairId:'test-pair',deviceId:d.id,name:d.name,ip:d.ip,fingerprint:'unused',expiresAt:new Date(Date.now()+300000).toISOString()}
  await n.observe(pair);await n.observe(pair);assert.equal(sent,1);live=false;click();assert.equal(opened,1)
  live=true;policy.setMuted(true,()=>{});await n.observe({...pair,pairId:'new-pair'});assert.equal(sent,1)
  db.exec("CREATE TRIGGER fail_pair_claim BEFORE INSERT ON pairing_notification_deliveries BEGIN SELECT RAISE(ABORT,'test write failure'); END")
  await n.observe({...pair,pairId:'storage-failure'});assert.equal(n.error(),true);assert.equal(sent,1)
  n.dispose();click();assert.equal(opened,1)
 }},
 {name:'common holidays require host role, are atomic and never create schedule change events',run(ctx){
  const {db,repo}=setup(ctx),s=createSharingStore(db),x=createSharingExtras(db)
  assert.throws(()=>x.saveCalendar({weekdays:[],dates:[]}))
  s.configureHost({address:'127.0.0.1',port:47831})
  const before=repo.getSnapshot();const h=x.saveCalendar({weekdays:[3],dates:[{date:'2028-02-29',name:'윤일'}]})
  assert.deepEqual(h.calendar.weekdays,[3]);assert.equal(x.hostCalendar().revision,h.revision)
  assert.throws(()=>x.saveCalendar({weekdays:[6],dates:[{date:'2026-02-29',name:'실패'}]}))
  assert.deepEqual(x.hostCalendar(),h);assert.deepEqual(repo.getSnapshot(),before)
  const range=x.saveCalendar({weekdays:[3],dates:[{date:'2026-12-24',endDate:'2026-12-26',name:'연말 휴무'}]})
  assert.deepEqual(createSharingExtras(db).hostCalendar(),range)
  assert.throws(()=>x.saveCalendar({weekdays:[],dates:[...range.calendar.dates,{date:'2026-12-25',name:'겹침'}]}))
  assert.deepEqual(x.hostCalendar(),range)
  db.exec("CREATE TRIGGER fail_holiday_range BEFORE UPDATE ON sharing_holidays BEGIN SELECT RAISE(ABORT,'test disk write failure'); END")
  assert.throws(()=>x.saveCalendar({weekdays:[],dates:[]}));assert.deepEqual(x.hostCalendar(),range)
  db.exec('DROP TRIGGER fail_holiday_range')
 }},
 {name:'member holiday cache rejects another host and clears on explicit disconnect',run(ctx){
  const {db}=setup(ctx),s=createSharingStore(db),x=createSharingExtras(db)
  s.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'ref'})
  const envelope={schemaVersion:1 as const,hostId,datasetId,revision:hostId,calendar:{weekdays:[3],dates:[]}}
  x.applyCalendar(envelope);assert.deepEqual(x.cachedCalendar()?.envelope,envelope)
  assert.throws(()=>x.applyCalendar({...envelope,hostId:datasetId}));assert.deepEqual(x.cachedCalendar()?.envelope,envelope)
  db.exec("CREATE TRIGGER fail_holiday_cache BEFORE UPDATE ON sharing_holiday_cache BEGIN SELECT RAISE(ABORT,'test disk write failure'); END")
  assert.throws(()=>x.applyCalendar({...envelope,calendar:{weekdays:[],dates:[]}}));assert.deepEqual(x.cachedCalendar()?.envelope,envelope)
  db.exec('DROP TRIGGER fail_holiday_cache')
  s.disconnectMember({confirmed:true});assert.equal(x.cachedCalendar(),null)
 }},
 {name:'reported versions preserve offline last report, coalesce writes, and reset on installation replacement',run(ctx){
  const {db}=setup(ctx),s=createSharingStore(db),x=createSharingExtras(db);s.configureHost({address:'127.0.0.1',port:47831})
  const d=s.saveDevice({name:'A',ip:'127.0.0.1',installationId:hostId})
  x.recordVersion(d.id,'0.8.6',100000);x.recordVersion(d.id,'0.8.6',102000)
  assert.equal(x.versions()[d.id].checkedAt,new Date(100000).toISOString());assert.equal(createSharingExtras(db).versions()[d.id].version,'0.8.6')
  x.recordVersion(d.id,undefined,103000);assert.equal(x.versions()[d.id].version,null)
  s.saveDevice({id:d.id,name:'A',ip:'127.0.0.1',installationId:datasetId});assert.equal(x.versions()[d.id],undefined)
 }},
 {name:'pair notices persist request dedup and one-minute device limit and do not replay muted requests',run(ctx){
  const {db}=setup(ctx),s=createSharingStore(db),x=createSharingExtras(db),policy=createNotificationStore(db);s.configureHost({address:'127.0.0.1',port:47831})
  const d=s.saveDevice({name:'A',ip:'127.0.0.1'})
  assert.equal(x.claimPair(d.id,'p1',100000),true);assert.equal(x.claimPair(d.id,'p1',200000),false)
  assert.equal(x.claimPair(d.id,'p2',159999),false);assert.equal(x.claimPair(d.id,'p3',160000),true)
  policy.setMuted(true,()=>{});assert.equal(x.claimPair(d.id,'p4',230000),false)
  policy.setMuted(false,()=>{});assert.equal(createSharingExtras(db).claimPair(d.id,'p4',300000),false)
  s.deleteDevice({id:d.id});assert.equal(x.claimPair(d.id,'p5',400000),false)
 }},
]
