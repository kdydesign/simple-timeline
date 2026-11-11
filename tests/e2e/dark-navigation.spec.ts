import {test,expect} from './fixture'
test.use({seed:'hotfix'})

test('dark-only surfaces, project popup and independent row background match the approved values',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900})
 await expect(p.locator('html')).toHaveAttribute('data-theme','dark')
 await expect(p.getByRole('button',{name:/^(라이트|다크) 모드$/})).toHaveCount(0)
 await expect(p.locator('.workspace')).toHaveCSS('padding','14px')
 await expect(p.locator('.app-shell')).toHaveCSS('margin','6px 14px 0px')
 await expect(p.locator('.toolbar')).toHaveCSS('background-color','rgba(43, 46, 49, 0.5)')
 await p.getByRole('button',{name:'프로젝트 목록',exact:true}).click()
 await expect(p.locator('.project-popup')).toHaveCSS('background-color','rgba(43, 46, 49, 0.5)')
 await expect(p.locator('.project-list-row').first()).toHaveCSS('background-color','rgba(110, 115, 120, 0.6)')
 const name=p.locator('.project-list-name').first()
 await name.hover();await expect(name).toHaveCSS('background-color','rgba(0, 0, 0, 0)')
 await p.screenshot({path:test.info().outputPath('projects.png')})
})

test('1:8 navigation keeps the left date on zoom and reveals a rounded horizontal thumb',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900})
 const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-06');await date.press('Enter')
 const zoom=p.getByRole('slider',{name:'간트 배율'}),scroll=p.getByRole('scrollbar',{name:'간트 가로 이동'})
 const z=(await p.locator('.gantt-zoom').boundingBox())!,h=(await p.locator('.gantt-horizontal').boundingBox())!
 expect(h.width/z.width).toBeCloseTo(8,1)
 const before=Number(await scroll.inputValue())/28
 await zoom.focus();await zoom.press('End')
 await expect(zoom).toHaveValue('300');expect(Number(await scroll.inputValue())/84).toBeCloseTo(before,5)
 await zoom.press('Home');await expect(zoom).toHaveValue('50')
 await p.getByRole('button',{name:'간트 배율 100%로 초기화'}).click()
 await expect(zoom).toHaveValue('100');expect(Number(await scroll.inputValue())/28).toBeCloseTo(before,5)
 await date.focus();await p.mouse.move(200,20)
 const color=()=>p.locator('.gantt-horizontal').evaluate(e=>getComputedStyle(e).getPropertyValue('--scroll-thumb-color').trim())
 await expect.poll(color).toMatch(/transparent|rgba\(0, 0, 0, 0\)/)
 await scroll.focus();await expect.poll(color).toBe('rgba(180, 196, 210, 0.42)')
 await scroll.press('End');await expect(scroll).toHaveAttribute('aria-valuetext',/2026-12-31/)
 await scroll.press('Home');await expect(scroll).toHaveValue('0')
 // The horizontal native range retains its drag mapping with an elongated thumb.
 const b=(await scroll.boundingBox())!;await p.mouse.move(b.x+b.width-4,b.y+b.height/2);await p.mouse.down();await p.mouse.up()
 await expect.poll(async()=>Number(await scroll.inputValue())).toBeGreaterThan(0)
 await p.screenshot({path:test.info().outputPath('navigation.png')})
})

test('weekend shading fills headings and rows while blank shared results stay centered',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1440,height:900})
 const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-06');await date.press('Enter')
 const day=p.locator('[data-day="2026-11-07"]'),column=p.locator('[data-row="project:1"] [data-nonworking="2026-11-07"]')
 await expect(day).toHaveCSS('background-color','rgba(236, 112, 126, 0.09)')
 await day.hover();await expect(day).toHaveClass(/date-hovered/)
 await day.evaluate(async el=>{getComputedStyle(el).backgroundColor;await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))})
 await expect(day).toHaveCSS('background-color','rgba(236, 112, 126, 0.09)')
 const d=(await day.boundingBox())!,c=(await column.boundingBox())!
 expect(Math.abs(d.x-c.x)).toBeLessThan(1);expect(c.width).toBe(28)
 const lastRow=(await p.locator('.gantt-row').last().boundingBox())!
 const highlights=await p.locator('.gantt-body [data-nonworking]').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().bottom))
 expect(highlights.length).toBeGreaterThan(0)
 expect(Math.max(...highlights)).toBeLessThanOrEqual(lastRow.y+lastRow.height)
 await p.locator('.collapse-project').first().click()
 const collapsedLast=(await p.locator('.gantt-row').last().boundingBox())!
 const collapsedBottom=await p.locator('.gantt-body [data-nonworking]').evaluateAll(nodes=>Math.max(...nodes.map(e=>e.getBoundingClientRect().bottom)))
 expect(collapsedBottom).toBeLessThanOrEqual(collapsedLast.y+collapsedLast.height)
 await p.screenshot({path:test.info().outputPath('weekends.png')})
 await p.getByRole('button',{name:'공유',exact:true}).click()
 await expect(p.locator('.gantt-body [data-nonworking]')).toHaveCount(0)
 await expect(p.locator('.gantt > .view-heading')).toBeHidden()
 await expect(p.locator('.gantt-heading')).toBeHidden()
 await expect(p.locator('.gantt-navigation')).toBeHidden()
 const body=(await p.locator('.gantt-body').boundingBox())!,text=(await p.locator('.gantt-body .empty h3').boundingBox())!
 expect(Math.abs(text.y+text.height/2-body.y-body.height/2)).toBeLessThan(2)
 expect(Math.abs(text.x+text.width/2-body.x-body.width/2)).toBeLessThan(6)
 await p.screenshot({path:test.info().outputPath('empty-shared.png')})
 await p.getByRole('button',{name:'전체',exact:true}).click()
 await expect(p.locator('.gantt > .view-heading')).toBeVisible()
 await expect(p.locator('.gantt-heading')).toBeVisible()
 await expect(p.locator('.gantt-navigation')).toBeVisible()
})

test('native vertical scrollbar reveals on hover and focus and remains draggable',async({desktop:{page:p}})=>{
 await p.setViewportSize({width:1280,height:820})
 await p.evaluate(async()=>{
  for(let i=0;i<24;i++){
   const r=await window.simpleTimeline.createProject({name:`스크롤 확인 ${i}`,color:'#2563EB',participants:[]})
   if(!r.ok)throw Error(r.error.message)
  }
 })
 await p.reload()
 const body=p.locator('.gantt-body')
 await expect.poll(()=>body.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true)
 const color=()=>body.evaluate(e=>getComputedStyle(e,'::-webkit-scrollbar-thumb').backgroundColor)
 await p.getByLabel('선택 날짜',{exact:true}).focus();await p.mouse.move(200,20)
 await expect.poll(color).toBe('rgba(0, 0, 0, 0)')
 await body.hover({position:{x:100,y:20}})
 await expect.poll(color).toBe('rgba(180, 196, 210, 0.42)')
 await body.locator('.text-button').first().focus();await p.mouse.move(200,20)
 await expect.poll(color).toBe('rgba(180, 196, 210, 0.42)')
 const b=(await body.boundingBox())!
 await p.mouse.move(b.x+b.width-4,b.y+12);await p.mouse.down()
 await p.mouse.move(b.x+b.width-4,b.y+130,{steps:6});await p.mouse.up()
 await expect.poll(()=>body.evaluate(e=>e.scrollTop)).toBeGreaterThan(0)
 await p.emulateMedia({forcedColors:'active'})
 await expect.poll(color).not.toBe('rgba(0, 0, 0, 0)')
})
