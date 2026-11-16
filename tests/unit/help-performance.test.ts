import {it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHelpPerformance} from '../../src/main/help-performance'
it('records bounded opening stages and only current request readiness with numeric durations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'planrail-help-perf-'))
 try{const p=createHelpPerformance(root,'0.8.4');p.mark('prepare-start');p.mark('dom-ready');let id=0;for(let i=0;i<25;i++){id=p.open(i?'reopen':'cold');p.shown(id);p.ready(id)}await p.flush();const data=JSON.parse(await readFile(join(root,'help-latest.json'),'utf8'));expect(data.requests).toHaveLength(20);expect(data.appVersion).toBe('0.8.4');expect(data.requests.at(-1)).toMatchObject({id,kind:'reopen'});expect(data.requests.at(-1).readyMs).toBeGreaterThanOrEqual(data.requests.at(-1).clickedMs);expect(Object.keys(data.stages)).toEqual(['prepare-start','dom-ready'])}finally{await rm(root,{recursive:true,force:true})}
})
