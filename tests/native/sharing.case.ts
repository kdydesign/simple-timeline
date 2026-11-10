import assert from 'node:assert/strict'
import { setup, type NativeCase } from './helpers'
import { createSharingStore } from '../../src/main/db/sharing/store'
import { createSharedReminderStore } from '../../src/main/db/sharing/cache'
import { createReminderStore } from '../../src/main/db/reminders'
import { dueReminders } from '../../src/domain/reminder'
import { sharedId } from '../../src/domain/sharing'
import type { WireSnapshot } from '../../src/shared/sharing'
const hostId='11111111-1111-4111-8111-111111111111',datasetId='22222222-2222-4222-8222-222222222222'
const snapshot=():WireSnapshot=>({protocolVersion:1,hostId,datasetId,projects:[{id:'1',name:'Remote',color:'#2563EB',participants:['Member'],createdAt:'t',updatedAt:'t'}],schedules:[{id:'1',projectId:'1',name:'Remote S',startDate:'2026-11-11',endDate:'2026-11-11',createdAt:'t',updatedAt:'t'}]})
export const cases:NativeCase[]=[
{name:'pending credential cancellation preserves active credentials and denies abandoned activation',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db)
 store.configureHost({address:'127.0.0.1',port:47831})
 const device=store.saveDevice({name:'A',ip:'127.0.0.2'})
 store.putCredential({deviceId:device.id,hash:'1'.repeat(64)});store.activateCredential('1'.repeat(64))
 store.putCredential({deviceId:device.id,hash:'2'.repeat(64)})
 store.revokePendingCredentials(device.id)
 assert.equal(store.findCredential('1'.repeat(64))?.status,'active')
 assert.equal(store.findCredential('2'.repeat(64))?.status,'revoked')
 assert.throws(()=>store.activateCredential('2'.repeat(64)))
 assert.equal(store.getDevice(device.id).revoked,false)
}},
{name:'host conversion preserves numeric IDs and delivery identities; invalid ACL rolls back and wire snapshots disclose only allowed data',run(ctx){
 const {db,repo}=setup(ctx),store=createSharingStore(db),identity=store.getConfig()
 store.configureHost({address:'192.168.1.10',port:47831});store.setHosting({enabled:true})
 const a=store.saveDevice({name:'A',ip:'192.168.1.20'}),b=store.saveDevice({name:'B',ip:'192.168.1.21'})
 const p=repo.createProject({name:'Original',color:'#2563EB',participants:['A']}),s=repo.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-11',reminder:{daysBefore:0,time:'09:00',start:true,end:false}})
 repo.createProject({name:'Private',color:'#2563EB',participants:[]})
 const delivery=createReminderStore(db),occ=dueReminders(s,new Date(2026,10,11,12));delivery.claim(occ,false);delivery.finish(occ.map(x=>x.key),'submitted')
 assert.throws(()=>store.saveProject({id:p.id,name:'Bad',color:'#2563EB',participants:[{name:'A',deviceId:'missing'}]}))
 assert.equal(repo.getSnapshot().projects[0].name,'Original');assert.equal(store.listSharedProjects().length,0)
 store.saveProject({id:p.id,name:'Shared',color:'#2563EB',participants:[{name:' A ',deviceId:a.id}]})
 assert.equal(repo.getSnapshot().schedules[0].id,s.id);assert.equal(delivery.claim(occ,true).length,0)
 const wire=store.getWireSnapshot(a.id);assert.equal(wire.projects.length,1);assert.equal(wire.schedules.length,1)
 assert.equal(wire.projects[0].id,p.id);assert.equal(wire.projects[0].participants[0],'A')
 assert.ok(!JSON.stringify(wire).includes('reminder'));assert.ok(!JSON.stringify(wire).includes('192.168'));assert.equal(store.getWireSnapshot(b.id).projects.length,0)
 assert.equal(createSharingStore(db).getConfig().hostId,identity.hostId);assert.equal(createSharingStore(db).getConfig().datasetId,identity.datasetId)
 assert.throws(()=>store.saveDevice({name:'dup',ip:a.ip}));assert.throws(()=>store.saveDevice({name:'bad',ip:'1.2.3.999'}));assert.throws(()=>store.connectMember({address:'192.168.1.2',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'protected-token-ref'}))
 store.putCredential({deviceId:a.id,hash:'a'.repeat(64)});assert.equal(store.findCredential('a'.repeat(64))?.status,'pending');store.activateCredential('a'.repeat(64));store.revokeDevice({id:a.id});assert.equal(store.findCredential('a'.repeat(64))?.status,'revoked');assert.throws(()=>store.getWireSnapshot(a.id))
}},
{name:'member resync retains surviving private reminders and deliveries; mismatch and malformed payloads cannot overwrite; deletion and disconnect cascade only shared data',run(ctx){
 const {db,repo}=setup(ctx),store=createSharingStore(db)
 const p=repo.createProject({name:'Personal',color:'#2563EB',participants:[]});repo.createSchedule({projectId:p.id,name:'Personal S',startDate:'2026-11-11',endDate:'2026-11-11'})
 store.connectMember({address:'192.168.1.2',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'protected-token-ref'});store.applyCache(snapshot())
 const id=sharedId(hostId,datasetId,'1'),reminder={daysBefore:0,time:'09:00',start:true,end:false}
 store.saveReminder({id,reminder});const adapter=createSharedReminderStore(db),occ=dueReminders(store.readCache().schedules[0],new Date(2026,10,11,12));assert.equal(adapter.claim(occ,false).length,1);adapter.finish(occ.map(x=>x.key),'submitted')
 const next=snapshot();next.schedules[0].name='Updated';store.applyCache(next)
 assert.equal(store.readCache().schedules[0].name,'Updated');assert.deepEqual(store.readCache().schedules[0].reminder,reminder);assert.equal(adapter.claim(occ,true).length,0)
 assert.throws(()=>store.applyCache({...next,datasetId:'33333333-3333-4333-8333-333333333333'}));assert.equal(store.readCache().schedules.length,1)
 assert.throws(()=>store.applyCache({...next,schedules:[{...next.schedules[0],endDate:'2026-02-30'}]}));assert.equal(store.readCache().schedules[0].name,'Updated')
 assert.throws(()=>store.configureHost({address:'192.168.1.2',port:47831}))
 store.applyCache({...next,schedules:[]});assert.equal(adapter.state(occ[0].key),undefined);assert.throws(()=>store.saveReminder({id,reminder}));assert.equal(repo.getSnapshot().schedules.length,1)
 store.disconnectMember({confirmed:true});assert.equal(store.readCache().projects.length,0);assert.equal(store.getConfig().credentialRef,null);assert.equal(repo.getSnapshot().projects.length,1);assert.throws(()=>store.configureHost({address:'192.168.1.2',port:47831}))
}},
{name:'missing durable sharing identity is refused rather than silently regenerated',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db);store.getConfig();db.exec('DELETE FROM sharing_config');assert.throws(()=>createSharingStore(db).getConfig())
}},
{name:'sharing transactions roll back mid-write failures without damaging ACL, cache reminders or identity',run(ctx){
 const {db,repo}=setup(ctx),store=createSharingStore(db)
 store.configureHost({address:'192.168.1.1',port:47831})
 const a=store.saveDevice({name:'A',ip:'192.168.1.2',installationId:hostId})
 assert.throws(()=>store.saveDevice({name:'Duplicate installation',ip:'192.168.1.3',installationId:hostId}))
 const p=store.saveProject({name:'Shared',color:'#2563EB',participants:[{name:'Display A',deviceId:a.id}]})
 store.saveDevice({id:a.id,name:'Renamed device',ip:'192.168.1.22'})
 assert.equal(repo.getSnapshot().projects[0].participants[0],'Display A')
 db.exec("CREATE TRIGGER fail_sharing_recipient BEFORE INSERT ON sharing_recipients BEGIN SELECT RAISE(ABORT,'simulated disk error'); END")
 assert.throws(()=>store.saveProject({id:p.id,name:'Failed edit',color:'#FF0000',participants:[{name:'Changed A',deviceId:a.id}]}))
 assert.equal(repo.getSnapshot().projects[0].name,'Shared');assert.equal(store.getWireSnapshot(a.id).projects[0].participants[0],'Display A')
 db.exec('DROP TRIGGER fail_sharing_recipient')
 store.putCredential({deviceId:a.id,hash:'a'.repeat(64)});store.putCredential({deviceId:a.id,hash:'b'.repeat(64)})
 assert.equal(store.findCredential('a'.repeat(64))?.status,'revoked');assert.throws(()=>store.activateCredential('a'.repeat(64)))
 store.activateCredential('b'.repeat(64));store.putCredential({deviceId:a.id,hash:'c'.repeat(64)});store.activateCredential('c'.repeat(64))
 assert.equal(store.findCredential('b'.repeat(64))?.status,'revoked');assert.equal(store.findCredential('c'.repeat(64))?.status,'active')
 assert.throws(()=>store.putCredential({deviceId:a.id,hash:'a'.repeat(64)}));assert.equal(store.findCredential('a'.repeat(64))?.status,'revoked')
}},
{name:'cache deletion retains other shared deliveries and atomic failed refresh leaves full previous data',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db)
 store.connectMember({address:'192.168.1.2',port:47831,hostId,datasetId,certificatePin:'pin',credentialRef:'protected-ref'})
 const data=snapshot();data.schedules.push({...data.schedules[0],id:'2',name:'Survivor'})
 store.applyCache(data)
 for(const s of store.readCache().schedules)store.saveReminder({id:s.id,reminder:{daysBefore:0,time:'09:00',start:true,end:false}})
 const adapter=createSharedReminderStore(db),occ=store.readCache().schedules.flatMap(s=>dueReminders(s,new Date(2026,10,11,12)))
 adapter.claim(occ,false);adapter.finish(occ.map(o=>o.key),'submitted')
 db.exec("CREATE TRIGGER fail_cache_update BEFORE UPDATE ON sharing_cache_schedules WHEN OLD.remote_id='2' BEGIN SELECT RAISE(ABORT,'simulated cache failure'); END")
 const updated={...data,schedules:data.schedules.map(s=>({...s,name:'Changed'}))}
 assert.throws(()=>store.applyCache(updated));assert.deepEqual(store.readCache().schedules.map(s=>s.name),['Remote S','Survivor'])
 assert.equal(adapter.claim(occ,true).length,0)
 db.exec('DROP TRIGGER fail_cache_update')
 store.applyCache({...data,schedules:[data.schedules[1]]})
 assert.equal(adapter.state(occ[0].key),undefined);assert.equal(adapter.state(occ[1].key),'submitted')
 assert.equal(adapter.claim([occ[0]],true).length,0)
 store.disconnectMember({confirmed:true})
 assert.throws(()=>store.connectMember({address:'192.168.1.9',port:47831,hostId:'33333333-3333-4333-8333-333333333333',datasetId,certificatePin:'pin',credentialRef:'protected-ref'}))
 assert.equal(store.getConfig().role,'personal');assert.equal(store.getConfig().remoteHostId,hostId)
}}
,
{name:'new pin requires explicit disconnect and confirmed same-host reapproval; approval state excludes pending credentials',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db)
 store.connectMember({address:'192.168.1.2',port:47831,hostId,datasetId,certificatePin:'old-pin',credentialRef:'old-ref'})
 assert.throws(()=>store.connectMember({address:'192.168.1.3',port:47831,hostId,datasetId,certificatePin:'new-pin',credentialRef:'new-ref'}))
 assert.equal(store.getConfig().certificatePin,'old-pin')
 store.disconnectMember({confirmed:true})
 assert.equal(store.getConfig().pendingCredentialDeleteRef,'old-ref')
 assert.throws(()=>store.completeCredentialDeletion('wrong-ref'))
 assert.throws(()=>store.connectMember({address:'192.168.1.3',port:47831,hostId,datasetId,certificatePin:'new-pin',credentialRef:'new-ref'}))
 assert.throws(()=>db.prepare("UPDATE sharing_config SET role='member',credential_ref='revived'").run())
 store.completeCredentialDeletion('old-ref')
 store.connectMember({address:'192.168.1.3',port:47831,hostId,datasetId,certificatePin:'new-pin',credentialRef:'new-ref'})
 assert.equal(store.getConfig().certificatePin,'new-pin')
}},
{name:'device approval becomes visible only after delivery acknowledgement and is removed on revocation',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db)
 store.configureHost({address:'192.168.1.1',port:47831})
 const device=store.saveDevice({name:'A',ip:'192.168.1.2'})
 assert.equal(device.approved,false)
 store.putCredential({deviceId:device.id,hash:'a'.repeat(64)})
 assert.equal(store.getDevice(device.id).approved,false)
 store.activateCredential('a'.repeat(64))
 assert.equal(store.listDevices()[0].approved,true)
 store.revokeDevice({id:device.id})
 assert.equal(store.getDevice(device.id).approved,false)
}}
,
{name:'installation binding is available only through main-only lookup and remains absent from public devices',run(ctx){
 const {db}=setup(ctx),store=createSharingStore(db)
 store.configureHost({address:'192.168.1.1',port:47831})
 const device=store.saveDevice({name:'A',ip:'192.168.1.2'})
 const lookup=Reflect.get(store,'getDeviceInstallationId') as (id:string)=>string|null
 assert.equal(typeof lookup,'function')
 assert.equal(lookup(device.id),null)
 store.saveDevice({id:device.id,name:'A',ip:'192.168.1.2',installationId:hostId})
 assert.equal(lookup(device.id),hostId)
 assert.ok(!('installationId' in store.getDevice(device.id)));assert.ok(!('installationId' in store.listDevices()[0]))
 assert.throws(()=>lookup('missing'))
}}

]
