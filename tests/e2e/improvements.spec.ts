import { test, expect } from './fixture'
import type { Page, Locator } from 'playwright'
async function choose(p:Page,m:string){await p.getByLabel('선택 연월',{exact:true}).fill(m);await p.getByLabel('선택 연월',{exact:true}).press('Enter')}
async function box(l:Locator){const b=await l.boundingBox();if(!b)throw Error('Missing box');return b}
async function drag(p:Page,l:Locator,dx:number,part='move'){
  const b=await box(part==='move'?l:l.locator(`[data-resize="${part}"]`))
  const x=b.x+b.width/2,y=b.y+b.height/2
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y,{steps:5});await p.mouse.up()
}
test.describe('approved improvements',()=>{
  test.use({seed:'hotfix'})
  test('theme and collapse survive restart without filtering calendar',async({desktop:d})=>{
    const p=d.page
    await p.getByRole('button',{name:'다크 모드',exact:true}).click()
    await p.getByRole('button',{name:'1.1.1 핫픽스 접기',exact:true}).click()
    await expect(p.locator('[data-row="schedule:1"]')).toHaveCount(0)
    await d.restart()
    await expect(d.page.locator('html')).toHaveAttribute('data-theme','dark')
    await expect(d.page.getByRole('button',{name:'1.1.1 핫픽스 펼치기'})).toBeVisible()
    await choose(d.page,'2026-11');await d.page.getByRole('button',{name:'달력',exact:true}).click()
    await expect(d.page.locator('[data-segment="1"]').first()).toBeVisible()
  })
  test('gantt resizes a true end, moves a whole schedule, and Escape cancels',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12')
    const bar=p.locator('[data-bar="3"]')
    await expect(bar).toHaveAttribute('data-days','1')
    await drag(p,bar,56,'end');await expect(bar).toHaveAttribute('data-days','3')
    await drag(p,bar,-28);await expect(bar).toHaveAttribute('aria-label',/2026-12-17 — 2026-12-19/)
    const b=await box(bar);await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2-56,b.y+b.height/2,{steps:5})
    await p.keyboard.press('Escape');await p.mouse.up();await expect(bar).toHaveAttribute('aria-label',/2026-12-17 — 2026-12-19/)
    await expect(p.getByRole('dialog')).toHaveCount(0)
  })
  test('calendar drags by dates and blocks dirty editor changes',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12');await p.getByRole('button',{name:'달력',exact:true}).click()
    const bar=p.locator('[data-segment="3"]'),cell=await box(p.locator('[data-date="2026-12-18"]'))
    await drag(p,bar,cell.width,'end')
    await expect(bar).toHaveAttribute('aria-label',/2026-12-18 — 2026-12-19/)
    await bar.click();await p.getByLabel('일정 이름',{exact:true}).fill('미저장')
    await drag(p,bar,-cell.width)
    await expect(p.getByRole('alert')).toContainText('먼저 저장하거나')
    await expect(bar).toHaveAttribute('aria-label',/2026-12-18 — 2026-12-19/)
  })
  test('today expands a distant range and centers the current day; toolbar remains fixed',async({desktop:d})=>{
    const p=d.page;await choose(p,'2027-03')
    await p.getByRole('button',{name:'오늘',exact:true}).click()
    const date=await p.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})
    await expect(p.getByLabel('선택 연월',{exact:true})).toHaveValue(date.slice(0,7))
    const tick=await box(p.locator(`[data-day="${date}"]`)),area=await box(p.locator('.gantt-date-heading'))
    expect(tick.x).toBeGreaterThanOrEqual(area.x-1);expect(tick.x+tick.width).toBeLessThanOrEqual(area.x+area.width+1)
    await p.getByRole('button',{name:'달력',exact:true}).click()
    await p.setViewportSize({width:1280,height:500})
    const before=await box(p.getByRole('button',{name:'프로젝트 목록',exact:true}))
    await p.locator('main').evaluate(el=>{el.scrollTop=500})
    expect((await box(p.getByRole('button',{name:'프로젝트 목록',exact:true}))).y).toBe(before.y)
    const weekdays=await box(p.locator('.weekdays'));expect(weekdays.y).toBeGreaterThanOrEqual(before.y)
  })
})

