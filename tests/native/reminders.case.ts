import {dispatch} from '../../src/main/ipc-core'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {initializeStorage} from '../../src/main/db/lifecycle'
import {migrations} from '../../src/main/db/migrations'
import {createReminderStore} from '../../src/main/db/reminders'
import {dueReminders} from '../../src/domain/reminder'
import type {NativeCase} from './helpers'
export const cases:NativeCase[]=[{name:'quick reminder mutation validates stored dates and preserves schedule data atomically',async run(ctx){
 const state=await initializeStorage(ctx.tempDir);assert.equal(state.state,'ready');if(state.state!=='ready')return
 ctx.defer(()=>state.db.close())
 const p=state.repository.createProject({name:'P',color:'#2563EB',participants:[]})
 const s=state.repository.createSchedule({projectId:p.id,name:'Original',startDate:'0001-01-02',endDate:'0001-01-03'})
 const reminder={daysBefore:1,time:'10:30',start:true,end:false}
 const result=dispatch(state,'updateScheduleReminder',[{id:s.id,reminder}],true)
 assert.equal(result.ok,true)
 const saved=state.repository.getSnapshot().schedules[0]
 assert.deepEqual(saved.reminder,reminder);assert.equal(saved.name,s.name);assert.equal(saved.startDate,s.startDate);assert.equal(saved.endDate,s.endDate)
 for(const value of [{id:s.id,reminder:{...reminder,daysBefore:2}},{id:s.id,reminder,name:'Overwrite'},{id:s.id,reminder:undefined},{id:'shared:1',reminder}])assert.equal(dispatch(state,'updateScheduleReminder',[value],true).ok,false)
 assert.deepEqual(state.repository.getSnapshot().schedules[0],saved)
 assert.equal(dispatch(state,'updateScheduleReminder',[{id:s.id,reminder}],false).ok,false)
 state.repository.deleteProject({id:p.id,confirmed:true})
 assert.equal(dispatch(state,'updateScheduleReminder',[{id:s.id,reminder}],true).ok,false)
}},{name:'migrates v1 schedules intact, defaults off, preserves reminders on drag and rejects invalid merged dates',async run(ctx){
 const profile=join(ctx.tempDir,'profile'),old=await initializeStorage(profile,migrations.slice(0,1))
 assert.equal(old.state,'ready');if(old.state!=='ready')return
 old.db.exec("INSERT INTO projects VALUES(1,'P','#2563EB','t','t'); INSERT INTO schedules VALUES(1,1,'S','2026-11-11','2026-11-11','t','t')")
 old.db.close()
 const current=await initializeStorage(profile);assert.equal(current.state,'ready');if(current.state!=='ready')return
 ctx.defer(()=>current.db.close());assert.equal(current.db.pragma('user_version',{simple:true}),BigInt(migrations.length))
 const s=current.repository.getSnapshot().schedules[0]
 assert.deepEqual(s.reminder,{daysBefore:2,time:'09:00',start:false,end:false});assert.equal(s.id,'1')
 const reminder={...s.reminder,start:true,end:true}
 const saved=current.repository.updateSchedule({...s,reminder})
 const dragged=current.repository.updateSchedule({id:'1',name:'S',startDate:'2026-11-12',endDate:'2026-11-12'})
 assert.deepEqual(dragged.reminder,reminder)
 assert.throws(()=>current.repository.updateSchedule({id:'1',name:'S',startDate:'0001-01-01',endDate:'0001-01-01'}))
 assert.equal(current.repository.getSnapshot().schedules[0].startDate,'2026-11-12')
 const store=createReminderStore(current.db),occ=dueReminders(saved,new Date(2026,10,9,12))
 assert.equal(store.claim(occ,false).length,2);assert.equal(store.claim(occ,false).length,0)
 store.recover();assert.equal(store.issues().unknown,2);assert.equal(store.claim(occ,true).length,0)
 current.repository.deleteSchedule({id:'1'});assert.equal(store.issues().unknown,0)
}},{name:'failed reminder claims require explicit retry and submitted identity survives restart',async run(ctx){
 const state=await initializeStorage(ctx.tempDir);assert.equal(state.state,'ready');if(state.state!=='ready')return
 ctx.defer(()=>state.db.close())
 const p=state.repository.createProject({name:'P',color:'#2563EB',participants:[]})
 const s=state.repository.createSchedule({projectId:p.id,name:'S',startDate:'2026-11-11',endDate:'2026-11-11',reminder:{daysBefore:0,time:'09:00',start:true,end:false}})
 const occ=dueReminders(s,new Date(2026,10,11,12)),store=createReminderStore(state.db)
 store.claim(occ,false);store.finish(occ.map(x=>x.key),'failed')
 assert.equal(store.claim(occ,false).length,0);assert.equal(store.claim(occ,true).length,1)
 store.finish(occ.map(x=>x.key),'submitted');assert.equal(createReminderStore(state.db).claim(occ,true).length,0)
 store.finish(occ.map(x=>x.key),'failed');assert.equal(store.issues().failed,1);assert.equal(store.claim(occ,false).length,0);assert.equal(store.claim(occ,true).length,1)
}}]
