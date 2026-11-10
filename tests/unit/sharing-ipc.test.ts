import {expect,it} from 'vitest'
import {dispatchSharing} from '../../src/main/sharing/ipc-core'
it('accepts only fixed bounded commands from trusted sender and never invokes a prototype method',async()=>{
 let calls=0
 const service={getState:()=>({role:'personal'}),configureHost:()=>{calls++;return {} }} as any
 expect((await dispatchSharing(service,['getState'],false)).ok).toBe(false)
 for(const args of [['constructor'],['__proto__'],['getState',{}],['configureHost',{address:'127.0.0.1',port:47831,url:'evil'}],['configureHost',{address:'a'.repeat(70000),port:47831}],['connect',{address:'127.0.0.1',port:0}],['approve',{pairId:'x',confirmed:false}],['saveDevice',{name:'X',ip:'127.0.0.1',installationId:'forged'}]])expect((await dispatchSharing(service,args,true)).ok).toBe(false)
 expect(calls).toBe(0)
 expect((await dispatchSharing(service,['configureHost',{address:'127.0.0.1',port:47831}],true)).ok).toBe(true);expect(calls).toBe(1)
})
it('returns a fixed actionable deletion retry error without exposing the vault failure',async()=>{
 const {CredentialCleanupError}=await import('../../src/main/sharing/secrets')
 const service={disconnect:async()=>{throw new CredentialCleanupError()}} as any
 const result=await dispatchSharing(service,['disconnect',{confirmed:true}],true)
 expect(result.ok).toBe(false)
 if(!result.ok){expect(result.error.code).toBe('STORAGE_IO');expect(result.error.message).toContain('연결 해제를 다시 시도')}
})
