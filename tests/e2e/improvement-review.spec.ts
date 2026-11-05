import {test,expect} from './fixture'
import type {Page,Locator} from 'playwright'
async function choose(p:Page){await p.getByLabel('선택 날짜',{exact:true}).fill('2026-12-01');await p.getByLabel('선택 날짜',{exact:true}).press('Enter')}
async function box(l:Locator){const b=await l.boundingBox();if(!b)throw Error('Missing box');return b}
test.describe('uncertain drag recovery',()=>{
  test.use({seed:'hotfix',fault:'drag-lost'})
  test('refresh reconciles a clean panel and a later name save retains the committed dates',async({desktop:d})=>{
    const p=d.page;await p.setViewportSize({width:1280,height:820});await choose(p);await p.locator('[data-bar="3"]').click()
    await expect(p.getByLabel('종료일',{exact:true})).toBeVisible()
    await expect(p.locator('main')).not.toHaveAttribute('inert')
    await p.getByRole('slider').focus();await p.getByLabel('선택 날짜',{exact:true}).fill('2026-12-12');await p.getByLabel('선택 날짜',{exact:true}).press('Enter')
    const b=await box(p.locator('[data-bar="3"] [data-resize="end"]'))
    await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+28,b.y+b.height/2,{steps:4});await p.mouse.up()
    await expect(p.getByRole('alert')).toContainText('결과')
    await p.getByRole('button',{name:'다시 조회',exact:true}).click()
    await expect(p.locator('[data-bar="3"]')).toHaveAttribute('data-days','2')
    await expect(p.getByLabel('종료일',{exact:true})).toHaveValue('2026-12-19')
    await p.getByLabel('일정 이름',{exact:true}).fill('이름만 수정')
    await p.getByRole('button',{name:'저장',exact:true}).click()
    await expect(p.locator('[data-bar="3"]')).toHaveAttribute('data-days','2')
  })
})
test.describe('visible date regions',()=>{
  test.use({seed:'hotfix'})
  test('Tab never scrolls the date header independently of the logical viewport',async({desktop:d})=>{
    const p=d.page;await choose(p)
    await p.getByLabel('선택 날짜',{exact:true}).fill('2026-11-01');await p.getByLabel('선택 날짜',{exact:true}).press('Enter')
    const first=await p.locator('[data-day]').evaluateAll(els=>{const area=els[0].parentElement!.getBoundingClientRect();return (els.find(e=>{const r=e.getBoundingClientRect();return r.left>=area.left && r.right<=area.right}) as HTMLElement).dataset.day})
    await p.locator(`[data-day="${first}"]`).focus()
    for(let i=0;i<45;i++){
      await p.keyboard.press('Tab')
      expect(await p.locator('.gantt-date-heading').evaluate(el=>el.scrollLeft)).toBe(0)
    }
  })
  test('the whole weekday header stays inside the scrolling viewport',async({desktop:d})=>{
    const p=d.page;await choose(p);await p.getByRole('button',{name:'달력',exact:true}).click();await p.setViewportSize({width:1280,height:500})
    await p.locator('main').evaluate(el=>{el.scrollTop=300})
    await expect.poll(()=>p.locator('main').evaluate(el=>el.scrollTop)).toBeGreaterThan(100)
    const main=await box(p.locator('main')), header=await box(p.locator('.weekdays'))
    expect(header.y).toBeGreaterThanOrEqual(main.y)
    expect(header.y+header.height).toBeLessThanOrEqual(main.y+main.height)
  })
  test('dropping on the toolbar over a clipped earlier calendar cell cancels',async({desktop:d})=>{
    const p=d.page;await choose(p);await p.getByRole('button',{name:'달력',exact:true}).click();await p.setViewportSize({width:1280,height:500})
    await p.locator('main').evaluate(el=>{el.scrollTop=300})
    const bar=await box(p.locator('[data-segment="3"]'))
    await p.mouse.move(bar.x+bar.width/2,bar.y+bar.height/2);await p.mouse.down()
    await p.mouse.move(bar.x+bar.width/2,30,{steps:4});await p.mouse.up()
    await expect(p.locator('.toast')).toBeEmpty()
    const result=await p.evaluate(()=>window.simpleTimeline.getSnapshot())
    expect(result.ok && result.data.schedules.find(s=>s.id==='3')?.startDate).toBe('2026-12-18')
  })
})
