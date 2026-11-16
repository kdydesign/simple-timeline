import type {MemberPresence} from '../../shared/sharing'
/** Presence is process-local. Wall clock is display-only; freshness uses monotonic time. */
export function createMemberPresence(o:{now:()=>number;wallClock?:()=>Date;changed:()=>void}){
 const seen=new Map<string,{at:number;wall:string;connected:boolean}>();let disposed=false
 const fresh=(at:number)=>o.now()-at>=0&&o.now()-at<=10000
 const timer=setInterval(()=>{let changed=false;for(const entry of seen.values())if(entry.connected&&!fresh(entry.at)){entry.connected=false;changed=true}if(changed&&!disposed)o.changed()},1000)
 timer.unref?.()
 return {
  record(id:string){if(disposed)return;seen.set(id,{at:o.now(),wall:(o.wallClock??(()=>new Date()))().toISOString(),connected:true});o.changed()},
  snapshot(ids:string[]):Record<string,MemberPresence>{return Object.fromEntries(ids.map(id=>{const s=seen.get(id);return [id,{connected:!!s&&fresh(s.at),lastSeenAt:s?.wall??null}]}))},
  invalidate(id?:string){if(id)seen.delete(id);else seen.clear()},
  dispose(){disposed=true;clearInterval(timer);seen.clear()},
 }
}
