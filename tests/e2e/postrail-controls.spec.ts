import {expect,test} from './fixture'

test.use({initialTool:'home'})

test('keeps request controls compact and displays the send diagnostic above the editor',async({desktop:{page}})=>{
  await page.evaluate(async()=>{
    const api=window.postRail!
    await api.mutate({type:'env.save',environment:{id:'',name:'로컬',variables:{},apiOrigin:'',loginUrl:'',
      loginHeaders:{},loginBody:'',tokenPath:'',tokenHeader:'',tokenPrefix:'',hasPassword:false}})
    await api.mutate({type:'request.save',request:{id:'',name:'레이아웃 확인',groupId:null,method:'GET',
      url:'https://example.test',headers:{},body:'',useAuth:false,timeoutMs:null,favorite:false,nextIndex:'1'}})
  })
  await page.getByRole('navigation',{name:'WorkRail 도구'}).getByRole('button',{name:'PostRail',exact:true}).click()
  const row=page.locator('.pr-request-row').filter({hasText:'레이아웃 확인'})
  await expect(row).toBeVisible()
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(26)

  for (const name of ['실행 환경 선택','HTTP 메서드']) {
    const trigger=page.getByRole('combobox',{name})
    expect((await trigger.boundingBox())!.height).toBeLessThanOrEqual(24)
    const methodColor=name==='HTTP 메서드' ? await trigger.getByText('GET',{exact:true}).evaluate(el=>getComputedStyle(el).color) : undefined
    await trigger.press('ArrowDown')
    const menu=page.getByRole('listbox',{name})
    await expect(menu).toBeVisible()
    expect((await menu.getByRole('option').first().boundingBox())!.height).toBeLessThanOrEqual(24)
    if (methodColor) {
      const option=menu.getByRole('option',{name:'GET',exact:true}).getByText('GET',{exact:true})
      expect(await option.evaluate(el=>getComputedStyle(el).color)).toBe(methodColor)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }

  await page.getByLabel('요청 URL').fill('invalid-url')
  await page.getByRole('button',{name:'보내기',exact:true}).click()
  const diagnostic=page.getByRole('button',{name:'전송 오류 · console 열기'})
  await diagnostic.focus()
  const tooltip=page.locator('.pr-send-tooltip')
  await expect(tooltip).toBeVisible()
  for (const size of [{width:960,height:640},{width:790,height:490}]) {
    await page.setViewportSize(size)
    await expect.poll(()=>tooltip.evaluate(el=>{
      const rect=el.getBoundingClientRect()
      const atCenter=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
      return rect.top>=0 && rect.left>=0 && rect.bottom<=innerHeight && rect.right<=innerWidth && el.contains(atCenter)
    })).toBe(true)
  }
  await diagnostic.press('Escape')
  await expect(tooltip).toBeHidden()
  await diagnostic.hover()
  await expect(tooltip).toBeVisible()
  await diagnostic.click()
  await expect(page.getByLabel('console 로그')).toBeVisible()
})
