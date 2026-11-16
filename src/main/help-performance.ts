import {writeFile,rename} from 'node:fs/promises'
import {join} from 'node:path'
type Stage='prepare-start'|'window-created'|'load-requested'|'dom-ready'|'first-paint-ready'|'failed'
type Opening={id:number;kind:'cold'|'prepared'|'reopen'|'existing';clickedMs:number;shownMs?:number;readyMs?:number}
/** Bounded timing evidence only: never records article text, queries, paths or user data. */
export function createHelpPerformance(profile:string,appVersion:string){
 const stages:Partial<Record<Stage,number>>={},requests:Opening[]=[];let serial=0,writes=Promise.resolve()
 const now=()=>Math.round(performance.now())
 const save=()=>{const report=JSON.stringify({schemaVersion:1,appVersion,platform:process.platform,clock:'milliseconds-since-main-start',recordedAt:new Date().toISOString(),stages,requests},null,2);writes=writes.then(async()=>{const path=join(profile,'help-latest.json');await writeFile(path+'.partial',report);await rename(path+'.partial',path)}).catch(()=>{})}
 return {mark(stage:Stage){stages[stage]=now();save()},open(kind:Opening['kind']){const id=++serial;requests.push({id,kind,clickedMs:now()});if(requests.length>20)requests.shift();save();return id},shown(id:number){const r=requests.find(r=>r.id===id);if(r&&r.shownMs===undefined){r.shownMs=now();save()}},ready(id:number){const r=requests.find(r=>r.id===id);if(r&&r.readyMs===undefined){r.readyMs=now();save()}},flush:()=>writes}
}
