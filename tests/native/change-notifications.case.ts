import assert from 'node:assert/strict'
import { setup, type NativeCase } from './helpers'
import { createSharingStore } from '../../src/main/db/sharing/store'
import type { WireSnapshot } from '../../src/shared/sharing'
// Reflect keeps RED executable before the new API exists.
function host(ctx:Parameters<NativeCase['run']>[0]) {
 const state=setup(ctx),store=createSharingStore(state.db)
 store.configureHost({address:'127.0.0.1',port:47831})
 const a=store.saveDevice({name:'A',ip:'127.0.0.2',installationId:'11111111-1111-4111-8111-111111111111'})
 const b=store.saveDevice({name:'B',ip:'127.0.0.3'})
 const save=(id?:string,name='P',recipients=[a])=>store.saveProject({id,name,color:'#2563EB',participants:recipients.map(d=>({name:d.name,deviceId:d.id}))})
 type Envelope={version:1;snapshot:WireSnapshot;cursor:string;mode:'initial'|'delta'|'reset';notices:{id:string;projectId:string|null;title:string;body:string;target:{kind:string}}[]}
 const sync=(cursor:string|null=null,reconnect=false):Envelope=>{const fn=Reflect.get(store,'getChangeSnapshot');assert.equal(typeof fn,'function','host change snapshot API');return fn(a.id,cursor,reconnect)}
 return {...state,store,a,b,save,sync}
}
export const cases:NativeCase[]=[
 {name:'change initial N/zero and nested no-op ACL rewrite never revoke or regrant',run(ctx){
  const h=host(ctx);assert.equal(h.sync().notices.length,0)
  const p=h.save();const first=h.sync();assert.equal(first.mode,'initial');assert.equal(first.notices.length,1);assert.match(first.notices[0].body,/1개/)
  h.save(p.id);assert.equal(h.sync(first.cursor).notices.length,0)
  h.save(p.id,'Renamed');const renamed=h.sync(first.cursor);assert.equal(renamed.notices.length,1);assert.match(renamed.notices[0].body,/프로젝트 이름 변경/);assert.doesNotMatch(JSON.stringify(renamed.notices),/공유 종료|공유되었습니다/)
  assert.throws(()=>h.sync('invalid'))
 }},
 {name:'change coalesces business results and excludes reminders, reversion and add-delete',run(ctx){
  const h=host(ctx),p=h.save(),s=h.repo.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-12'}),base=h.sync()
  h.repo.updateScheduleReminder({id:s.id,reminder:{daysBefore:0,time:'08:00',start:true,end:false}});h.save(p.id)
  h.store.saveProject({id:p.id,name:'P',color:'#FF0000',participants:[{name:'Display renamed',deviceId:h.a.id}]})
  assert.equal(h.sync(base.cursor).notices.length,0)
  h.repo.updateSchedule({...s,name:'Changed'});h.repo.updateSchedule({...s,name:'Again'})
  assert.equal(h.sync(base.cursor).notices.length,1);assert.match(h.sync(base.cursor).notices[0].body,/이름 변경/)
  h.repo.updateSchedule(s);assert.equal(h.sync(base.cursor).notices.length,0)
  const added=h.repo.createSchedule({projectId:p.id,name:'Transient',startDate:'2026-11-11',endDate:'2026-11-11'});h.repo.deleteSchedule({id:added.id});assert.equal(h.sync(base.cursor).notices.length,0)
  h.repo.deleteSchedule({id:s.id});const removed=h.sync(base.cursor);assert.equal(removed.notices[0].target.kind,'list');assert.match(removed.notices[0].body,/일정 삭제/)
  assert.match(h.sync(base.cursor,true).notices[0].body,/삭제1건/)
 }},
 {name:'change event insert failure rolls back business and removal; revoked grants never disclose old names',run(ctx){
  const h=host(ctx),p=h.save(),base=h.sync()
  h.db.exec("CREATE TRIGGER fail_change BEFORE INSERT ON sharing_change_events BEGIN SELECT RAISE(ABORT,'disk error'); END")
  assert.throws(()=>h.save(p.id,'Failed'));assert.equal(h.repo.getSnapshot().projects[0].name,'P')
  assert.throws(()=>h.repo.deleteProject({id:p.id,confirmed:true}));assert.equal(h.repo.getSnapshot().projects.length,1)
  h.db.exec('DROP TRIGGER fail_change')
  h.repo.createSchedule({projectId:p.id,name:'Secret old name',startDate:'2026-11-11',endDate:'2026-11-11'})
  h.save(p.id,'P',[h.b]);const revoked=h.sync(base.cursor);assert.equal(revoked.snapshot.projects.length,0);assert.equal(revoked.notices.length,1);assert.doesNotMatch(JSON.stringify(revoked.notices),/Secret|"projectId":"/)
  h.save(p.id);const regrant=h.sync(base.cursor);assert.equal(regrant.notices.length,1);assert.match(regrant.notices[0].body,/공유되었습니다/);assert.doesNotMatch(JSON.stringify(regrant.notices),/Secret/)
 }},
 {name:'change conversion is one grant, cursor bound to installation and retention gap resets',run(ctx){
  const h=host(ctx),p=h.repo.createProject({name:'Private',color:'#2563EB',participants:[]}),base=h.sync()
  h.repo.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-11'});h.save(p.id)
  assert.equal(h.sync(base.cursor).notices.length,1)
  h.db.prepare("UPDATE sharing_change_events SET occurred_at='2000-01-01T00:00:00.000Z'").run()
  const gap=h.sync(base.cursor);assert.equal(gap.mode,'reset');assert.equal(gap.notices.length,1);assert.match(gap.notices[0].body,/최신 상태/)
  h.store.saveDevice({id:h.a.id,name:'A',ip:h.a.ip,installationId:'33333333-3333-4333-8333-333333333333'});assert.throws(()=>h.sync(gap.cursor))
 }},
]

import { createChangeInbox } from '../../src/main/db/sharing/change-inbox'
import { sharedId } from '../../src/domain/sharing'
import type { ChangeEnvelope } from '../../src/shared/change-notifications'
const hid='11111111-1111-4111-8111-111111111111',did='22222222-2222-4222-8222-222222222222'
function member(ctx:Parameters<NativeCase['run']>[0]) {
 const state=setup(ctx),store=createSharingStore(state.db)
 store.connectMember({address:'127.0.0.1',port:47831,hostId:hid,datasetId:did,certificatePin:'pin',credentialRef:'ref'})
 return {...state,store,inbox:createChangeInbox(state.db)}
}
function envelope(cursor='a',name='S',mode:'initial'|'delta'|'reset'='delta'):ChangeEnvelope {
 return {version:1,cursor:cursor.repeat(64),mode,snapshot:{protocolVersion:1,hostId:hid,datasetId:did,projects:[{id:'1',name:'P',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[{id:'1',projectId:'1',name,startDate:'2026-11-11',endDate:'2026-11-12',createdAt:'t',updatedAt:'t'}]},notices:[{id:`notice-${cursor}`,projectId:'1',title:'P',body:`${name} · 이름 변경`,target:{kind:'schedule',id:'1',projectId:'1'}}]}
}
cases.push(
 {name:'change inbox atomically stores cache/cursor/notices, shared IDs and duplicate suppression',run(ctx){
  const m=member(ctx),e=envelope();m.inbox.apply(e);assert.equal(m.inbox.cursor(),e.cursor);assert.equal(m.store.readCache().schedules[0].name,'S');const target=m.inbox.pending()[0].target;assert.equal(target.kind,'schedule');assert.equal(target.kind==='schedule'&&target.id,sharedId(hid,did,'1'))
  m.db.exec("CREATE TRIGGER fail_inbox BEFORE INSERT ON sharing_change_inbox BEGIN SELECT RAISE(ABORT,'disk error'); END")
  assert.throws(()=>m.inbox.apply(envelope('b','Changed')));assert.equal(m.inbox.cursor(),e.cursor);assert.equal(m.store.readCache().schedules[0].name,'S');assert.equal(m.inbox.pending().length,1)
  m.db.exec('DROP TRIGGER fail_inbox');const id=m.inbox.pending()[0].id;assert.equal(m.inbox.claim(id),true);assert.equal(m.inbox.claim(id),false);m.inbox.finish(id,'submitted');m.inbox.apply(e);assert.equal(m.inbox.pending().length,0)
 }},
 {name:'change inbox OFF/ON baseline, restart claims unknown and deleted source history survive',run(ctx){
  const m=member(ctx);assert.deepEqual(m.inbox.settings(),{enabled:true,baselining:false})
  m.inbox.setEnabled(false);m.inbox.apply(envelope());assert.equal(m.inbox.pending().length,0)
  m.inbox.setEnabled(true);assert.equal(createChangeInbox(m.db).settings().baselining,true);m.inbox.apply(envelope('b'));assert.equal(m.inbox.pending().length,0);assert.equal(m.inbox.settings().baselining,false)
  m.inbox.apply(envelope('c','Changed'));const id=m.inbox.pending()[0].id;assert.equal(m.inbox.claim(id),true);createChangeInbox(m.db).recover();assert.deepEqual(m.inbox.issues(),{failed:0,unknown:1});m.inbox.retry();assert.equal(m.inbox.pending().length,0)
  const gone=envelope('d');gone.snapshot.schedules=[];gone.notices=[];m.inbox.apply(gone);assert.equal(m.inbox.issues().unknown,1);assert.equal(m.inbox.claim(id,true),false)
  m.inbox.setEnabled(false);m.inbox.reset();assert.equal(m.inbox.settings().enabled,false);assert.equal(m.inbox.cursor(),null)
 }},
 {name:'change inbox pending windows reaggregate repeated edits/reversion and revoke only once',run(ctx){
  const m=member(ctx),base=envelope('a');base.notices=[];m.inbox.apply(base)
  m.inbox.apply(envelope('b','Changed'));assert.equal(m.inbox.pending().length,1)
  m.inbox.apply(envelope('c','Again'));assert.equal(m.inbox.pending().length,1);assert.match(m.inbox.pending()[0].body,/Again/)
  const back=envelope('d','S');m.inbox.apply(back);assert.equal(m.inbox.pending().length,0)
  m.inbox.apply(envelope('e','Changed'));m.inbox.revoke();assert.equal(m.store.readCache().projects.length,0);assert.equal(m.inbox.pending().length,1);assert.equal(m.inbox.pending()[0].target.kind,'list');assert.doesNotMatch(JSON.stringify(m.inbox.pending()),/Changed/)
  m.inbox.revoke();assert.equal(m.inbox.pending().length,1)
 }}
)

import { initializeStorage } from '../../src/main/db/lifecycle'
import { migrations } from '../../src/main/db/migrations'
cases.push(
 {name:'change inbox preserves unclaimed generic termination on later sync without resurrecting submitted revocation',run(ctx){
  const m=member(ctx),base=envelope('a');base.notices=[];m.inbox.apply(base)
  const ended=envelope('b');ended.snapshot.projects=[];ended.snapshot.schedules=[];ended.notices=[{id:'ended-1',projectId:null,title:'공유 변경 알림',body:'공유가 종료되었습니다.',target:{kind:'list'}}];m.inbox.apply(ended)
  const next={...ended,cursor:'c'.repeat(64),notices:[]};m.inbox.apply(next);assert.equal(m.inbox.pending().length,1)
  m.inbox.claim('ended-1');m.inbox.finish('ended-1','submitted');m.inbox.apply({...next,cursor:'d'.repeat(64)});assert.equal(m.inbox.pending().length,0)
  m.inbox.revoke();const id=m.inbox.pending()[0].id;m.inbox.claim(id);m.inbox.finish(id,'submitted');m.inbox.revoke();assert.equal(m.inbox.pending().length,0)
 }},
 {name:'change inbox partially claimed windows keep only other projects and initial/reset generic survive refresh',run(ctx){
  const m=member(ctx),base=envelope('a');base.snapshot.projects.push({...base.snapshot.projects[0],id:'2',name:'P2'});base.snapshot.schedules.push({...base.snapshot.schedules[0],id:'2',projectId:'2',name:'S2'});base.notices=[];m.inbox.apply(base)
  const first=structuredClone(base);first.cursor='b'.repeat(64);first.snapshot.schedules.forEach(s=>s.name+=' changed');first.notices=[{id:'one',projectId:'1',title:'P',body:'변경1건',target:{kind:'project',id:'1'}},{id:'two',projectId:'2',title:'P2',body:'변경1건',target:{kind:'project',id:'2'}}];m.inbox.apply(first)
  m.inbox.claim('one');m.inbox.finish('one','submitted');const next=structuredClone(first);next.cursor='c'.repeat(64);next.snapshot.schedules[1].name='Again';next.notices=[{...first.notices[1],id:'two-next'}];m.inbox.apply(next);assert.deepEqual(m.inbox.pending().map(n=>n.id),['two'])
  m.inbox.reset();const initial=envelope('d');initial.mode='initial';initial.notices=[{id:'init',projectId:null,title:'공유 변경 알림',body:'프로젝트 1개가 공유되었습니다.',target:{kind:'list'}}];m.inbox.apply(initial);m.inbox.apply({...initial,cursor:'e'.repeat(64),mode:'delta',notices:[]});assert.deepEqual(m.inbox.pending().map(n=>n.id),['init'])
  m.inbox.reset();const gap={...initial,cursor:'f'.repeat(64),mode:'reset' as const,notices:[{id:'gap',projectId:null,title:'공유 변경 알림',body:'공유 자료가 최신 상태로 갱신되었습니다.',target:{kind:'list' as const}}]};m.inbox.apply(gap);m.inbox.apply({...gap,cursor:'1'.repeat(64),mode:'delta',notices:[]});assert.deepEqual(m.inbox.pending().map(n=>n.id),['gap'])
 }},
 {name:'change schema v4 upgrade preserves originals and missing v5 metadata blocks instead of rebuilding',async run(ctx){
  const old=await initializeStorage(ctx.tempDir,migrations.slice(0,4));assert.equal(old.state,'ready');if(old.state!=='ready')return
  const store=createSharingStore(old.db);store.configureHost({address:'127.0.0.1',port:47831});const d=store.saveDevice({name:'A',ip:'127.0.0.2'}),p=store.saveProject({name:'P',color:'#2563EB',participants:[{name:'A',deviceId:d.id}]});old.repository.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-12'});const before=old.repository.getSnapshot();old.db.close()
  const next=await initializeStorage(ctx.tempDir);assert.equal(next.state,'ready');if(next.state!=='ready')return
  assert.equal(next.db.pragma('user_version',{simple:true}),5n);assert.deepEqual(next.repository.getSnapshot(),before);assert.equal(createSharingStore(next.db).getChangeSnapshot(d.id,null,false).notices.length,1)
  next.db.exec('DELETE FROM sharing_change_settings');next.db.close();const blocked=await initializeStorage(ctx.tempDir);assert.equal(blocked.state,'blocked');if(blocked.state==='blocked')assert.equal(blocked.error.code,'DB_CORRUPT')
 }}
)

cases.push(
 {name:'change inbox explicit failed retry refreshes valid source, source removal blocks retry, disconnect preserves preference',run(ctx){
  const m=member(ctx);m.inbox.apply(envelope('a'));const id=m.inbox.pending()[0].id;m.inbox.claim(id);m.inbox.finish(id,'failed');assert.equal(m.inbox.issues().failed,1)
  const latest=envelope('b','Latest');latest.notices=[];m.inbox.apply(latest);assert.equal(m.inbox.pending().length,0);m.inbox.retry();assert.match(m.inbox.pending()[0].body,/Latest/);m.inbox.claim(id);m.inbox.finish(id,'failed')
  const gone=envelope('c');gone.notices=[];gone.snapshot.schedules=[];m.inbox.apply(gone);m.inbox.retry();assert.equal(m.inbox.pending().length,0)
  m.inbox.setEnabled(false);m.store.disconnectMember({confirmed:true});assert.equal(m.inbox.cursor(),null);assert.equal(m.inbox.settings().enabled,false);assert.equal(m.inbox.pending().length,0)
 }},
 {name:'change inbox pending add-delete is omitted, setting/claim storage failures never advance success',run(ctx){
  const m=member(ctx),base=envelope('a');base.snapshot.schedules=[];base.notices=[];m.inbox.apply(base)
  m.inbox.apply(envelope('b','Added'));const gone=envelope('c');gone.snapshot.schedules=[];gone.notices=[{id:'delete',projectId:'1',title:'P',body:'Added · 일정 삭제',target:{kind:'list'}}];m.inbox.apply(gone);assert.equal(m.inbox.pending().length,0)
  m.db.exec("CREATE TRIGGER fail_setting BEFORE UPDATE ON sharing_change_settings BEGIN SELECT RAISE(ABORT,'disk error'); END");assert.throws(()=>m.inbox.setEnabled(false));assert.equal(m.inbox.settings().enabled,true);m.db.exec('DROP TRIGGER fail_setting')
  m.inbox.apply(envelope('d','New'));const id=m.inbox.pending()[0].id;m.db.exec("CREATE TRIGGER fail_claim BEFORE UPDATE ON sharing_change_inbox WHEN NEW.state='claimed' BEGIN SELECT RAISE(ABORT,'disk error'); END");assert.throws(()=>m.inbox.claim(id));assert.equal(m.inbox.pending().length,1)
 }}
)

cases.push({name:'change schema loss during running session refuses mutation rather than silently skipping event recording',run(ctx){
 const h=host(ctx),p=h.save();h.db.exec('DROP TABLE sharing_change_events');assert.throws(()=>h.save(p.id,'Unrecorded'));assert.equal(h.repo.getSnapshot().projects[0].name,'P')
}})

cases.push(
 {name:'change retention reset also confirms missing cached grants with one generic termination and scrubs terminal details',run(ctx){
  const m=member(ctx);m.inbox.apply(envelope('a','Private old name'));const id=m.inbox.pending()[0].id;m.inbox.claim(id);m.inbox.finish(id,'submitted')
  const gap=envelope('b');gap.mode='reset';gap.snapshot.projects=[];gap.snapshot.schedules=[];gap.notices=[{id:'retention-gap',projectId:null,title:'공유 변경 알림',body:'공유 자료가 최신 상태로 갱신되었습니다.',target:{kind:'list'}}];m.inbox.apply(gap)
  assert.equal(m.inbox.pending().length,2);assert.equal(m.inbox.pending().filter(n=>n.body==='공유가 종료되었습니다.').length,1)
  const history=m.db.prepare('SELECT id,state,payload,baseline FROM sharing_change_inbox WHERE id=?').get(id) as {id:string;state:string;payload:string;baseline:string|null};assert.equal(history.state,'submitted');assert.equal(history.baseline,null);assert.doesNotMatch(history.payload,/Private old name|shared:/)
  const next={...gap,cursor:'c'.repeat(64),mode:'delta' as const,notices:[]};m.inbox.apply(next);assert.equal(m.inbox.pending().filter(n=>n.body==='공유가 종료되었습니다.').length,1)
 }},
 {name:'change whole revocation scrubs pending and unknown original details while retaining delivery identities',run(ctx){
  const m=member(ctx);m.inbox.apply(envelope('a','Original confidential'));const id=m.inbox.pending()[0].id;m.inbox.claim(id);m.inbox.recover();m.inbox.revoke()
  const row=m.db.prepare('SELECT id,state,payload,baseline FROM sharing_change_inbox WHERE id=?').get(id) as {id:string;state:string;payload:string;baseline:string|null};assert.equal(row.state,'unknown');assert.equal(row.id,id);assert.equal(row.baseline,null);assert.doesNotMatch(row.payload,/Original confidential|shared:/);assert.equal(m.inbox.pending().length,1)
 }}
)

cases.push({name:'change regrant in same cache dataset scrubs the previous grant generation before creating its new sharing notice',run(ctx){
 const m=member(ctx);m.inbox.apply(envelope('a','Old generation confidential'));const old=m.inbox.pending()[0].id;m.inbox.claim(old);m.inbox.recover()
 const regrant=envelope('b','Current allowed');regrant.notices=[{id:'new-grant',projectId:'1',title:'P',body:'P 프로젝트가 공유되었습니다.',target:{kind:'project',id:'1'}}];m.inbox.apply(regrant)
 const history=m.db.prepare('SELECT payload,baseline,state FROM sharing_change_inbox WHERE id=?').get(old) as {payload:string;baseline:string|null;state:string};assert.equal(history.state,'unknown');assert.equal(history.baseline,null);assert.doesNotMatch(history.payload,/Old generation confidential/);assert.deepEqual(m.inbox.pending().map(n=>n.id),['new-grant'])
}})

cases.push({name:'change reconnect with unchanged cursor reaggregates an unclaimed detail as a project summary',run(ctx){
 const m=member(ctx),base=envelope('a');base.notices=[];m.inbox.apply(base);const e=envelope('b','Updated');m.inbox.apply(e);assert.equal(m.inbox.pending()[0].target.kind,'schedule')
 const apply=m.inbox.apply as (e:ChangeEnvelope,reconnecting?:boolean)=>void;apply({...e,notices:[]},true);assert.equal(m.inbox.pending()[0].target.kind,'project');assert.match(m.inbox.pending()[0].body,/변경1건/)
}})

for(const reconnecting of [false,true])cases.push({name:`change grant envelope replay preserves pending association (${reconnecting?'reconnecting':'ordinary'}) and aggregates later delta`,run(ctx){
 const m=member(ctx),base=envelope('a');base.mode='initial';base.snapshot.projects=[];base.snapshot.schedules=[];base.notices=[];m.inbox.apply(base)
 const grant=envelope('b','Current');grant.notices=[{id:'grant-replay',projectId:'1',title:'P',body:'P 프로젝트가 공유되었습니다.',target:{kind:'project',id:'1'}}];m.inbox.apply(grant);m.inbox.apply(grant,reconnecting)
 assert.deepEqual(m.inbox.pending().map(n=>n.id),['grant-replay'])
 const row=m.db.prepare('SELECT project_id,baseline FROM sharing_change_inbox WHERE id=?').get('grant-replay') as {project_id:string|null;baseline:string|null};assert.equal(row.project_id,'1');assert.equal(row.baseline,'null')
 const later=envelope('c','Latest');later.snapshot.projects[0].name='Later P';m.inbox.apply(later)
 assert.deepEqual(m.inbox.pending().map(n=>n.id),['grant-replay']);assert.equal(m.inbox.pending()[0].title,'Later P');assert.equal(m.inbox.pending()[0].body,'Later P 프로젝트가 공유되었습니다.')
}})

import { mkdirSync } from 'node:fs'
for(const removal of ['partial ACL','project deletion'] as const)cases.push({name:`change confirmed generic termination after ${removal} permits explicit failed retry while still connected`,run(ctx){
 const h=host(ctx),removedProject=h.save();h.save(undefined,'Still shared');const baseline=h.store.getChangeSnapshot(h.a.id,null,false)
 const receiverDir=`${ctx.tempDir}/receiver`;mkdirSync(receiverDir);const state=setup({...ctx,tempDir:receiverDir}),store=createSharingStore(state.db),inbox=createChangeInbox(state.db)
 store.connectMember({address:'127.0.0.1',port:47831,hostId:baseline.snapshot.hostId,datasetId:baseline.snapshot.datasetId,certificatePin:'pin',credentialRef:'ref'});inbox.apply(baseline)
 for(const n of inbox.pending()){inbox.claim(n.id);inbox.finish(n.id,'submitted')}
 if(removal==='partial ACL')h.save(removedProject.id,'P',[h.b]);else h.repo.deleteProject({id:removedProject.id,confirmed:true})
 const ended=h.store.getChangeSnapshot(h.a.id,baseline.cursor,false);inbox.apply(ended);assert.equal(store.readCache().projects.length,1);assert.equal(inbox.pending().length,1)
 const notice=inbox.pending()[0];assert.equal(notice.projectId,null);assert.deepEqual(notice.target,{kind:'list'});assert.equal(notice.body,'공유가 종료되었습니다.');assert.equal(inbox.claim(notice.id),true);inbox.finish(notice.id,'failed')
 assert.equal((state.db.prepare('SELECT revoked FROM sharing_change_settings WHERE singleton=1').get() as {revoked:bigint}).revoked,0n)
 inbox.retry();assert.deepEqual(inbox.pending(),[notice]);assert.equal(inbox.claim(notice.id),true);inbox.finish(notice.id,'submitted');inbox.apply(ended);assert.equal(inbox.pending().length,0)
}})
