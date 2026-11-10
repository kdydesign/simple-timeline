import {test,expect} from './fixture';
import {execFileSync} from 'node:child_process';
// Xvfb without a window manager cannot implement native minimize/maximize states.
const nativeWindowStates=process.platform!=='linux'||(()=>{
 try{
  const options={encoding:'utf8' as const,timeout:2000,stdio:['ignore','pipe','ignore'] as ['ignore','pipe','ignore']};
  const root=execFileSync('xprop',['-root','_NET_SUPPORTING_WM_CHECK'],options);
  const id=root.match(/window id # (0x[1-9a-f][0-9a-f]*)/i)?.[1];
  // EWMH requires the manager's live supporting window to point to itself.
  return !!id&&execFileSync('xprop',['-id',id,'_NET_SUPPORTING_WM_CHECK'],options).includes(id);
 }catch{return false}
})();
test.use({seed:'hotfix'});
test('only the seven approved header controls show aligned shadcn tooltips',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});
 const allowed=['프로젝트 목록','간트','달력','오늘','다크 모드','프로젝트 추가','일정 추가'];
 for(const name of allowed){
  const button=p.locator('.toolbar').getByRole('button',{name,exact:true});
  await button.hover();
  await p.waitForTimeout(100);
  await expect(p.getByRole('tooltip')).toHaveCount(0);
  const tip=p.locator('[data-slot="tooltip-content"]');
  await expect(tip).toBeVisible();
  await expect(p.getByRole('tooltip')).toHaveText(name);
  const b=(await button.boundingBox())!,t=(await tip.boundingBox())!;
  const expectedLeft=Math.max(8,Math.min(b.x+b.width/2-t.width/2,1440-t.width-8));
  expect(Math.abs(t.x-expectedLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(t.y-b.y-b.height-8)).toBeLessThanOrEqual(1);
  await p.mouse.move(700,400);await expect(tip).toHaveCount(0);
 }
 for(const name of ['최소화','최대화','창 닫기','이전 달','다음 달']){
  await p.getByRole('button',{name,exact:true}).hover();await p.waitForTimeout(300);await expect(p.getByRole('tooltip')).toHaveCount(0);
 }
 await p.locator('[data-focus="schedule-add"]').click();
 for(const name of ['취소','저장','편집 닫기']){
  await p.getByRole('button',{name,exact:true}).hover();await p.waitForTimeout(300);await expect(p.getByRole('tooltip')).toHaveCount(0);
 }
 await p.locator('.toolbar').getByRole('button',{name:'달력',exact:true}).focus();await expect(p.getByRole('tooltip')).toHaveText('달력');
 await p.keyboard.press('Escape');await expect(p.getByRole('tooltip')).toHaveCount(0);
 await p.locator('.toolbar').getByRole('button',{name:'간트',exact:true}).focus();await expect(p.getByRole('tooltip')).toHaveText('간트');
 await p.getByRole('button',{name:'최소화',exact:true}).focus();await expect(p.getByRole('tooltip')).toHaveCount(0);
 await p.locator('.toolbar').getByRole('button',{name:'달력',exact:true}).focus();await expect(p.getByRole('tooltip')).toHaveText('달력');
 await p.locator('.toolbar').getByRole('button',{name:'달력',exact:true}).click();await expect(p.getByRole('tooltip')).toHaveCount(0);
 expect(await p.locator('[title]').count()).toBe(0);
 await expect(p.getByLabel('일정 이름',{exact:true})).toHaveAttribute('data-slot','input');
 await expect(p.getByRole('button',{name:'저장',exact:true})).toHaveAttribute('data-slot','button');
});
test('zoom percent resets to 100% and is exclusive to Gantt',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});
 expect(await p.locator('main').evaluate(e=>e.scrollHeight-e.clientHeight)).toBe(0);
 const footer=(await p.locator('.gantt-navigation').boundingBox())!;expect(footer.y+footer.height).toBeLessThanOrEqual(900);
 await expect(p.getByRole('button',{name:'간트 배율 100%로 초기화'})).toHaveText('100%');
 const axis=p.locator('.gantt-date-heading');const b=(await axis.boundingBox())!;
 await p.mouse.move(b.x+150,b.y+35);await p.keyboard.down('Control');await p.mouse.wheel(0,-100);await p.keyboard.up('Control');
 await expect(p.getByRole('button',{name:'간트 배율 100%로 초기화'})).not.toHaveText('100%');
 await p.getByRole('button',{name:'달력',exact:true}).click();await expect(p.getByRole('button',{name:'간트 배율 100%로 초기화'})).toHaveCount(0);
});
test('portalled controls retain real editor focus and nested Escape at a short viewport',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:760,height:500});
 await p.locator('[data-focus="schedule-add"]').click();
 await p.getByLabel('일정 이름',{exact:true}).fill('포커스 보존');
 const start=p.getByLabel('시작일',{exact:true}),end=p.getByLabel('종료일',{exact:true});
 await start.scrollIntoViewIfNeeded();const before=await end.boundingBox();await start.click();expect(await end.boundingBox()).toEqual(before);
 const picker=p.getByRole('group',{name:'시작일 달력',exact:true});await expect(picker).toHaveAttribute('data-slot','popover-content');
 await p.getByRole('combobox',{name:'달력 월',exact:true}).click();
 const list=p.getByRole('listbox');await expect(list).toBeVisible();
 expect(await list.evaluate(e=>e.contains(document.activeElement))).toBe(true);
 await p.keyboard.press('End');await expect(p.getByRole('option',{name:'12월',exact:true})).toBeFocused();await p.keyboard.press('Enter');
 await expect(p.getByRole('combobox',{name:'달력 월',exact:true})).toContainText('12월');await expect(picker).toBeVisible();
 await p.getByRole('combobox',{name:'달력 월',exact:true}).click();await p.keyboard.press('Escape');await expect(list).toHaveCount(0);await expect(picker).toBeVisible();
 await expect(p.getByRole('combobox',{name:'달력 월',exact:true})).toBeFocused();
 await p.keyboard.press('Escape');await expect(picker).toHaveCount(0);await expect(start).toBeFocused();
 await expect(p.getByRole('alertdialog')).toHaveCount(0);await expect(p.getByLabel('일정 이름',{exact:true})).toHaveValue('포커스 보존');
 await p.getByRole('button',{name:'저장',exact:true}).focus();await p.keyboard.press('Tab');await expect(p.getByRole('button',{name:'편집 닫기',exact:true})).toBeFocused();
 await end.scrollIntoViewIfNeeded();await end.click();const bounds=(await p.getByRole('group',{name:'종료일 달력',exact:true}).boundingBox())!;
 expect(bounds.y).toBeGreaterThanOrEqual(8);expect(bounds.y+bounds.height).toBeLessThanOrEqual(492);
});
test('approved Forest Crystal tokens distinguish selected dates and today in light and dark',async({desktop:{page:p}})=>{
 for(const theme of ['light','dark']){
  await expect(p.locator('.gantt-name small').first()).toHaveCSS('font-size','12px');
  await expect(p.locator('.gantt-bar').first()).toHaveCSS('font-size','13px');
  await expect(p.getByRole('button',{name:'간트 배율 100%로 초기화'})).toHaveCSS('font-size','12px');
  if(theme==='dark')await p.getByRole('button',{name:'다크 모드',exact:true}).click();
  const expected=theme==='light'?'#123b32':'#ecf6f1';
  expect(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--text').trim())).toBe(expected);
  const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-13');await date.press('Enter');
  await p.getByRole('button',{name:'달력',exact:true}).click();
  const selected=p.locator('.calendar-dates>button[aria-pressed="true"]'),today=p.locator('.calendar-dates>button[aria-current="date"]');
  await expect(selected).toHaveCount(1);
  if(await today.count())expect(await selected.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await today.evaluate(e=>getComputedStyle(e).backgroundColor));
  await p.getByRole('button',{name:'간트',exact:true}).click();
 }
});

test('confirmation cancellation and acceptance preserve the intended editor focus',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1280,height:820});
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();
 await p.getByLabel('프로젝트 이름',{exact:true}).fill('미저장 프로젝트');
 await p.locator('[data-focus="schedule-add"]').click();
 const alert=p.getByRole('alertdialog');await expect(alert).toBeVisible();
 const bounds=(await alert.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(24);expect(Math.abs(bounds.x+bounds.width/2-640)).toBeLessThanOrEqual(1);
 const cancel=alert.getByRole('button',{name:'계속 편집',exact:true});await expect(cancel).toBeFocused();
 await p.keyboard.press('Shift+Tab');await expect(alert.getByRole('button',{name:'변경 버리기',exact:true})).toBeFocused();
 await cancel.click();await expect(alert).toHaveCount(0);
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('미저장 프로젝트');
 await p.locator('[data-focus="schedule-add"]').click();await alert.getByRole('button',{name:'변경 버리기',exact:true}).click();
 await expect(p.getByRole('dialog',{name:'일정 추가',exact:true})).toBeVisible();
 await expect(p.getByLabel('일정 이름',{exact:true})).toBeFocused();
 await p.getByRole('button',{name:'취소',exact:true}).click();
 await p.getByRole('button',{name:'QA 편집',exact:true}).click();await p.getByRole('button',{name:'삭제',exact:true}).click();
 await expect(alert.getByRole('button',{name:'취소',exact:true})).toBeFocused();
 await alert.getByRole('button',{name:'일정 삭제',exact:true}).click();
 await expect(alert).toHaveCount(0);await expect(p.getByRole('button',{name:'QA 편집',exact:true})).toHaveCount(0);
 await expect(p.getByRole('button',{name:'운영 배포 편집',exact:true})).toBeFocused();
 await p.setViewportSize({width:760,height:500});await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('짧은 창 확인');await p.getByRole('button',{name:'편집 닫기',exact:true}).click();
 const short=(await alert.boundingBox())!;expect(short.x).toBeGreaterThanOrEqual(24);expect(short.y).toBeGreaterThanOrEqual(48);expect(short.x+short.width).toBeLessThanOrEqual(736);expect(short.y+short.height).toBeLessThanOrEqual(492);
});

