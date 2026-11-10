import {it,expect,vi} from 'vitest'
import {createReminderEngine} from '../../src/main/reminders/engine'
import type {DeliveryState} from '../../src/main/db/reminders'
import {hotfix} from '../fixtures/timeline'
function setup(){
 let snapshot=structuredClone(hotfix), now=new Date(2026,10,11,12)
 snapshot.schedules=snapshot.schedules.slice(0,1).map(s=>({...s,endDate:s.startDate,reminder:{daysBefore:0,time:'09:00',start:true,end:true}}))
 const records=new Map<string,DeliveryState>()
 const store={claim:vi.fn((items:any[],retry:boolean)=>items.filter(o=>{if(!records.has(o.key)||(retry&&records.get(o.key)==='failed')){records.set(o.key,'claimed');return true}return false})),finish:vi.fn((keys:string[],state:DeliveryState)=>keys.forEach(k=>records.set(k,state))),recover:()=>{for(const [k,v] of records)if(v==='claimed')records.set(k,'unknown')},state:(key:string)=>records.get(key),issues:()=>({failed:[...records.values()].filter(v=>v==='failed').length,unknown:[...records.values()].filter(v=>v==='unknown').length})}
 const send=vi.fn(async(_message:any,_click:()=>void,_failure?:()=>void):Promise<'submitted'|'failed'|'unknown'>=>'submitted'),onClick=vi.fn()
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
it('consumes each failed identity once per explicit retry despite a concurrent automatic evaluation',async()=>{
 const v=setup();v.snapshot.schedules.push({...v.snapshot.schedules[0],id:'2'})
 v.send.mockResolvedValue('failed');await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(2)
 let finish!:(value:'failed')=>void
 v.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const manual=v.engine.evaluate(true);const tick=v.engine.evaluate();finish('failed')
 await Promise.all([manual,tick]);expect(v.send).toHaveBeenCalledTimes(4)
})

it('records a known asynchronous OS failure after submission for explicit retry',async()=>{
 const v=setup();await v.engine.evaluate();expect(v.engine.issues().failed).toBe(0)
 v.send.mock.calls[0][2]!();expect(v.engine.issues().failed).toBe(2)
 await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 await v.engine.evaluate(true);expect(v.send).toHaveBeenCalledTimes(2)
})
it('does not replay a local-time occurrence when the clock repeats and catches a skipped time',async()=>{
 const v=setup();v.snapshot.schedules[0].startDate='2026-11-01';v.snapshot.schedules[0].endDate='2026-11-01';v.snapshot.schedules[0].reminder.time='01:30'
 v.now=new Date(2026,10,1,1,30);await v.engine.evaluate();v.now=new Date(2026,10,1,1,0);await v.engine.evaluate();v.now=new Date(2026,10,1,1,30);await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 v.snapshot.schedules[0].startDate='2026-03-08';v.snapshot.schedules[0].endDate='2026-03-08';v.snapshot.schedules[0].reminder.time='02:30'
 v.now=new Date(2026,2,8,1,59);await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
 v.now=new Date(2026,2,8,3,0);await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(2)
})
it('does not retain an unused retry permission after the user disables the queued schedule',async()=>{
 const v=setup();v.snapshot.schedules.push({...v.snapshot.schedules[0],id:'2',reminder:{...v.snapshot.schedules[0].reminder}})
 v.send.mockResolvedValue('failed');await v.engine.evaluate()
 let finish!:(value:'failed')=>void;v.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const run=v.engine.evaluate(true);v.snapshot.schedules[1].reminder.start=false;v.snapshot.schedules[1].reminder.end=false
 const change=v.engine.evaluate();finish('failed');await Promise.all([run,change]);expect(v.send).toHaveBeenCalledTimes(3)
 v.snapshot.schedules[1].reminder.start=true;v.snapshot.schedules[1].reminder.end=true
 await v.engine.evaluate();expect(v.send).toHaveBeenCalledTimes(3)
})

it('awaits fresh authorization before claiming and retries after a failed gate',async()=>{
 const v=setup();let allowed=false
 const engine=createReminderEngine({store:v.store,snapshot:()=>v.snapshot,clock:()=>new Date(2026,10,11,12),send:v.send,onClick:()=>{},onChange:()=>{},beforeSchedule:async()=>allowed})
 await engine.evaluate();expect(v.records.size).toBe(0);expect(v.send).not.toHaveBeenCalled()
 allowed=true;await engine.evaluate();expect(v.send).toHaveBeenCalledTimes(1)
})
it.each(['delete','date','dispose'] as const)('re-reads after awaited gate: %s cannot submit stale alarms',async(change)=>{
 const v=setup();let release!:(value:boolean)=>void
 const engine=createReminderEngine({store:v.store,snapshot:()=>v.snapshot,clock:()=>new Date(2026,10,11,12),send:v.send,onClick:()=>{},onChange:()=>{},beforeSchedule:()=>new Promise(resolve=>{release=resolve})})
 const pending=engine.evaluate()
 if(change==='delete')v.snapshot.schedules=[]
 if(change==='date')v.snapshot.schedules[0].startDate=v.snapshot.schedules[0].endDate='2026-11-12'
 if(change==='dispose')engine.dispose()
 release(true);await pending;expect(v.records.size).toBe(0);expect(v.send).not.toHaveBeenCalled()
})
