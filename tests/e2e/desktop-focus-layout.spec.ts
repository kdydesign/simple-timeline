import {test,expect} from './fixture'
async function choose(p:import('playwright').Page,date:string){await p.getByLabel('선택 날짜',{exact:true}).fill(date);await p.getByLabel('선택 날짜',{exact:true}).press('Enter')}
test.use({seed:'hotfix'})
test('closing toolbar and date-cell schedule add restores focus without a ghost tooltip',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1280,height:900});await choose(p,'2026-12-01')
 const add=p.locator('[data-focus="schedule-add"]')
 await add.click();await p.getByRole('button',{name:'편집 닫기',exact:true}).click()
 await expect(add).toBeFocused();await expect(p.getByRole('tooltip')).toHaveCount(0)
 for(const mode of ['간트','달력']){
  await p.getByRole('button',{name:mode,exact:true}).click()
  const date=p.locator(mode==='간트'?'[data-day="2026-12-02"]':'[data-date="2026-12-02"]')
  await date.click({position:{x:10,y:10}});await p.getByRole('button',{name:'편집 닫기',exact:true}).click()
  await expect(date).toBeFocused();await expect(p.getByRole('tooltip')).toHaveCount(0)
 }
 await p.getByRole('button',{name:'오늘',exact:true}).hover();await expect(p.getByRole('tooltip')).toHaveText('오늘')
 await p.mouse.move(700,700);await p.getByRole('button',{name:'다음 달',exact:true}).focus()
 await p.keyboard.press('Tab');await expect(p.getByRole('button',{name:'오늘',exact:true})).toBeFocused();await expect(p.getByRole('tooltip')).toHaveText('오늘')
})
test('Gantt navigation stays at its panel bottom near the viewport edge in tall and short windows with editor',async({desktop:{page:p}})=>{
 for(const height of [1100,500]){
  await p.setViewportSize({width:1280,height});await choose(p,'2026-12-01')
  for(const editor of [false,true]){
   if(editor)await p.locator('[data-focus="schedule-add"]').click()
   const geometry=await p.evaluate(()=>{
    const nav=document.querySelector('.gantt-navigation')!.getBoundingClientRect(),main=document.querySelector('main')!.getBoundingClientRect()
    return {bottom:nav.bottom,mainBottom:main.bottom,height:innerHeight}
   })
   // The glass window has an intentional outer rim and panel gutter.
   // Keep the footer near the window edge and attached to the actual Gantt panel.
   expect(geometry.height-geometry.bottom).toBeGreaterThanOrEqual(0)
   expect(geometry.height-geometry.bottom).toBeLessThanOrEqual(24)
   expect(Math.abs(geometry.bottom-geometry.mainBottom)).toBeLessThanOrEqual(2)
   await expect(p.getByRole('scrollbar',{name:'간트 가로 이동'})).toBeVisible()
   await p.locator('.gantt-body').evaluate(el=>{el.scrollTop=el.scrollHeight})
   await expect(p.locator('[data-row="schedule:3"]')).toBeVisible()
   if(editor)await p.getByRole('button',{name:'편집 닫기',exact:true}).click()
  }
  await p.screenshot({path:test.info().outputPath(`gantt-${height}.png`)})
 }
})
test('a date origin removed by month navigation falls back to schedule add',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1280,height:900});await choose(p,'2026-12-01')
 await p.getByRole('button',{name:'달력',exact:true}).click()
 await p.locator('[data-date="2026-12-02"]').click({position:{x:10,y:10}})
 await p.getByRole('button',{name:'다음 달',exact:true}).click()
 await p.getByRole('button',{name:'편집 닫기',exact:true}).click()
 await expect(p.locator('[data-focus="schedule-add"]')).toBeFocused()
 await expect(p.getByRole('tooltip')).toHaveCount(0)
})
