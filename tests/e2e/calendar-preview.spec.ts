import {test,expect} from './fixture'
import type {Page,Locator} from 'playwright'
async function box(l:Locator){const b=await l.boundingBox();if(!b)throw Error('Missing box');return b}
async function choose(p:Page,date:string){await p.getByLabel('선택 날짜',{exact:true}).fill(date);await p.getByLabel('선택 날짜',{exact:true}).press('Enter')}
test.describe('calendar live preview',()=>{
 test.use({seed:'hotfix'})
 test('move shows adjacent month preview before saving and Escape clears it',async({desktop:d})=>{
  const p=d.page;await p.setViewportSize({width:1280,height:900});await choose(p,'2026-12-01');await p.getByRole('button',{name:'달력',exact:true}).click()
  const b=await box(p.locator('[data-segment="3"]')),target=await box(p.locator('[data-date="2026-11-30"]'))
  await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+55,{steps:5})
  const preview=p.locator('[data-calendar-preview="3"]');await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('data-start','2026-11-30')
  expect((await box(preview)).x).toBeCloseTo(target.x+3,0)
  await expect(p.locator('[data-segment="3"]')).toHaveClass(/drag-origin/)
  const data=await p.evaluate(()=>window.simpleTimeline.getSnapshot());expect(data.ok&&data.data.schedules.find(s=>s.id==='3')?.startDate).toBe('2026-12-18')
  await p.screenshot({path:test.info().outputPath('calendar-preview-default.png')});
  await p.keyboard.press('Escape');await p.mouse.up();await expect(preview).toHaveCount(0)
  await expect(p.locator('[data-segment="3"]')).not.toHaveClass(/drag-origin/)
 })
 test('resizing both ends draws split week previews and saves only on release',async({desktop:d})=>{
  const p=d.page;await p.setViewportSize({width:1280,height:1000});await choose(p,'2026-12-01');await p.getByRole('button',{name:'달력',exact:true}).click()
  for(const [part,date] of [['end','2026-12-22'],['start','2026-12-16']] as const){
   const resize=p.locator(`[data-segment="3"] [data-resize="${part}"]`)
   await resize.click({trial:true})
   const handle=await box(resize),target=await box(p.locator(`[data-date="${date}"]`))
   await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+55,{steps:5})
   const preview=p.locator('[data-calendar-preview="3"]');await expect(preview).toHaveCount(2)
   await expect(preview.first()).toHaveAttribute(part==='end'?'data-end':'data-start',date)
   await p.mouse.up();await expect(preview).toHaveCount(0)
   await expect(p.locator('[data-segment="3"]').first()).toHaveAttribute('aria-label',new RegExp(date))
  }
 })
})

test.describe('calendar overlap preview',()=>{
 test.use({seed:'hotfix'})
 test('overflow cannot hide preview and invalid drop never saves',async({desktop:d})=>{
  await d.page.evaluate(async()=>{for(let i=0;i<4;i++)await window.simpleTimeline.createSchedule({projectId:'1',name:'겹침 '+i,startDate:'2026-12-15',endDate:'2026-12-15'})})
  await d.restart();const p=d.page;await p.setViewportSize({width:1280,height:1000});await choose(p,'2026-12-01')
  await p.getByRole('button',{name:'달력',exact:true}).click()
  const count=await p.locator('[data-focus="more:2026-12-15"]').textContent()
  const b=await box(p.locator('[data-segment="3"]')),target=await box(p.locator('[data-date="2026-12-15"]'))
  await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+55,{steps:5})
  const preview=p.locator('[data-calendar-preview="3"]');await expect(preview).toBeVisible()
  await expect(p.locator('[data-focus="more:2026-12-15"]')).toHaveText(count!)
  await p.screenshot({path:test.info().outputPath('calendar-preview-dark.png')})
  await p.mouse.move(5,5);await expect(preview).toHaveClass(/invalid/);await expect(p.locator('.calendar-drag-label')).toContainText('놓으면 취소')
  await p.mouse.up();await expect(preview).toHaveCount(0)
  const data=await p.evaluate(()=>window.simpleTimeline.getSnapshot());expect(data.ok&&data.data.schedules.find(s=>s.id==='3')?.startDate).toBe('2026-12-18')
 })
})
