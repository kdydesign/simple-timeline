import {test,expect} from './fixture';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
test.use({seed:'hotfix',fault:'close-denied'});
test('custom titlebar keeps dirty close protection and isolated window API',async({desktop:d})=>{
 const p=d.page;
 await expect(p.getByRole('button',{name:'최소화',exact:true})).toBeVisible();
 expect(await p.evaluate(()=>window.timelineWindow!.command('invalid' as never))).toEqual({ok:false});
 const before=await p.evaluate(()=>Object.keys(window.simpleTimeline));expect(before.sort()).toEqual(['getStatus','getSnapshot','createProject','updateProject','deleteProject','createSchedule','updateSchedule','deleteSchedule','updateScheduleReminder'].sort());
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
 await p.getByLabel('프로젝트 이름',{exact:true}).fill('미저장 보호');
 // Hidden windows may defer the renderer's input acknowledgement until restored.
 const closing=p.getByRole('button',{name:'창 닫기',exact:true}).click().then(()=>null,error=>error);
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
 await d.app.evaluate(()=> (globalThis as any).desktopController.show());
 expect(await closing).toBeNull();
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('미저장 보호');
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
});
test('project popup keeps its size and fixed actions while long content scrolls',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1440,height:900});
 await p.evaluate(async()=>{for(let i=0;i<20;i++)await window.simpleTimeline.createProject({name:`추가 프로젝트 ${i}`,participants:[],color:'#2563EB'})});
 await p.reload();await p.getByRole('button',{name:'프로젝트 목록',exact:true}).click();
 const panel=p.getByRole('region',{name:'프로젝트 목록',exact:true});
 const rect=(await panel.boundingBox())!;expect(rect.width).toBe(290);expect(rect.height).toBe(442);
 const heading=panel.getByRole('heading'),footer=panel.getByRole('button',{name:'프로젝트 추가',exact:true});
 const hb=await heading.boundingBox(),fb=await footer.boundingBox();
 await panel.locator('.project-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
 expect(await heading.boundingBox()).toEqual(hb);expect(await footer.boundingBox()).toEqual(fb);
 await expect(panel.getByRole('button',{name:'추가 프로젝트 19 편집',exact:true})).toBeVisible();
 await p.setViewportSize({width:1280,height:500});
 // Viewport emulation can resolve before the resize listener commits React layout.
 // Keep the same 8px boundary, but wait for the rendered popup to satisfy it.
 await expect.poll(async()=>{
  const short=await panel.boundingBox();
  return short ? short.y+short.height : Infinity;
 }).toBeLessThanOrEqual(492);
 await expect(footer).toBeInViewport();
 await p.getByRole('button',{name:'간트',exact:true}).click();await expect(panel).toHaveCount(0);
 await p.getByRole('button',{name:'프로젝트 목록',exact:true}).click();await expect(panel).toBeVisible();
 await p.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(p.getByRole('button',{name:'프로젝트 목록',exact:true})).toBeFocused();
 await p.getByRole('button',{name:'달력',exact:true}).focus();await expect(p.getByRole('tooltip')).toContainText('달력');
});
test('date and nested month popovers do not shift the form or dismiss dirty editor',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1280,height:820});
 await p.locator('[data-focus="schedule-add"]').click();await p.getByLabel('일정 이름',{exact:true}).fill('날짜 선택');
 const end=p.getByLabel('종료일',{exact:true}),before=await end.boundingBox();
 await p.getByLabel('시작일',{exact:true}).click();expect(await end.boundingBox()).toEqual(before);
 await p.getByRole('combobox',{name:'달력 월',exact:true}).click();await expect(p.getByRole('listbox')).toBeVisible();
 await p.keyboard.press('Escape');await expect(p.getByRole('listbox')).toHaveCount(0);await expect(p.getByRole('group',{name:'시작일 달력'})).toBeVisible();
 await p.keyboard.press('Escape');await expect(p.getByRole('group',{name:'시작일 달력'})).toHaveCount(0);await expect(p.getByLabel('일정 이름',{exact:true})).toHaveValue('날짜 선택');
 await p.getByRole('combobox',{name:'소속 프로젝트',exact:true}).click();await p.getByRole('option',{name:'일정 없음 · #2',exact:true}).click();
 await expect(p.getByRole('combobox',{name:'소속 프로젝트'})).toContainText('일정 없음');
 await p.getByRole('combobox',{name:'소속 프로젝트'}).press('ArrowDown');
 await expect(p.getByRole('option',{name:'일정 없음 · #2',exact:true})).toBeFocused();
 await p.keyboard.press('Home');await expect(p.getByRole('option',{name:'1.1.1 핫픽스 · #1',exact:true})).toBeFocused();await p.keyboard.press('Enter');
 await expect(p.getByRole('combobox',{name:'소속 프로젝트'})).toContainText('1.1.1 핫픽스');
 await p.getByRole('combobox',{name:'소속 프로젝트'}).press('ArrowDown');await expect(p.getByRole('listbox')).toBeVisible();await p.keyboard.press('Tab');
 await expect(p.getByLabel('시작일',{exact:true})).toBeFocused();
 await p.setViewportSize({width:1280,height:500});await end.scrollIntoViewIfNeeded();await end.click();
 const bounds=(await p.getByRole('group',{name:'종료일 달력'}).boundingBox())!;
 expect(bounds.y).toBeGreaterThanOrEqual(8);expect(bounds.y+bounds.height).toBeLessThanOrEqual(492);
 expect(bounds.y).toBeLessThan((await end.boundingBox())!.y);
});
test('date toggle closes its open picker without changing draft',async({desktop:d})=>{
 const p=d.page;await p.locator('[data-focus="schedule-add"]').click();
 const input=p.getByLabel('시작일',{exact:true}),value=await input.inputValue();
 const toggle=p.getByRole('button',{name:'시작일 달력 열기',exact:true});
 await toggle.click();await expect(p.getByRole('group',{name:'시작일 달력'})).toBeVisible();
 await toggle.click();await expect(p.getByRole('group',{name:'시작일 달력'})).toHaveCount(0);
 await expect(input).toHaveValue(value);
});
test('toolbar date popup handles immediate Escape and returns focus to its input',async({desktop:d})=>{
 const p=d.page,trigger=p.getByLabel('선택 날짜',{exact:true});
 await trigger.focus();await p.keyboard.press('Alt+ArrowDown');
 await expect(p.getByRole('group',{name:'선택 날짜 달력'})).toBeVisible();
 await p.keyboard.press('Escape');await expect(p.getByRole('group',{name:'선택 날짜 달력'})).toHaveCount(0);
 await expect(trigger).toBeFocused();
});