test('confirmation keeps window chrome usable and survives hide and restore',async({desktop:d})=>{
 const p=d.page;await d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,500));
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('창 제어 중 보존');await p.getByRole('button',{name:'편집 닫기',exact:true}).click();
 const confirmation=p.getByRole('alertdialog');await expect(confirmation).toBeVisible();
 expect(await p.evaluate(()=>getComputedStyle(document.body).pointerEvents)).toBe('none');
 const background=(await p.locator('[data-focus="project-add"]').boundingBox())!;await p.mouse.click(background.x+background.width/2,background.y+background.height/2);
 await expect(confirmation).toBeVisible();await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('창 제어 중 보존');
 const physicalClick=async(label:string)=>{const b=(await p.locator('.window-controls').getByRole('button',{name:label,exact:true,includeHidden:true}).boundingBox())!;await p.mouse.click(b.x+b.width/2,b.y+b.height/2)};
 await physicalClick('창 닫기');
 await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
 await d.app.evaluate(()=>(globalThis as any).desktopController.show());
 await expect(confirmation).toBeVisible();await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('창 제어 중 보존');
 // Observe real native command calls while still delegating every call to Electron.
 await d.app.evaluate(({BrowserWindow})=>{
  const w=BrowserWindow.getAllWindows()[0],calls={minimize:0,maximize:0,unmaximize:0};(globalThis as any).windowControlCalls=calls;
  for(const action of ['minimize','maximize','unmaximize'] as const){const native=w[action].bind(w);w[action]=()=>{calls[action]++;native()}}
 });
 if(!nativeWindowStates)test.info().annotations.push({type:'environment',description:'No EWMH window manager: native state checks unavailable; real window command delivery and hide/restore remain asserted.'});
 await physicalClick('최소화');await expect.poll(()=>d.app.evaluate(()=>(globalThis as any).windowControlCalls.minimize)).toBe(1);
 if(nativeWindowStates)await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
 await d.app.evaluate(()=>(globalThis as any).desktopController.show());await expect(confirmation).toBeVisible();
 await physicalClick('최대화');await expect.poll(()=>d.app.evaluate(()=>(globalThis as any).windowControlCalls.maximize)).toBe(1);
 if(nativeWindowStates){
  await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await expect(p.locator('.window-controls').getByRole('button',{name:'이전 크기로 복원',exact:true,includeHidden:true})).toBeVisible();
  await physicalClick('이전 크기로 복원');await expect.poll(()=>d.app.evaluate(()=>(globalThis as any).windowControlCalls.unmaximize)).toBe(1);await expect.poll(()=>d.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
 }
 await expect(confirmation).toBeVisible();await expect(p.getByRole('button',{name:'계속 편집',exact:true})).toBeFocused();
 await p.keyboard.press('Shift+Tab');await expect(p.getByRole('button',{name:'변경 버리기',exact:true})).toBeFocused();await p.keyboard.press('Tab');await expect(p.getByRole('button',{name:'계속 편집',exact:true})).toBeFocused();
 await p.getByRole('button',{name:'계속 편집',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('창 제어 중 보존');
 await p.getByRole('button',{name:'편집 닫기',exact:true}).click();await p.getByRole('button',{name:'변경 버리기',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(p.getByRole('dialog')).toHaveCount(0);
});
