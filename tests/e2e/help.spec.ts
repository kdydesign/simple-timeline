import {test,expect} from './fixture'
test.use({seed:'hotfix',fault:'close-denied'})
test('offline help isolates capabilities, remembers reading and follows tray without changing drafts',async({desktop:d},info)=>{
 const p=d.page
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click()
 await p.getByLabel('프로젝트 이름',{exact:true}).fill('도움말 중 보존할 입력')
 const opened=d.app.waitForEvent('window');await p.getByRole('button',{name:'도움말',exact:true}).click();let h=await opened
 await expect(h.getByRole('heading',{name:'호스트와 멤버 이해하기'})).toBeVisible()
 expect(await h.evaluate(()=>({data:'simpleTimeline'in window,share:'timelineSharing'in window,update:'timelineUpdates'in window,window:'timelineWindow'in window,node:typeof (window as any).require,help:Object.keys(window.planrailHelp!)}))).toEqual({data:false,share:false,update:false,window:false,node:'undefined',help:['command']})
 expect(await h.evaluate(()=>window.planrailHelp!.command('deleteProject' as never))).toEqual({ok:false})
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
 // Exit cancellation keeps both windows and the main draft intact.
 await d.app.evaluate(()=> (globalThis as any).desktopController.requestQuit())
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('도움말 중 보존할 입력')
 await h.getByRole('button',{name:'도움말 닫기'}).click();await expect.poll(()=>d.app.windows().length).toBe(1)
 const again=d.app.waitForEvent('window');await p.evaluate(()=>window.timelineWindow!.command('help'));h=await again
 await expect(h.getByRole('heading',{name:'참여자 등록과 승인'})).toBeVisible();await expect.poll(()=>h.locator('main').evaluate(e=>e.scrollTop)).toBe(140)
 await h.getByRole('searchbox').fill('업데이트');await expect(h.getByRole('button',{name:/UPDATE로 설치하기/})).toBeVisible()
 await h.setViewportSize({width:560,height:600});await h.getByRole('button',{name:'목차 접기'}).click();expect(await h.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)
 await h.screenshot({path:info.outputPath('help-compact.png')})
})
test('new app session chooses role again and closes help when the app really exits',async({desktop:d})=>{
 const opened=d.app.waitForEvent('window');await d.page.evaluate(()=>window.timelineWindow!.command('help'));const h=await opened
 await h.getByRole('navigation').getByRole('button',{name:'호스트 연결하기',exact:true}).click();await h.getByRole('button',{name:'도움말 닫기'}).click()
 await d.restart();const reopened=d.app.waitForEvent('window');await d.page.evaluate(()=>window.timelineWindow!.command('help'));const next=await reopened
 await expect(next.getByRole('heading',{name:'호스트와 멤버 이해하기'})).toBeVisible()
 const closed=next.waitForEvent('close');await d.app.evaluate(()=> (globalThis as any).desktopController.requestQuit());await closed
})
