import {it,expect} from 'vitest'
import {createLoginStartup} from '../../src/main/login-startup'
const unset={selected:null,registered:false,disabled:false} as const
it('reads unset, explicit off, on and Windows disabled without repairing registry',async()=>{
 for(const state of [unset,{selected:false,registered:false,disabled:false},{selected:true,registered:true,disabled:false},{selected:true,registered:true,disabled:true}]){
  const commands:string[]=[];const startup=createLoginStartup({supported:true,execute:async action=>{commands.push(action);return state}})
  expect(await startup.read()).toEqual({...state,supported:true,enabled:state.registered&&!state.disabled});expect(commands).toEqual(['Read'])
 }
})
it('explicit on re-enables OS disabled startup; explicit off persists; failures return actual state',async()=>{
 let state={selected:true,registered:true,disabled:true},fail=false
 const startup=createLoginStartup({supported:true,execute:async action=>{if(action!=='Read'){if(fail)throw Error('denied');state={selected:action==='On',registered:action==='On',disabled:false}}return state}})
 expect((await startup.set(true)).state.enabled).toBe(true)
 expect((await startup.set(false)).state.selected).toBe(false)
 fail=true;const result=await startup.set(true);expect(result.error).toBe('denied');expect(result.state.enabled).toBe(false)
})
it('development and other platforms never read or register login commands',async()=>{
 const startup=createLoginStartup({supported:false,execute:async()=>{throw Error('must not execute')}})
 expect((await startup.read()).supported).toBe(false);expect((await startup.set(true)).state.enabled).toBe(false)
})
