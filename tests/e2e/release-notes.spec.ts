import {test,expect} from './fixture'
test.use({seed:'hotfix',fault:'close-denied'})
test('opens independent offline release notes and help, restores reading in a new window, and preserves drafts',async({desktop:d},info)=>{
 const p=d.page;await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('입력 유지');
 expect(await p.locator('#root').evaluate(e=>getComputedStyle(e).borderTopWidth)).toBe('0px');await expect(p.locator('.window-control-separator')).toHaveCount(2);for(const separator of await p.locator('.window-control-separator').all())await expect(separator).toBeVisible();
 await p.getByRole('button',{name:'릴리즈노트',exact:true}).click();await expect.poll(()=>d.app.windows().some(w=>w.url().includes('release-notes.html'))).toBe(true);
 const r=d.app.windows().find(w=>w.url().includes('release-notes.html'))!;await expect(r.getByRole('heading',{name:'WorkRail 1.1.0',exact:true})).toBeVisible();
 expect(await r.evaluate(()=>({node:typeof (window as any).require,data:'simpleTimeline'in window,help:'planrailHelp'in window,sharing:'timelineSharing'in window,updates:'timelineUpdates'in window,postRail:'postRail'in window}))).toEqual({node:'undefined',data:false,help:false,sharing:false,updates:false,postRail:false});
 expect(await r.evaluate(()=>window.planrailReleaseNotes!.command('deleteProject' as never))).toEqual({ok:false});
 await r.getByRole('button',{name:'0.8.3',exact:true}).click();await expect(r.getByRole('heading',{name:'Fix · 오류 수정'})).toBeVisible();await r.screenshot({path:info.outputPath('release-notes.png')});
 await p.evaluate(()=>window.timelineWindow!.command('help'));await expect.poll(()=>d.app.windows().filter(w=>/help.html|release-notes.html/.test(w.url())).length).toBe(2);
 await p.evaluate(()=>window.timelineWindow!.command('close'));await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible()))).toBe(true);
 await d.app.evaluate(()=>(globalThis as any).desktopController.show());await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length)).toBe(3);
 await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/release-notes.html'))!.setContentSize(850,360))
 await r.locator('main').evaluate(e=>{e.scrollTop=100})
 await expect.poll(()=>r.evaluate(async()=>(await window.planrailReleaseNotes!.command('state')).reading?.scrollTop)).toBe(100)
 // Close in the same browser task as the last scroll, before its event can reach the main process.
 await r.getByRole('button',{name:'릴리즈노트 닫기'}).evaluate(button=>{
  const closeButton=button as HTMLButtonElement
  document.querySelector('main')!.scrollTop=125
  closeButton.click()
 })
 await expect.poll(()=>r.isClosed()).toBe(true)
 await p.evaluate(()=>window.timelineWindow!.command('close'));await d.app.evaluate(()=>(globalThis as any).desktopController.show());await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length)).toBe(2);
 const open=d.app.waitForEvent('window')
 await p.getByRole('button',{name:'릴리즈노트',exact:true}).click()
 const replacement=await open
 await expect(replacement.getByRole('heading',{name:'Planrail 0.8.3',exact:true})).toBeVisible()
 await expect.poll(()=>replacement.locator('main').evaluate(e=>e.scrollTop)).toBe(125)
 // Suppress the normal scroll notification so only the native close checkpoint can save this offset.
 await replacement.locator('main').evaluate(main=>{
  main.addEventListener('scroll',event=>event.stopImmediatePropagation(),true)
  main.scrollTop=160
 })
 await expect.poll(()=>replacement.evaluate(async()=>(await window.planrailReleaseNotes!.command('state')).reading?.scrollTop)).toBe(125)
 await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/release-notes.html'))!.close())
 await expect.poll(()=>replacement.isClosed()).toBe(true)
 const nativeReopen=d.app.waitForEvent('window')
 await p.getByRole('button',{name:'릴리즈노트',exact:true}).click()
 const afterNativeClose=await nativeReopen
 await expect(afterNativeClose.getByRole('heading',{name:'Planrail 0.8.3',exact:true})).toBeVisible()
 await expect.poll(()=>afterNativeClose.locator('main').evaluate(e=>e.scrollTop)).toBe(160)
 expect(d.app.windows().length).toBe(3);await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('입력 유지');
})
