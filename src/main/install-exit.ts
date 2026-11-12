import {win32,posix} from 'node:path'
import type {MutationBarrier} from './updates/installer'
export function parseInstallExit(args:readonly string[],executable:string):'none'|'valid'|'invalid'{
 if(!args.includes('--planrail-install-exit'))return 'none'
 const paths=win32.isAbsolute(executable)?win32:posix
 const index=args.indexOf('--planrail-install-target'),target=args[index+1]
 if(args.filter(a=>a==='--planrail-install-exit').length!==1||index<0||args.filter(a=>a==='--planrail-install-target').length!==1||!target||!paths.isAbsolute(target)||!paths.isAbsolute(executable))return 'invalid'
 return (paths===win32?paths.normalize(target).toLowerCase():paths.normalize(target))===(paths===win32?paths.normalize(executable).toLowerCase():paths.normalize(executable))?'valid':'invalid'
}
/** Freeze synchronously even while bootstrap is initializing, then drain and close once ready. */
export function createInstallExit(barrier:MutationBarrier){
 let provide!:(shutdown:()=>Promise<void>)=>void,pending:Promise<void>|undefined
 const ready=new Promise<()=>Promise<void>>(resolve=>{provide=resolve})
 return {request():Promise<void>{
  if(!pending){pending=(async()=>{await barrier.freezeForShutdown();await (await ready)()})();void pending.catch(()=>{pending=undefined})}
  return pending
 },ready(shutdown:()=>Promise<void>){provide(shutdown)}}
}
