import type { PollOutcome } from './client'
import type { SharingConnectionStatus } from '../../shared/sharing'
interface Options {
  poll(options:{etag?:string;force?:boolean;signal:AbortSignal;cursor?:string|null;reconnecting?:boolean}):Promise<PollOutcome>
  apply(outcome:Extract<PollOutcome,{kind:'snapshot'}>,reconnecting:boolean):void
  cursor?:()=>string|null
  outcome?(outcome:PollOutcome):void
  state(status:SharingConnectionStatus,error?:unknown):void
  now?:()=>number
}
/** Owns the committed condition, request serialization, deadlines and freshness. */
export function createSyncController(o:Options) {
  const now=o.now??(()=>performance.now())
  let stopped=false,epoch=0,etag:string|undefined,lastSuccess:number|undefined,connected=false,failures=0
  let timer:ReturnType<typeof setTimeout>|undefined,running:Promise<void>|undefined,forced:Promise<void>|undefined,abort:AbortController|undefined
  const clear=()=>{if(timer)clearTimeout(timer);timer=undefined}
  const fresh=()=>!stopped&&connected&&lastSuccess!==undefined&&now()-lastSuccess<7000
  async function run(force:boolean){
    const generation=++epoch,controller=new AbortController();abort=controller;clear()
    let deadline:ReturnType<typeof setTimeout>|undefined
    const current=()=>!stopped&&generation===epoch
    try{
      const timeout=new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'))},5000)})
      const reconnecting=!fresh()
      const result=await Promise.race([o.poll({etag,force,signal:controller.signal,cursor:o.cursor?.(),reconnecting}),timeout])
      if(!current())return
      if(result.kind==='snapshot'){o.apply(result,reconnecting);etag=result.etag}
      if(result.kind==='unchanged'&&!etag)throw Error('CACHE_NOT_VALIDATED')
      if(result.kind==='snapshot'||result.kind==='unchanged'){
        connected=true;lastSuccess=now();failures=0;o.outcome?.(result);o.state('connected')
      }else if(result.kind==='revoked'){
        connected=false;etag=undefined;o.outcome?.(result);o.state('revoked');stop();return
      }else{o.outcome?.(result);o.state(result.kind==='pending'?'pairing':'connecting')}
    }catch(error){
      if(!current())return
      connected=false;failures++;o.state('disconnected',error)
    }finally{
      if(deadline)clearTimeout(deadline)
      if(current())timer=setTimeout(()=>{void refresh()},failures?Math.min(2000*2**Math.min(failures-1,4),30000):2000)
    }
  }
  function refresh(force=false):Promise<void>{
    if(stopped)return Promise.resolve()
    if(running){
      if(!force)return running
      if(!forced)forced=running.then(()=>{forced=undefined;return refresh(true)})
      return forced
    }
    running=run(force).finally(()=>{running=undefined})
    return running
  }
  async function command<T>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    while(running)await running
    if(stopped)throw Error('STOPPED')
    clear()
    const generation=++epoch,controller=new AbortController();abort=controller
    let deadline:ReturnType<typeof setTimeout>|undefined
    const result=Promise.race([operation(controller.signal),new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'))},5000)})])
    running=result.then(()=>{},error=>{if(!stopped&&generation===epoch){connected=false;failures++;o.state('disconnected',error)}}).finally(()=>{
      if(deadline)clearTimeout(deadline)
      running=undefined
      if(!stopped&&generation===epoch)timer=setTimeout(()=>{void refresh()},2000)
    })
    return result
  }
  function stop(){if(stopped)return;stopped=true;connected=false;epoch++;clear();abort?.abort()}
  return {refresh,command,fresh,authorize:async()=>{await refresh(true);return fresh()},stop}
}
