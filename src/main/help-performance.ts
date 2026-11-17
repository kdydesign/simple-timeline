import {writeFile,rename} from 'node:fs/promises'
import {join} from 'node:path'
type Stage='prepare-start'|'window-created'|'load-requested'|'dom-ready'|'renderer-loaded'|'first-paint-ready'|'failed'
type Opening={id:number;kind:'cold'|'prepared'|'reopen'|'existing';clickedMs:number;shownMs?:number;readyMs?:number}
export const helpNavigationFields=['startTime','fetchStart','domainLookupStart','domainLookupEnd','connectStart','connectEnd','requestStart','responseStart','responseEnd','domInteractive','domContentLoadedEventStart','domContentLoadedEventEnd','loadEventStart','loadEventEnd']
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const finite=(v:unknown,max=86400000):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
function numbers(value:unknown,keys:string[]){if(!object(value))return null;const out:Record<string,number>={};for(const key of keys){if(value[key]===undefined)continue;if(!finite(value[key]))return null;out[key]=value[key]}return out}
/** Only allowlisted numeric evidence is persisted; never URLs, queries, paths or renderer text. */
export function createHelpPerformance(profile:string,appVersion:string){
 const stages:Partial<Record<Stage,number>>={},requests:Opening[]=[],resources=new Map<number,{kind:string;startedMs:number;completedMs?:number;failed?:boolean}>()
 let serial=0,writes=Promise.resolve(),preload:unknown,renderer:unknown
 const now=()=>Math.round(performance.now())
 const save=()=>{const report=JSON.stringify({schemaVersion:2,appVersion,electronVersion:process.versions.electron,platform:process.platform,clock:'milliseconds-since-main-start',timeOrigin:performance.timeOrigin,recordedAt:new Date().toISOString(),stages,requests,resourceRequests:[...resources.values()],preload,renderer},null,2);writes=writes.then(async()=>{const path=join(profile,'help-latest.json');await writeFile(path+'.partial',report);await rename(path+'.partial',path)}).catch(()=>{})}
 return {
  mark(stage:Stage){if(stage==='prepare-start'){resources.clear();preload=undefined;renderer=undefined;for(const key of Object.keys(stages))delete stages[key as Stage]}stages[stage]=now();save()},
  open(kind:Opening['kind']){const id=++serial;requests.push({id,kind,clickedMs:now()});if(requests.length>20)requests.shift();save();return id},
  shown(id:number){const r=requests.find(r=>r.id===id);if(r&&r.shownMs===undefined){r.shownMs=now();save()}},
  ready(id:number){const r=requests.find(r=>r.id===id);if(r&&r.readyMs===undefined){r.readyMs=now();save()}},
  requestStarted(id:number,kind:string){if(resources.size>=40)return;resources.set(id,{kind:['document','script','style','other'].includes(kind)?kind:'other',startedMs:now()});save()},
  requestFinished(id:number,failed:boolean){const r=resources.get(id);if(r){r.completedMs=now();r.failed=failed;save()}},
  preload(value:unknown){if(!object(value)||!finite(value.timeOrigin,1e15)||!finite(value.started)||!finite(value.completed)||value.completed<value.started)return false;preload={clock:'milliseconds-since-preload-performance-origin',timeOrigin:value.timeOrigin,started:value.started,completed:value.completed};save();return true},
  renderer(value:unknown){if(!object(value)||!finite(value.timeOrigin,1e15)||(value.moduleReady!==null&&!finite(value.moduleReady)))return false;const navigation=numbers(value.navigation,helpNavigationFields),paints=numbers(value.paints,['first-paint','first-contentful-paint']);if(!navigation||!paints)return false;renderer={clock:'milliseconds-since-navigation-start',timeOrigin:value.timeOrigin,navigation,paints,moduleReady:value.moduleReady};save();return true},
  flush:()=>writes,
 }
}