test('startup records distinct process/window/data/UI phases on normal relaunch',async({desktop:d})=>{
  const {readFile}=await import('node:fs/promises'), {join}=await import('node:path')
  await d.restart()
  await expect.poll(async()=>{
    try{return JSON.parse(await readFile(join(d.profile,'startup-latest.json'),'utf8')).stages['ui-ready']}catch{return null}
  }).toBeGreaterThan(0)
  const report=JSON.parse(await readFile(join(d.profile,'startup-latest.json'),'utf8'))
  expect(report.stages['window-shown']).toBeGreaterThanOrEqual(report.stages['storage-ready'])
  expect(report.stages['ui-ready']).toBeGreaterThanOrEqual(report.stages['snapshot-served'])
  await test.info().attach('startup-timings',{body:JSON.stringify(report,null,2),contentType:'application/json'})
})
test.describe('drag navigation and failure protection',()=>{
  test.use({seed:'hotfix'})
  test('calendar hover navigation moves the original schedule into the next month',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12');await p.getByRole('button',{name:'달력',exact:true}).click()
    const bar=await box(p.locator('[data-segment="3"]'))
    await p.mouse.move(bar.x+bar.width/2,bar.y+bar.height/2);await p.mouse.down()
    const next=await box(p.locator('[data-drag-month="1"]'))
    await p.mouse.move(next.x+next.width/2,next.y+next.height/2,{steps:4})
    await expect(p.getByLabel('선택 연월',{exact:true})).toHaveValue('2027-01')
    const target=await box(p.locator('[data-date="2027-01-04"]'))
    await p.mouse.move(target.x+target.width/2,target.y+20,{steps:4});await p.mouse.up()
    await expect(p.locator('[data-segment="3"]')).toHaveAttribute('aria-label',/2027-01-04 — 2027-01-04/)
  })
  test('failed drag preserves data and a clean open editor',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12')
    const bar=p.locator('[data-bar="3"]');await bar.click()
    await expect(p.getByLabel('종료일',{exact:true})).toBeVisible()
    await p.getByRole('slider',{name:'간트 가로 이동'}).focus();await p.keyboard.press('End')
    await d.app.evaluate(({ipcMain})=>{
      ipcMain.removeHandler('schedule:update')
      ipcMain.handle('schedule:update',()=>({ok:false,error:{code:'STORAGE_FULL',message:'드래그 저장 실패'}}))
    })
    await drag(p,bar,28,'end')
    await expect(p.getByRole('alert')).toContainText('드래그 저장 실패')
    await expect(bar).toHaveAttribute('data-days','1')
    await expect(p.getByLabel('종료일',{exact:true})).toHaveValue('2026-12-18')
    await expect(p.locator('.toast')).toBeEmpty()
  })
})
test('success toast disappears after two seconds',async({desktop:d})=>{
  const p=d.page
  await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click()
  await p.getByLabel('프로젝트 이름',{exact:true}).fill('토스트 확인')
  await p.getByRole('button',{name:'저장',exact:true}).click()
  await expect(p.locator('.toast')).toContainText('프로젝트를 추가했습니다.')
  await expect(p.locator('.toast')).toBeEmpty({timeout:3000})
  await expect(p.locator('.status')).not.toContainText('추가했습니다')
})
test.describe('drag bounds and editor synchronization',()=>{
  test.use({seed:'hotfix'})
  test('gantt edge navigation extends temporarily and cancel restores the previous range',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12')
    const original=await p.locator('[data-range]').textContent(), b=await box(p.locator('[data-bar="3"]')), area=await box(p.locator('.gantt-date-heading'))
    await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down()
    await p.mouse.move(area.x+area.width-5,b.y+b.height/2,{steps:4})
    await expect(p.locator('[data-range]')).not.toHaveText(original!.trim())
    await p.keyboard.press('Escape');await p.mouse.up()
    await expect(p.locator('[data-range]')).toHaveText(original!.trim())
    await expect(p.getByRole('dialog')).toHaveCount(0)
    const result=await p.evaluate(()=>window.simpleTimeline.getSnapshot())
    expect(result.ok && result.data.schedules.find(s=>s.id==='3')?.startDate).toBe('2026-12-18')
  })
  test('a successful drag refreshes the same clean editor without making it dirty',async({desktop:d})=>{
    const p=d.page;await choose(p,'2026-12')
    const bar=p.locator('[data-bar="3"]');await bar.click()
    await expect(p.getByLabel('종료일',{exact:true})).toBeVisible()
    await p.getByRole('slider',{name:'간트 가로 이동'}).focus();await p.keyboard.press('End')
    await drag(p,bar,28,'end')
    await expect(p.getByLabel('종료일',{exact:true})).toHaveValue('2026-12-19')
    await expect(p.locator('html')).toHaveAttribute('data-editor-dirty','false')
    await p.getByRole('button',{name:'편집 닫기'}).click()
    await expect(p.getByRole('alertdialog')).toHaveCount(0)
  })
})
