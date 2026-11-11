import {test,expect} from './fixture'
import {mkdir} from 'node:fs/promises'
const screens='artifacts/quick-actions/screens'
test.use({seed:'hotfix'})
test('month list escapes the calendar panel and remains selectable with keyboard focus restored',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});await mkdir(screens,{recursive:true});
 await p.getByLabel('선택 날짜',{exact:true}).click();const month=p.getByRole('combobox',{name:'달력 월'});await month.click();
 expect(await p.locator('.date-popover').evaluate(e=>e.scrollTop)).toBe(0);
 const option=p.getByRole('option',{name:'12월',exact:true});await option.scrollIntoViewIfNeeded();
 expect(await option.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true);
 expect(await p.locator('.date-popover').evaluate(e=>e.scrollTop)).toBe(0);
 await p.screenshot({path:`${screens}/month-list.png`});await option.click();await expect(month).toHaveText('12월');await expect(month).toBeFocused();await expect(p.locator('.date-popover')).toBeVisible();
 await month.click();await p.keyboard.press('Escape');await expect(month).toBeFocused();await expect(p.locator('.date-popover')).toBeVisible();
});
test('list delete removes the project and children immediately and quick reminder is separately editable',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900});await mkdir(screens,{recursive:true});
 await p.getByRole('button',{name:'개발 편집',exact:true}).click();await p.getByRole('switch',{name:'시작일 알림',exact:true}).click();await p.getByRole('button',{name:'저장',exact:true}).click();await expect(p.locator('.saving-shield')).toHaveCount(0);
 await p.getByRole('button',{name:'개발 알림 설정',exact:true}).click();const quick=p.getByRole('dialog',{name:'알림 설정',exact:true});await expect(quick).toBeVisible();await quick.getByLabel('알림 며칠 전').fill('4');await p.keyboard.press('Escape');await p.getByRole('button',{name:'계속 편집'}).click();await expect(quick.getByLabel('알림 며칠 전')).toHaveValue('4');await p.screenshot({path:`artifacts/quick-actions/screens/reminder.png`});
 await quick.getByRole('button',{name:'저장',exact:true}).click();await expect(quick).toHaveCount(0);await expect(p.getByRole('button',{name:'개발 알림 설정',exact:true})).toBeFocused();
 await p.getByRole('button',{name:'프로젝트 목록',exact:true}).click();await p.screenshot({path:`artifacts/quick-actions/screens/projects.png`});await p.getByRole('button',{name:'1.1.1 핫픽스 삭제',exact:true}).click();await expect(p.getByRole('alertdialog')).toHaveCount(0);await expect(p.locator('[data-row="project:1"]')).toHaveCount(0);await expect(p.getByRole('button',{name:'프로젝트 목록',exact:true})).toBeFocused();
 const snapshot=await p.evaluate(()=>window.simpleTimeline.getSnapshot());expect(snapshot.ok&&snapshot.data.schedules.length).toBe(0);
});
