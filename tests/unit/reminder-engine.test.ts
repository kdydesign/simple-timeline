import {it,expect,vi} from 'vitest'
import {createReminderEngine} from '../../src/main/reminders/engine'
import type {DeliveryState} from '../../src/main/db/reminders'
import {hotfix} from '../fixtures/timeline'
function setup(){
 let snapshot=structuredClone(hotfix), now=new Date(2026,10,11,12)
 snapshot.schedules=snapshot.schedules.slice(0,1).map(s=>({...s,endDate:s.startDate,reminder:{daysBefore:0,time:'09:00',start:true,end:true}}))
 const records=new Map<string,DeliveryState>()
 const store={claim:vi.fn((items:any[],retry:boolean)=>items.filter(o=>{if(!records.has(o.key)||(retry&&records.get(o.key)==='failed')){records.set(o.key,'claimed');return true}return false})),finish:vi.fn((keys:string[],state:DeliveryState)=>keys.forEach(k=>records.set(k,state))),recover:()=>{for(const [k,v] of records)if(v==='claimed')records.set(k,'unknown')},state:(key:string)=>records.get(key),issues:()=>({failed:[...records.values()].filter(v=>v==='failed').length,unknown:[...records.values()].filter(v=>v==='unknown').length})}
 const send=vi.fn(async(_message:any,_click:()=>void):Promise<'submitted'|'failed'|'unknown'>=>'submitted'),onClick=vi.fn()
 const engine=createReminderEngine({store,snapshot:()=>snapshot,clock:()=>now,send,onClick,onChange:()=>{}})
 return {engine,store,send,records,onClick,get snapshot(){return snapshot},set snapshot(v){snapshot=v},set now(v:Date){now=v}}
}
it('merges same-day start/end, uses latest names and never repeats identities',async()=>{
 const v=setup();await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1);expect(v.send.mock.calls[0][0].body).toContain('오늘 시작·종료');expect(v.records.size).toBe(2)
 v.snapshot.schedules[0].name='new';await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 v.snapshot.schedules[0].reminder.time='10:00';await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(2)
 v.snapshot.schedules[0].reminder.time='09:00';await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(2)
 v.send.mock.calls[0][1]();expect(v.onClick).toHaveBeenCalledWith('1')
})
it('rechecks current date at resume, excludes past and future time',async()=>{
 const v=setup();v.now=new Date(2026,10,11,8);await v.engine.evaluate();expect(v.send).not.toHaveBeenCalled()
 v.now=new Date(2026,10,12,12);await v.engine.evaluate();expect(v.send).not.toHaveBeenCalled()
 v.now=new Date(2026,10,11,13);await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
})
it('explicit failure retries only on request; unknown and submitted never retry',async()=>{
 const v=setup();v.send.mockResolvedValueOnce('failed');await v.engine.evaluate();expect(v.engine.issues().failed).toBe(2)
 await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 v.send.mockResolvedValueOnce('unknown');await v.engine.evaluate(true);expect(v.send).toHaveBeenCalledTimes(2)
 await v.engine.evaluate(true);expect(v.send).toHaveBeenCalledTimes(2);expect(v.engine.issues().unknown).toBe(2)
})
it('serializes overlapping evaluations and rechecks deletions before sending next',async()=>{
 const v=setup();v.snapshot.schedules.push({...v.snapshot.schedules[0],id:'2'})
 let finish!:(value:'submitted')=>void
 v.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const first=v.engine.evaluate();const again=v.engine.evaluate()
 v.snapshot.schedules=v.snapshot.schedules.slice(0,1);finish('submitted');await Promise.all([first,again]);expect(v.send).toHaveBeenCalledTimes(1)
})
it('never sends after failed durable claim and preserves uncertain completion',async()=>{
 const v=setup();v.store.claim.mockImplementationOnce(()=>{throw Error('disk')});await v.engine.evaluate();expect(v.send).not.toHaveBeenCalled();expect(v.engine.issues().storageError).toBe(true)
 v.store.finish.mockImplementationOnce(()=>{throw Error('disk')});await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 await v.engine.evaluate(true);expect(v.send).toHaveBeenCalledTimes(1)
})
it('newly enabled end can notify without repeating the processed start',async()=>{
 const v=setup();v.snapshot.schedules[0].reminder.end=false;await v.engine.evaluate();v.snapshot.schedules[0].reminder.end=true;await v.engine.evaluate()
 expect(v.send).toHaveBeenCalledTimes(2);expect(v.send.mock.calls[1][0].body).toContain('오늘 종료');expect(v.send.mock.calls[1][0].body).not.toContain('시작')
})
