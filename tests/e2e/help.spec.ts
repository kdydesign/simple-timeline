import {test,expect} from './fixture'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
async function openHelp(d:import('./fixture').Desktop){
 await d.page.evaluate(()=>window.timelineWindow!.command('help'));
 await expect.poll(()=>d.app.windows().length).toBe(2);
 return d.app.windows().find(p=>p!==d.page)!
}
test.use({seed:'hotfix',fault:'close-denied'})
test('offline help isolates capabilities, remembers reading and follows tray without changing drafts',async({desktop:d},info)=>{
 const p=d.page
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click()
 await p.getByLabel('프로젝트 이름',{exact:true}).fill('도움말 중 보존할 입력')
 const h=await openHelp(d)
 await expect(h.getByRole('heading',{name:'Planrail 시작하기'})).toBeVisible()
 expect(await h.evaluate(()=>({data:'simpleTimeline'in window,share:'timelineSharing'in window,update:'timelineUpdates'in window,window:'timelineWindow'in window,node:typeof (window as any).require,help:Object.keys(window.planrailHelp!)}))).toEqual({data:false,share:false,update:false,window:false,node:'undefined',help:['command','onOpen']})
 expect(await h.evaluate(()=>window.planrailHelp!.command('deleteProject' as never))).toEqual({ok:false})
 await expect.poll(async()=>{try{return JSON.parse(await readFile(join(d.profile,'help-latest.json'),'utf8')).requests[0]?.readyMs}catch{return undefined}}).toBeDefined()
 await p.evaluate(()=>window.timelineWindow!.command('help'))
 expect(await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(2)
 await h.getByRole('button',{name:'참여자 등록과 승인',exact:true}).click()
 const image=h.getByRole('button',{name:/화면 확대:/});await expect(image.locator('img')).toHaveJSProperty('complete',true)
 expect(await image.locator('img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0)
 await image.click();await h.getByRole('button',{name:'확대',exact:true}).click();await h.keyboard.press('Escape');await expect(image).toBeFocused()
 await h.locator('main').evaluate(e=>{e.scrollTop=140});await expect.poll(()=>h.evaluate(async()=>(await window.planrailHelp!.command('state')).reading?.scrollTop)).toBe(140)
 await h.screenshot({path:info.outputPath('help-host.png')})
 await p.evaluate(()=>window.timelineWindow!.command('close'))
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible()))).toBe(true)
 await d.app.evaluate(()=> (globalThis as any).desktopController.show())
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>w.isVisible()))).toBe(true)
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('도움말 중 보존할 입력')
 // Help X hides the reusable window but must not revive it with the main window.
 await h.getByRole('button',{name:'도움말 닫기'}).click();expect(d.app.windows().length).toBe(2)
 await p.evaluate(()=>window.timelineWindow!.command('close'));await d.app.evaluate(()=>(globalThis as any).desktopController.show())
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length)).toBe(1)
 expect(await openHelp(d)).toBe(h)
 await expect(h.getByRole('heading',{name:'참여자 등록과 승인'})).toBeVisible();await expect.poll(()=>h.locator('main').evaluate(e=>e.scrollTop)).toBe(140)
 await expect.poll(async()=>{try{return JSON.parse(await readFile(join(d.profile,'help-latest.json'),'utf8')).requests.filter((r:any)=>r.readyMs!==undefined).length}catch{return 0}}).toBe(3)
 await expect.poll(async()=>JSON.parse(await readFile(join(d.profile,'help-latest.json'),'utf8')).renderer?.moduleReady).toEqual(expect.any(Number))
 const timings=JSON.parse(await readFile(join(d.profile,'help-latest.json'),'utf8'));await info.attach('help-timings',{body:JSON.stringify(timings,null,2),contentType:'application/json'})
 expect(timings.schemaVersion).toBe(2);expect(timings.preload.completed).toBeGreaterThanOrEqual(timings.preload.started);expect(timings.resourceRequests.some((r:any)=>r.kind==='document')).toBe(true)
 for(const r of timings.requests){expect(r.shownMs).toBeGreaterThanOrEqual(r.clickedMs);expect(r.readyMs).toBeGreaterThanOrEqual(r.clickedMs)}
 await h.getByRole('searchbox').fill('업데이트');await expect(h.getByRole('button',{name:/UPDATE로 설치하기/})).toBeVisible()
 await h.setViewportSize({width:560,height:600});await h.getByRole('button',{name:'목차 접기'}).click();expect(await h.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)
 await h.screenshot({path:info.outputPath('help-compact.png')})
})
test('new app session chooses role again and closes help when the app really exits',async({desktop:d})=>{
 const h=await openHelp(d)
 await h.getByRole('navigation').getByRole('button',{name:'호스트 연결하기',exact:true}).click();await h.getByRole('button',{name:'도움말 닫기'}).click()
 await d.restart();const next=await openHelp(d)
 await expect(next.getByRole('heading',{name:'Planrail 시작하기'})).toBeVisible()
 await d.page.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await d.page.getByLabel('프로젝트 이름',{exact:true}).fill('종료 시 폐기');
 const closed=next.waitForEvent('close'),exited=d.app.waitForEvent('close');await d.app.evaluate(()=> (globalThis as any).desktopController.requestQuit());await Promise.all([closed,exited])
})
