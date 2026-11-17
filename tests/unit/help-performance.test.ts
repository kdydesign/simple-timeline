import {it,expect} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHelpPerformance} from '../../src/main/help-performance'
it('records bounded opening stages and only current request readiness with numeric durations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'planrail-help-perf-'))
 try{const p=createHelpPerformance(root,'0.8.4');p.mark('prepare-start');p.mark('dom-ready');let id=0;for(let i=0;i<25;i++){id=p.open(i?'reopen':'cold');p.shown(id);p.ready(id)}await p.flush();const data=JSON.parse(await readFile(join(root,'help-latest.json'),'utf8'));expect(data.requests).toHaveLength(20);expect(data.appVersion).toBe('0.8.4');expect(data.requests.at(-1)).toMatchObject({id,kind:'reopen'});expect(data.requests.at(-1).readyMs).toBeGreaterThanOrEqual(data.requests.at(-1).clickedMs);expect(Object.keys(data.stages)).toEqual(['prepare-start','dom-ready'])}finally{await rm(root,{recursive:true,force:true})}
})

it('bounds resource evidence and strips unknown timing content while rejecting invalid values',async()=>{
 const root=await mkdtemp(join(tmpdir(),'planrail-help-perf-'))
 try{const p=createHelpPerformance(root,'0.8.5');for(let i=0;i<50;i++){p.requestStarted(i,'script');p.requestFinished(i,false)}
 expect(p.preload({timeOrigin:1000,started:1,completed:2,path:'secret'})).toBe(true)
 expect(p.preload({timeOrigin:1000,started:NaN,completed:2})).toBe(false)
 expect(p.renderer({timeOrigin:1000,navigation:{responseEnd:5,domInteractive:100,url:'secret'},paints:{'first-paint':101},moduleReady:99,query:'secret'})).toBe(true)
 expect(p.renderer({timeOrigin:1000,navigation:{responseEnd:-1},paints:{},moduleReady:null})).toBe(false)
 await p.flush();const text=await readFile(join(root,'help-latest.json'),'utf8'),data=JSON.parse(text)
 expect(data.schemaVersion).toBe(2);expect(data.resourceRequests).toHaveLength(40);expect(text).not.toContain('secret');expect(data.preload.clock).toBe('milliseconds-since-preload-performance-origin');expect(data.renderer.navigation.domInteractive).toBe(100)
 }finally{await rm(root,{recursive:true,force:true})}
})
