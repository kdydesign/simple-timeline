import {initializeStorage} from '../../src/main/db/lifecycle'
import {migrations} from '../../src/main/db/migrations'
import {createUpdateNotifications} from '../../src/main/notifications/updates'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createChangeInbox} from '../../src/main/db/sharing/change-inbox'
import type {ChangeEnvelope} from '../../src/shared/change-notifications'
import assert from 'node:assert/strict'
import {setup,type NativeCase} from './helpers'
import {createNotificationStore} from '../../src/main/db/notifications'
import {createReminderStore} from '../../src/main/db/reminders'
import {dueReminders} from '../../src/domain/reminder'
import {createReminderEngine} from '../../src/main/reminders/engine'
import type {UpdateStatus} from '../../src/shared/updates'
const hostId='11111111-1111-4111-8111-111111111111'
const update=(version='0.9.0'):UpdateStatus=>({protocolVersion:1,hostId,revision:1,publication:{protocolVersion:1,hostId,revision:1,publicationId:'22222222-2222-4222-8222-222222222222',releaseId:'a'.repeat(64),manifest:{schemaVersion:1,appId:'com.kdydesign.simpletimeline',version,platform:'win32',arch:'x64',installerType:'nsis',installScope:'per-user',sourceSha:'a'.repeat(40),signed:false,validationUpdateOnly:false,files:[]}}})
export const cases:NativeCase[]=[
 {name:'v5 data and delivery state survive migration; missing policy metadata blocks reopening without resetting mute',async run(ctx){
  const old=await initializeStorage(ctx.tempDir,migrations.slice(0,5));assert.equal(old.state,'ready');if(old.state!=='ready')return
  const p=old.repository.createProject({name:'Keep',color:'#2563EB',participants:[]});old.db.close()
  const upgraded=await initializeStorage(ctx.tempDir);assert.equal(upgraded.state,'ready');if(upgraded.state!=='ready')return
  assert.equal(upgraded.repository.getSnapshot().projects[0].id,p.id);const policy=createNotificationStore(upgraded.db);policy.setMuted(true,()=>{});upgraded.db.close()
  const reopened=await initializeStorage(ctx.tempDir);assert.equal(reopened.state,'ready');if(reopened.state!=='ready')return
  assert.equal(createNotificationStore(reopened.db).state().muted,true);reopened.db.exec('DELETE FROM notification_settings');reopened.db.close()
  assert.equal((await initializeStorage(ctx.tempDir)).state,'blocked')
 }},
 {name:'a delayed Windows failure cannot revive a reminder across mute/unmute generations',async run(ctx){
  const {db,repo}=setup(ctx),policy=createNotificationStore(db),store=createReminderStore(db),now=new Date(2026,10,11,12)
  const p=repo.createProject({name:'P',color:'#2563EB',participants:[]});repo.createSchedule({name:'S',projectId:p.id,startDate:'2026-11-11',endDate:'2026-11-11',reminder:{daysBefore:0,time:'09:00',start:true,end:false}})
  let fail=()=>{};const engine=createReminderEngine({store,snapshot:()=>repo.getSnapshot(),clock:()=>now,muted:()=>policy.state().muted,generation:()=>policy.state().generation,send:async(_m,_c,f)=>{fail=f!;return 'submitted'},onChange:()=>{},onClick:()=>{}})
  await engine.evaluate();const settle=()=>store.suppress(repo.getSnapshot().schedules.flatMap(s=>dueReminders(s,now)))
  policy.setMuted(true,settle);policy.setMuted(false,settle);fail();assert.equal(store.issues().failed,0);await engine.dispose()
 }},
 {name:'update notification commits identity before native delivery, retains clicks and never repeats failed or muted versions',async run(ctx){
  const {db}=setup(ctx),policy=createNotificationStore(db);let sent=0,opened=0,click=()=>{}
  const notifier=createUpdateNotifications({store:policy,send:async(_m,c)=>{sent++;click=c;return 'failed'},open:()=>{opened++},changed:()=>{}})
  await notifier.observe(update(),0);await notifier.observe(update(),0);assert.equal(sent,1)
  policy.setMuted(true,()=>{});click();assert.equal(opened,1)
  await notifier.observe(update('0.10.0'),1);assert.equal(sent,1)
  policy.setMuted(false,()=>{});await notifier.observe(update('0.11.0'),1);assert.equal(policy.state().updatesResume,true)
  await notifier.observe(update('0.12.0'),2);assert.equal(policy.state().updatesResume,false);assert.equal(sent,1)
  await notifier.observe(update('0.13.0'),2);assert.equal(sent,2)
  notifier.dispose();click();assert.equal(opened,1)
 }},
 {name:'global mute preserves individual preference and cache while suppressing change replay through first current sync',run(ctx){
  const {db}=setup(ctx),policy=createNotificationStore(db),sharing=createSharingStore(db),datasetId='22222222-2222-4222-8222-222222222222'
  sharing.connectMember({address:'127.0.0.1',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'ref'})
  const inbox=createChangeInbox(db)
  const envelope=(c:string):ChangeEnvelope=>({version:1,cursor:c.repeat(64),mode:'delta',snapshot:{protocolVersion:1,hostId,datasetId,projects:[{id:'1',name:'P',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[]},notices:[{id:c,projectId:'1',title:'P',body:'P 프로젝트가 공유되었습니다.',target:{kind:'project',id:'1'}}]})
  policy.setMuted(true,()=>{});inbox.apply(envelope('a'));assert.equal(inbox.pending().length,0);assert.equal(inbox.settings().enabled,true)
  assert.equal(sharing.readCache().projects.length,1)
  const old=policy.state().generation;policy.setMuted(false,()=>{})
  Reflect.apply(inbox.apply,null,[envelope('b'),false,old]);assert.equal(policy.state().changesResume,true);assert.equal(inbox.pending().length,0)
  Reflect.apply(inbox.apply,null,[envelope('c'),false,policy.state().generation]);assert.equal(policy.state().changesResume,false);assert.equal(inbox.pending().length,0)
  inbox.apply(envelope('d'));assert.equal(inbox.pending().length,1)
  inbox.setEnabled(false);policy.setMuted(true,()=>{});policy.setMuted(false,()=>{});inbox.apply(envelope('e'));assert.equal(inbox.settings().enabled,false);assert.equal(inbox.pending().length,0)
 }},

 {name:'mute preference and resume generations survive reopen; failed atomic settlement restores previous state',run(ctx){
  const {db}=setup(ctx),store=createNotificationStore(db)
  assert.equal(store.state().muted,false)
  store.setMuted(true,()=>{})
  assert.equal(createNotificationStore(db).state().muted,true)
  const before=store.state()
  assert.throws(()=>store.setMuted(false,()=>{throw Error('disk')}),/disk/)
  assert.deepEqual(store.state(),before)
  store.setMuted(false,()=>{})
  assert.equal(store.state().generation,before.generation+1)
  assert.equal(store.state().sharedResume,true)
  assert.equal(store.state().changesResume,true)
  assert.equal(store.state().updatesResume,true)
 }},
 {name:'muted due dates never become failed retries; newly changed dates can notify after unmute',async run(ctx){
  const {db,repo}=setup(ctx),policy=createNotificationStore(db),delivery=createReminderStore(db),now=new Date(2026,10,11,12)
  const p=repo.createProject({name:'P',color:'#2563EB',participants:[]})
  const s=repo.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-11',reminder:{daysBefore:0,time:'09:00',start:true,end:true}})
  let sends=0
  const engine=createReminderEngine({store:delivery,snapshot:()=>repo.getSnapshot(),clock:()=>now,muted:()=>policy.state().muted,send:async()=>{sends++;return 'submitted'},onClick:()=>{},onChange:()=>{}})
  const settle=()=>{for(const s of repo.getSnapshot().schedules)delivery.suppress(dueReminders(s,now))}
  policy.setMuted(true,settle);await engine.evaluate(true)
  assert.equal(sends,0)
  for(const due of dueReminders(s,now))assert.equal(delivery.state(due.key),'suppressed')
  assert.deepEqual(delivery.issues(),{failed:0,unknown:0})
  policy.setMuted(false,settle);await engine.evaluate(true);assert.equal(sends,0)
  repo.updateSchedule({...s,reminder:{...s.reminder!,time:'10:00'}})
  await engine.evaluate();assert.equal(sends,1)
  await engine.dispose()
 }},
 {name:'shared resume is consumed only by current generation; mute keeps the boundary pending',run(ctx){
  const {db}=setup(ctx),s=createNotificationStore(db);s.setMuted(true,()=>{});const old=s.state().generation
  let settled=0;s.resumeShared(old,()=>settled++);assert.equal(s.state().sharedResume,true)
  s.setMuted(false,()=>{});s.resumeShared(old,()=>settled++);assert.equal(s.state().sharedResume,true)
  s.resumeShared(s.state().generation,()=>settled++);assert.equal(s.state().sharedResume,false);assert.equal(settled,3)
  s.resumeShared(s.state().generation,()=>settled++);assert.equal(settled,3)
 }},
 {name:'update notices are durable per host and version, suppression survives resume and failure never retries',run(ctx){
  const {db}=setup(ctx),s=createNotificationStore(db)
  assert.deepEqual(s.observeUpdate(update(),0),{hostId,version:'0.9.0'})
  s.finishUpdate(hostId,'0.9.0','failed')
  assert.equal(createNotificationStore(db).observeUpdate(update(),0),null)
  s.setMuted(true,()=>{});s.observeUpdate(update('0.10.0'),s.state().generation)
  s.setMuted(false,()=>{});const generation=s.state().generation
  assert.equal(s.observeUpdate(update('0.11.0'),generation-1),null);assert.equal(s.state().updatesResume,true)
  assert.equal(s.observeUpdate(update('0.12.0'),generation),null);assert.equal(s.state().updatesResume,false)
  assert.equal(s.observeUpdate(update('0.10.0'),generation),null)
  assert.deepEqual(s.observeUpdate(update('0.13.0'),generation),{hostId,version:'0.13.0'})
  s.recoverUpdates();assert.equal(s.observeUpdate(update('0.13.0'),generation),null)
 }},
]
