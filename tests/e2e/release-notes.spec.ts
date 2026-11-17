import {test,expect} from './fixture'
test.use({seed:'hotfix',fault:'close-denied'})
test('opens independent offline release notes and help, reuses closed notes, and preserves drafts',async({desktop:d},info)=>{
 const p=d.page;await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('입력 유지');
 expect(await p.locator('#root').evaluate(e=>getComputedStyle(e).borderTopWidth)).toBe('0px');await expect(p.locator('.window-control-separator')).toBeVisible();
 await p.getByRole('button',{name:'릴리즈노트',exact:true}).click();await expect.poll(()=>d.app.windows().some(w=>w.url().includes('release-notes.html'))).toBe(true);
 const r=d.app.windows().find(w=>w.url().includes('release-notes.html'))!;await expect(r.getByRole('heading',{name:'Planrail 0.8.5',exact:true})).toBeVisible();
 expect(await r.evaluate(()=>({node:typeof (window as any).require,data:'simpleTimeline'in window,help:'planrailHelp'in window,sharing:'timelineSharing'in window,updates:'timelineUpdates'in window}))).toEqual({node:'undefined',data:false,help:false,sharing:false,updates:false});
 expect(await r.evaluate(()=>window.planrailReleaseNotes!.command('deleteProject' as never))).toEqual({ok:false});
 await r.getByRole('button',{name:'0.8.3',exact:true}).click();await expect(r.getByRole('heading',{name:'Fix · 오류 수정'})).toBeVisible();await r.screenshot({path:info.outputPath('release-notes.png')});
 await p.evaluate(()=>window.timelineWindow!.command('help'));await expect.poll(()=>d.app.windows().filter(w=>/help.html|release-notes.html/.test(w.url())).length).toBe(2);
 await p.evaluate(()=>window.timelineWindow!.command('close'));await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible()))).toBe(true);
 await d.app.evaluate(()=>(globalThis as any).desktopController.show());await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length)).toBe(3);
 await r.getByRole('button',{name:'릴리즈노트 닫기'}).click();await p.evaluate(()=>window.timelineWindow!.command('close'));await d.app.evaluate(()=>(globalThis as any).desktopController.show());await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length)).toBe(2);
 await p.getByRole('button',{name:'릴리즈노트',exact:true}).click();await expect(r.getByRole('heading',{name:'Planrail 0.8.3',exact:true})).toBeVisible();expect(d.app.windows().length).toBe(3);await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('입력 유지');
})
