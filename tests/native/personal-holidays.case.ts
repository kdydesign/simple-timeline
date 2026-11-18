import assert from 'node:assert/strict'
import {createChangeInbox} from '../../src/main/db/sharing/change-inbox'
import {workingDays} from '../../src/domain/holidays'
import {localHolidaySources} from '../../src/renderer/state/holidaySources'
import {setup,type NativeCase} from './helpers'
import {createSharingStore} from '../../src/main/db/sharing/store'
import {createSharingExtras} from '../../src/main/db/sharing/extras'
import {createSharingService} from '../../src/main/sharing/service'
export const cases:NativeCase[]=[
 {name:'persisted approval revocation never restores common weekends after offline restart or resume',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),id='11111111-1111-4111-8111-111111111111'
  store.connectMember({address:'127.0.0.1',port:47831,hostId:id,datasetId:id,certificatePin:'pin',credentialRef:'a'.repeat(32)})
  createChangeInbox(db).revoke()
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{},secrets:async()=>{throw Error('offline test')}})
  try{
   service.savePersonalHolidays({calendar:{weekdays:[],dates:[]}})
   const check=()=>{const state=service.getState();assert.equal(state.holidays?.status,'revoked');assert.deepEqual(state.holidays?.calendar,{weekdays:[],dates:[]});assert.equal(workingDays('2026-11-23','2026-11-29',localHolidaySources(state)),7)}
   check();await service.start();check();await service.suspend();await service.resume();check()
   createChangeInbox(db).confirmAccess();assert.notEqual(service.getState().holidays?.status,'revoked')
  }finally{await service.dispose()}
 }},
 {name:'personal holidays persist independently without publishing or changing shared revisions',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),extras=createSharingExtras(db)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{}})
  try{
   const calendar={weekdays:[3],dates:[{date:'2026-11-26',name:'비공개 연차'}]}
   assert.deepEqual((service.getState() as any).personalHolidays,{weekdays:[0,6],dates:[]})
   const common=extras.hostCalendar(),events=db.prepare('SELECT COUNT(*) n FROM sharing_change_events').get()
   ;(service as any).savePersonalHolidays({calendar})
   assert.deepEqual((service.getState() as any).personalHolidays,calendar)
   store.configureHost({address:'127.0.0.1',port:47831})
   assert.deepEqual((service.getState() as any).personalHolidays,calendar)
   assert.deepEqual(extras.hostCalendar().calendar,common.calendar)
   assert.equal(extras.hostCalendar().revision,common.revision)
   assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM sharing_change_events').get(),events)
   assert.throws(()=>(service as any).savePersonalHolidays({calendar:{weekdays:[],dates:[{date:'2026-02-30',name:'잘못된 날짜'}]}}))
   db.exec("CREATE TRIGGER fail_personal BEFORE UPDATE ON personal_holidays BEGIN SELECT RAISE(ABORT,'write failed'); END")
   assert.throws(()=>(service as any).savePersonalHolidays({calendar:{weekdays:[],dates:[]}}))
   assert.deepEqual((service.getState() as any).personalHolidays,calendar)
  }finally{await service.dispose()}
 }},
 {name:'disconnect removes only received holidays and retains personal choices',async run(ctx){
  const {db,repo}=setup(ctx),store=createSharingStore(db),extras=createSharingExtras(db)
  const service=createSharingService({storage:{state:'ready',db,repository:repo},profile:ctx.tempDir,changed:()=>{}})
  const id='11111111-1111-4111-8111-111111111111'
  try{
   store.connectMember({address:'127.0.0.1',port:47831,hostId:id,datasetId:id,certificatePin:'pin',credentialRef:'ref'})
   extras.applyCalendar({schemaVersion:1,hostId:id,datasetId:id,revision:id,calendar:{weekdays:[3],dates:[]}})
   ;(service as any).savePersonalHolidays({calendar:{weekdays:[],dates:[]}})
   store.disconnectMember({confirmed:true})
   assert.equal(extras.cachedCalendar(),null)
   assert.deepEqual((service.getState() as any).personalHolidays,{weekdays:[],dates:[]})
  }finally{await service.dispose()}
 }},
]
