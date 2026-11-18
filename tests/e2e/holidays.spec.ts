import {test,expect} from './fixture'
import {settings,sharingState} from './sharing-fixture'
test.use({seed:'single',fault:'help-capture'})
test('holiday controls fit the dialog and keep dates with the name on one row',async({desktop:d},info)=>{
 const p=d.page
 await p.setViewportSize({width:1440,height:960})
 const dialog=await settings(d)
 await dialog.getByRole('tab',{name:'기본 설정'}).click()
 const holidays=dialog.getByRole('region',{name:'휴일 관리 (개인)'})
 for(const width of [1440,980,640]){
  await p.setViewportSize({width,height:960})
  await holidays.scrollIntoViewIfNeeded()
  const layout=await holidays.evaluate(section=>{
   const rect=(selector:string)=>{const r=section.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}}
   const repeat=rect('.holiday-repeat'),dated=rect('.holiday-dated')
   const fields=['[data-holiday-start] input','[data-holiday-end] input','[data-holiday-name]'].map(rect)
   const weekdays=Array.from(section.querySelectorAll('.holiday-weekdays [aria-pressed]')).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right}})
   return {repeat,dated,fields,weekdays,overflow:section.scrollWidth-section.clientWidth}
  })
  expect(layout.dated.y).toBeGreaterThanOrEqual(layout.repeat.bottom)
  expect(layout.weekdays).toHaveLength(7)
  for(const day of layout.weekdays){expect(day.y).toBeCloseTo(layout.weekdays[0].y,0);expect(day.x).toBeGreaterThanOrEqual(layout.repeat.x);expect(day.right).toBeLessThanOrEqual(layout.repeat.right)}
  expect(layout.overflow).toBeLessThanOrEqual(1)
  for(const field of layout.fields){expect(field.x).toBeGreaterThanOrEqual(layout.dated.x);expect(field.right).toBeLessThanOrEqual(layout.dated.right)}
  if(width>=980){for(const field of layout.fields)expect(field.y).toBeCloseTo(layout.fields[0].y,0)}
  await holidays.screenshot({path:info.outputPath(`holiday-layout-${width}.png`)})
 }
})
test('host edits common holidays and both views reflect named dates and changed recurring weekdays',async({desktop:d},info)=>{
 const p=d.page;await p.setViewportSize({width:1440,height:960})
 const dialog=await settings(d);await dialog.getByRole('button',{name:'호스트로 공유'}).click();await dialog.getByLabel('공유할 LAN IP').click();await p.getByRole('option',{name:'192.168.0.10',exact:true}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click()
 await dialog.getByRole('tab',{name:'기본 설정'}).click()
 const personal=dialog.getByRole('region',{name:'휴일 관리 (개인)'})
 await personal.getByRole('button',{name:'토요일 휴일'}).click();await personal.getByRole('button',{name:'반복 요일 저장'}).click()
 const holidays=dialog.getByRole('region',{name:'휴일 관리 (공통)'})
 await holidays.getByRole('button',{name:'토요일 휴일'}).click();await holidays.getByRole('button',{name:'수요일 휴일'}).click();await holidays.getByRole('button',{name:'반복 요일 저장'}).click()
 const start=holidays.getByLabel('시작일',{exact:true}),end=holidays.getByLabel('종료일',{exact:true})
 await start.fill('2026-11-20');await end.fill('2026-11-22');
 await holidays.getByRole('button',{name:'시작일 달력 열기'}).click();const month=p.getByRole('combobox',{name:'달력 월'});expect((await month.boundingBox())!.width).toBeGreaterThan(80);await month.click();
 const option=p.getByRole('option',{name:'12월',exact:true});await option.scrollIntoViewIfNeeded();
 // Radix mounts scroll controls after positioning; wait for the target to be fully exposed.
 await expect.poll(async()=>{await option.scrollIntoViewIfNeeded();return option.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})}).toBe(true);
 await p.screenshot({path:info.outputPath('holiday-month-list.png')});await option.click();await expect(month).toHaveText('12월');await expect(month).toBeFocused();
 await month.click();await p.keyboard.press('Escape');await expect(month).toBeFocused();await expect(p.locator('.date-popover')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('.date-popover')).toHaveCount(0);await expect(dialog).toBeVisible();
 await holidays.getByLabel('휴일 이름').fill('창립기념일');await holidays.getByRole('button',{name:'휴일 추가'}).click()
 await expect(holidays.getByRole('cell',{name:'창립기념일',exact:true})).toBeVisible();await holidays.screenshot({path:info.outputPath('holiday-settings.png')})
 expect((await sharingState(d)).holidays?.calendar).toEqual({weekdays:[0,3],dates:[{date:'2026-11-20',endDate:'2026-11-22',name:'창립기념일'}]})
 await dialog.getByRole('button',{name:'설정 닫기'}).click();const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-10');await date.press('Enter')
 await expect(p.locator('[data-day="2026-11-20"]')).toHaveClass(/nonworking-day/);await expect(p.locator('[data-day="2026-11-28"]')).not.toHaveClass(/nonworking-day/)
 await expect(p.locator('[data-day="2026-11-20"] .holiday-marker')).toHaveCount(1);await expect(p.locator('.gantt-track .holiday-marker')).toHaveCount(0);await p.locator('[data-day="2026-11-20"]').hover();await expect(p.getByRole('tooltip')).toContainText('창립기념일');await p.screenshot({path:info.outputPath('holidays-gantt.png')})
 await p.getByRole('button',{name:'달력',exact:true}).click();await expect(p.locator('[data-date="2026-11-20"]')).toHaveClass(/nonworking-day/);await expect(p.locator('[data-date="2026-11-28"]')).not.toHaveClass(/nonworking-day/)
 await expect(p.locator('.calendar-holiday-name')).toHaveCount(0);await expect(p.locator('[data-date="2026-11-20"] .holiday-marker')).toHaveCount(1);await p.locator('[data-date="2026-11-20"]').hover({position:{x:10,y:10}});await expect(p.getByRole('tooltip')).toContainText('창립기념일');await p.screenshot({path:info.outputPath('holidays-calendar.png')})
})
