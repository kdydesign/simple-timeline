import {expect,it} from 'vitest'
import {createChangeDelivery} from '../../src/main/sharing/change-delivery'
import type {ChangeNotice} from '../../src/shared/change-notifications'
const notice:ChangeNotice={id:'n',projectId:'p',title:'P',body:'Changed',target:{kind:'project',id:'p'}}
function fixture(){
 let state='pending',enabled=true,allowed=true,generation=0,calls=0
 const order:string[]=[],clicks:ChangeNotice[]=[];let failure:(()=>void)|undefined,click:(()=>void)|undefined,resolve!:(state:'submitted'|'failed'|'unknown')=>void
 const inbox={recover:()=>{},settings:()=>({enabled,baselining:false}),pending:()=>state==='pending'?[notice]:[],claim:()=>{order.push('claim');state='claimed';return true},finish:(_id:string,next:string)=>{if(state==='claimed'||next==='failed')state=next},issues:()=>({failed:Number(state==='failed'),unknown:Number(state==='unknown')}),retry:()=>{if(state==='failed')state='pending'}}
 const engine=createChangeDelivery({inbox:inbox as any,generation:()=>generation,authorized:()=>allowed,send:(_message,onClick,onFailure)=>{calls++;order.push('send');failure=onFailure;click=onClick;return new Promise(r=>{resolve=r})},onClick:n=>clicks.push(n),onChange:()=>{}})
 return {engine,order,clicks,get state(){return state},get calls(){return calls},finish:(s:'submitted'|'failed'|'unknown')=>resolve(s),fail:()=>failure?.(),click:()=>click?.(),disable:()=>{enabled=false;engine.invalidate()},revoke:()=>{allowed=false;generation++},allow:()=>{allowed=true},deny:()=>{allowed=false},breakSettings:()=>{inbox.settings=()=>{throw Error('closed')}},claimFailure:()=>{inbox.claim=()=>{throw Error('disk')}}}
}
it('claims before one OS submission, deduplicates and records guarded late definite failure',async()=>{
 const f=fixture(),pending=f.engine.evaluate();expect(f.order).toEqual(['claim','send']);f.finish('submitted');await pending
 await f.engine.evaluate();expect(f.calls).toBe(1);f.fail();expect(f.state).toBe('failed');f.click();expect(f.clicks).toEqual([notice]);f.engine.dispose()
})
it('requires explicit retry for definite failure and never automatically retries unknown',async()=>{
 for(const result of ['failed','unknown'] as const){const f=fixture(),first=f.engine.evaluate();f.finish(result);await first;await f.engine.evaluate();expect(f.calls).toBe(1)
 const retry=f.engine.evaluate(true);if(result==='failed'){expect(f.calls).toBe(2);f.finish('submitted')}await retry;expect(f.calls).toBe(result==='failed'?2:1);f.engine.dispose()}
})
it('fences disabled, stale, revoked and disposed send/click/failure completions',async()=>{
 for(const action of ['disable','revoke','dispose'] as const){const f=fixture(),first=f.engine.evaluate();if(action==='dispose')f.engine.dispose();else f[action]();f.finish('submitted');await first;f.fail();f.click();expect(f.state).toBe('claimed');expect(f.clicks).toEqual([])}
 const f=fixture();f.deny();await f.engine.evaluate();expect(f.calls).toBe(0);f.allow();f.claimFailure();await f.engine.evaluate();expect(f.calls).toBe(0);expect(f.engine.issues().storageError).toBe(true);f.engine.dispose()
})
it('native callbacks never throw when authorization storage becomes unavailable',async()=>{
 const f=fixture(),pending=f.engine.evaluate();f.finish('submitted');await pending
 // The real service reads SQLite for authorization; callback exceptions must be contained.
 f.breakSettings();expect(()=>f.fail()).not.toThrow();expect(()=>f.click()).not.toThrow();expect(f.engine.issues().storageError).toBe(true);f.engine.dispose()
})
it('retains a caught authorization error until a later successful drain iteration',async()=>{
 let broken=true,sends=0
 const statuses:boolean[]=[]
 const inbox={recover:()=>{},settings:()=>({enabled:true,baselining:false}),pending:()=>[notice],claim:()=>true,finish:()=>{},issues:()=>({failed:0,unknown:0}),retry:()=>{}}
 const engine=createChangeDelivery({inbox:inbox as any,generation:()=>0,authorized:()=>{if(broken)throw Error('authorization storage unavailable');return true},send:async()=>{sends++;return 'submitted'},onClick:()=>{},onChange:()=>{statuses.push(engine.issues().storageError)}})
 await engine.evaluate();expect(sends).toBe(0);expect(engine.issues().storageError).toBe(true);expect(statuses).toEqual([true])
 broken=false;await engine.evaluate();expect(sends).toBe(1);expect(engine.issues().storageError).toBe(false);expect(statuses).toEqual([true,false]);engine.dispose()
})
