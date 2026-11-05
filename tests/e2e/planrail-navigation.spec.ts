import { test, expect } from './fixture'
import type { Page } from 'playwright'
async function choose(p:Page,date:string) {
  const input=p.getByLabel('선택 날짜',{exact:true})
  await input.fill(date); await input.press('Enter')
}
async function leftAligned(p:Page,date:string) {
  const area=await p.locator('.gantt-date-heading').boundingBox()
  const tick=await p.locator(`[data-day="${date}"]`).boundingBox()
  expect(Math.abs(tick!.x-area!.x)).toBeLessThan(1)
}
test.describe('Planrail date navigation',()=>{
  test.use({seed:'hotfix'})
  test('shares dates, clamps month ends and aligns the last domain day without fake cells',async({desktop:d})=>{
    const p=d.page
    await choose(p,'2027-01-31');await leftAligned(p,'2027-01-31')
    await p.getByRole('button',{name:'다음 달',exact:true}).click()
    await expect(p.getByLabel('선택 날짜',{exact:true})).toHaveValue('2027-02-28')
    await p.getByRole('button',{name:'다음 달',exact:true}).click()
    await expect(p.getByLabel('선택 날짜',{exact:true})).toHaveValue('2027-03-28')
    await choose(p,'9999-12-31');await leftAligned(p,'9999-12-31')
    const track=await p.locator('.gantt-track').first().boundingBox()
    await p.mouse.click(track!.x+80,track!.y+20)
    await expect(p.getByRole('dialog')).toHaveCount(0)
    await p.getByRole('button',{name:'달력',exact:true}).click()
    await expect(p.locator('[data-date="9999-12-31"]')).toHaveAttribute('aria-pressed','true')
    await choose(p,'2027-02-30')
    await expect(p.getByLabel('선택 날짜',{exact:true})).toHaveValue('9999-12-31')
    await expect(p.getByRole('alert')).toContainText('날짜')
  })
})
test.describe('Planrail zoom and Space pan',()=>{
  test.use({seed:'hotfix'})
  test('anchors wheel zoom, persists it and pans a focused bar without schedule changes',async({desktop:d})=>{
    const p=d.page
    await choose(p,'2026-12-01')
    const area=await p.locator('.gantt-date-heading').boundingBox(), slider=p.getByRole('slider')
    const before=Number(await slider.inputValue()), pointer=100
    await p.mouse.move(area!.x+pointer,area!.y+40)
    await p.keyboard.down('Control');await p.mouse.wheel(0,-100);await p.keyboard.up('Control')
    await expect.poll(async()=>Number(await p.locator('[data-day="2026-12-18"]').evaluate(el=>parseFloat((el as HTMLElement).style.width)))).toBeGreaterThan(28)
    const width=await p.locator('[data-day="2026-12-18"]').evaluate(el=>parseFloat((el as HTMLElement).style.width))
    expect((Number(await slider.inputValue())+pointer)/width).toBeCloseTo((before+pointer)/28,4)
    const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('simple-timeline.preferences.v1')!).dayWidth)
    expect(saved).toBeCloseTo(width,4)
    await choose(p,'2026-12-01')
    const bar=p.locator('[data-bar="3"]'), b=await bar.boundingBox()
    await bar.focus()
    const offset=Number(await slider.inputValue()), snapshot=await p.evaluate(()=>window.simpleTimeline.getSnapshot())
    await p.keyboard.down('Space');await p.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await p.mouse.down()
    await p.mouse.move(b!.x+b!.width/2-70,b!.y+b!.height/2,{steps:4});await p.mouse.up();await p.keyboard.up('Space')
    await expect.poll(async()=>Number(await slider.inputValue())).toBeCloseTo(offset+70,4)
    await expect(p.getByRole('dialog')).toHaveCount(0)
    expect(await p.evaluate(()=>window.simpleTimeline.getSnapshot())).toEqual(snapshot)
    await p.keyboard.press('Enter')
    await expect(p.getByLabel('일정 이름',{exact:true})).toHaveValue('운영 배포')
    await p.getByRole('button',{name:'편집 닫기',exact:true}).click()
    await d.restart()
    await expect.poll(async()=>d.page.locator('[data-day]').first().evaluate(el=>parseFloat((el as HTMLElement).style.width))).toBeCloseTo(width,4)
  })
  test('at 14px a one-day bar keeps distinct start, body and end hit areas',async({desktop:d})=>{
    const p=d.page
    await p.evaluate(()=>localStorage.setItem('simple-timeline.preferences.v1',JSON.stringify({theme:'light',collapsed:[],dayWidth:14})))
    await p.reload();await choose(p,'2026-12-01')
    const bar=p.locator('[data-bar="3"]')
    const b=await bar.boundingBox();expect(b!.width).toBe(14)
    for(const [part,delta,dates] of [
      ['end',14,'2026-12-18 — 2026-12-19'],
      ['start',14,'2026-12-19 — 2026-12-19'],
      ['body',-14,'2026-12-18 — 2026-12-18'],
    ] as const){
      const box=await (part==='body'?bar:bar.locator(`[data-resize="${part}"]`)).boundingBox()
      await p.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await p.mouse.down()
      await p.mouse.move(box!.x+box!.width/2+delta,box!.y+box!.height/2,{steps:4});await p.mouse.up()
      await expect(bar).toHaveAttribute('aria-label',new RegExp(dates))
    }
  })
})
