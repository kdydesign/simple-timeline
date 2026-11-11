import { expect, it } from 'vitest'
import { createRendererInstallGuard } from '../../src/main/updates/installer'
import { dispatchUpdateCommand } from '../../src/main/updates/ipc-core'
it('rejects other senders, arbitrary arguments, and wrong-role commands',async()=>{
 let downloaded=0
 const service={getState:()=>({role:'host'}),download:async()=>{downloaded++}} as any
 expect(await dispatchUpdateCommand(service,['download'],false)).toMatchObject({ok:false})
 expect(await dispatchUpdateCommand(service,['download'],true)).toMatchObject({ok:false})
 expect(await dispatchUpdateCommand(service,['importBundle','C:/arbitrary.exe'],true)).toMatchObject({ok:false})
 expect(downloaded).toBe(0)
})
it('renderer guard requires matching nonce and fails closed on missing or dirty acknowledgment',async()=>{
 const sent:any[]=[];const guard=createRendererInstallGuard(v=>sent.push(v),20)
 const request=guard.freeze();expect(guard.acknowledge('wrong',true)).toBe(false);expect(await request).toBe(false)
 const second=guard.freeze();expect(guard.acknowledge(sent.at(-1).requestId,false)).toBe(true);expect(await second).toBe(false)
 guard.release();expect(sent.at(-1).action).toBe('release')
})
it('main dispatcher rejects new mutations while install barrier is frozen',async()=>{
 const {appMutationBarrier,dispatch}=await import('../../src/main/ipc-core')
 await appMutationBarrier.freeze()
 try{expect(dispatch({state:'ready',repository:{createProject:()=>{throw Error('should not execute')}}} as any,'createProject',[{name:'P',color:'#2563EB',participants:[]}],true)).toMatchObject({ok:false,error:{code:'FORBIDDEN'}})}finally{appMutationBarrier.release()}
})
