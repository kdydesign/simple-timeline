import {once} from 'node:events'
import {writeFile, rm} from 'node:fs/promises'
import {createServer, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import type {ElectronApplication, Locator, Page} from 'playwright'
import {expect, test} from './fixture'

test.use({initialTool:'home'})

async function openSidebarMenu(page: Page, button: Locator) {
  await button.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const anchor = (await button.boundingBox())!
  const popup = (await menu.boundingBox())!
  expect(popup.x).toBeCloseTo(anchor.x, 0)
  expect(popup.y).toBeCloseTo(anchor.y + anchor.height, 0)
  return menu
}

// Only the native confirmation is simulated. Both login and API calls use the product transport.
function observeConsent(app:ElectronApplication, allowed:string[]) {
  return app.evaluateHandle(({dialog}, urls) => {
    const original = dialog.showMessageBox
    const warnings: string[] = []
    dialog.showMessageBox = async (first:Electron.BaseWindow | Electron.MessageBoxOptions, second?:Electron.MessageBoxOptions) => {
      const options = second ?? ('message' in first ? first : undefined)
      if (!options) throw Error('확인 창 내용이 없습니다.')
      warnings.push([options.message, options.detail].join(' '))
      const destinations = options.detail?.split('\n') ?? []
      const send = options.buttons?.indexOf('보내기') ?? -1
      const allowed = destinations.length > 0 && destinations.every(url => urls.includes(url))
      return {response:allowed && send >= 0 ? send : (options.cancelId ?? 0), checkboxChecked:false}
    }
    return {warnings, restore:() => {dialog.showMessageBox = original}}
  }, allowed)
}

test('sends a saved indexed POST from the editor and Home to a loopback server', async ({desktop},testInfo) => {
  const received: {method?:string; path?:string; body:string}[] = []
  let missing = false
  const missingBody = '{\n  "reason": "sample not found"\n}'
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    received.push({method:request.method, path:request.url, body:Buffer.concat(chunks).toString('utf8')})
    if (missing) {
      response.writeHead(404, {'Content-Type':'application/json'}).end(missingBody)
      return
    }
    response.writeHead(201, {'Content-Type':'application/json'})
    response.end(JSON.stringify({receipt:'loopback-' + received.length}))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const endpoint = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/samples'
    const {app, page} = desktop
    const consent = await observeConsent(app, [endpoint])
    try {
      const dock = page.getByRole('navigation', {name:'WorkRail 도구'})
      await dock.getByRole('button', {name:'PostRail', exact:true}).click()
      await page.getByRole('button', {name:'환경 관리', exact:true}).click()
      const environment = page.getByRole('dialog', {name:'환경 관리', exact:true})
      await environment.getByLabel('환경 이름').fill('로컬')
      await environment.getByRole('button', {name:'저장', exact:true}).click()
      await expect(environment).toBeHidden()
      const groupMenu = page.getByRole('button', {name:'미분류 그룹 메뉴', exact:true})
      await openSidebarMenu(page, groupMenu)
      await page.keyboard.press('Escape')
      await expect(groupMenu).toBeFocused()
      const addMenu = await openSidebarMenu(page, page.getByRole('button', {name:'추가 메뉴', exact:true}))
      await addMenu.getByRole('menuitem', {name:'요청 추가', exact:true}).click()
      const form = page.getByRole('dialog', {name:'요청 추가', exact:true})
      const name = '로컬 샘플 등록'
      await form.getByLabel('요청 이름').fill(name)
      await form.getByLabel('URL', {exact:true}).fill(endpoint)
      await form.getByRole('button', {name:'저장', exact:true}).click()
      const requestMenu = page.getByRole('button', {name:name + ' 요청 메뉴', exact:true})
      await openSidebarMenu(page, requestMenu)
      await page.keyboard.press('Escape')
      await expect(requestMenu).toBeFocused()
      await page.getByRole('combobox', {name:'HTTP 메서드'}).click()
      await page.getByRole('option', {name:'POST', exact:true}).click()
      const splitter=page.getByRole('separator',{name:'요청과 응답 영역 크기'})
      await splitter.focus()
      await splitter.press('ArrowDown')
      await expect(splitter).toHaveAttribute('aria-valuenow','35')
      await splitter.dblclick()
      await expect(splitter).toHaveAttribute('aria-valuenow','30')
      await page.getByLabel('JSON 요청 본문').fill('{"sample":"sample_${index}"}')
      await page.getByRole('button', {name:'변경 저장'}).click()
      await expect(page.getByRole('button', {name:/변경 저장|저장 중…/})).toHaveCount(0)
      const star = page.getByRole('button', {name:name + ' 즐겨찾기', exact:true})
      await star.click()
      await expect(star).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', {name:'보내기', exact:true}).click()
      await expect(page.getByLabel('응답 본문 편집')).toHaveValue(/loopback-1/)
      await page.getByLabel('응답 본문 편집').fill('{"value":"Draft draft"}')
      const search = page.getByRole('searchbox',{name:'응답 본문 검색'})
      await search.fill('DRAFT')
      await expect(page.getByText('1/2',{exact:true})).toBeVisible()
      await search.press('Enter')
      await expect(page.getByText('2/2',{exact:true})).toBeVisible()
      expect(await page.evaluate(()=>Array.from(CSS.highlights.get('postrail-response-current') ?? [],range=>range.toString()))).toEqual(['draft'])
      await page.getByRole('button',{name:'응답 본문 복사'}).click()
      await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe('{"value":"Draft draft"}')
      await page.getByRole('button',{name:'원문',exact:true}).click()
      await expect(page.getByLabel('응답 본문 원문')).toHaveValue('{"receipt":"loopback-1"}')
      const originalBody=page.getByLabel('응답 본문 원문')
      await expect(originalBody).not.toBeEditable()
      await originalBody.click()
      await expect(originalBody).toHaveCSS('outline-style','none')
      await expect(originalBody).toHaveCSS('border-top-width','0px')
      await page.getByRole('button',{name:'편집본',exact:true}).click()
      const editedBody=page.getByLabel('응답 본문 편집')
      await expect(editedBody).toHaveValue('{"value":"Draft draft"}')
      await expect(editedBody).toBeEditable()
      await editedBody.click()
      await expect(editedBody).toHaveCSS('box-shadow','none')
      await expect(editedBody).toHaveCSS('outline-style','none')
      await page.getByRole('button', {name:'회차별 결과', exact:true}).click()
      await expect(page.getByLabel('회차별 결과 로그')).toHaveValue(/201/)

      await page.getByLabel('반복 보내기',{exact:true}).check()
      await page.getByLabel('횟수',{exact:true}).fill('3')
      await page.getByRole('button',{name:'변경 저장'}).click()
      await expect(page.getByRole('button',{name:/변경 저장|저장 중…/})).toHaveCount(0)
      await dock.getByRole('button', {name:'Home', exact:true}).click()
      const widget = page.getByRole('region', {name:'PostRail 즐겨찾기'})
      await expect(widget.getByLabel(name+' 반복 보내기')).not.toBeChecked()
      await expect(widget.getByLabel(name+' 반복 횟수')).toHaveValue('3')
      await widget.getByRole('button', {name:name + ' 즉시 실행'}).click()
      await expect.poll(() => received.length).toBe(2)
      await expect(widget).toBeVisible()
      await widget.getByRole('button', {name:'결과 보기'}).click()
      await expect(page.getByLabel('응답 본문 편집')).toHaveValue(/loopback-2/)
      await page.getByRole('button',{name:'console',exact:true}).click()
      const consoleLog = page.getByLabel('console 로그')
      await expect(consoleLog).toContainText(/요청 전송[\s\S]*HTTP 201[\s\S]*요청 전송[\s\S]*HTTP 201/)
      await expect(consoleLog).not.toContainText('sample_')
      expect(received.map(row => ({...row, body:JSON.parse(row.body)}))).toEqual([
        {method:'POST', path:'/samples', body:{sample:'sample_1'}},
        {method:'POST', path:'/samples', body:{sample:'sample_2'}},
      ])
      await dock.getByRole('button',{name:'Home',exact:true}).click()
      await widget.getByLabel(name+' 반복 보내기').check()
      await widget.getByLabel(name+' 반복 횟수').fill('2')
      await widget.screenshot({path:testInfo.outputPath('home-inline-repeat.png')})
      await widget.getByRole('button',{name:name+' 반복 실행'}).click()
      await expect(widget.getByRole('status')).toContainText('2 / 2회 완료')
      await widget.getByRole('button',{name:'결과 보기'}).click()
      await expect(page.getByLabel('응답 본문 편집')).toHaveValue(/loopback-4/)
      expect(received.slice(2).map(row=>JSON.parse(row.body).sample)).toEqual(['sample_3','sample_4'])
      const warnings = await consent.evaluate(value => value.warnings)
      expect(warnings).toHaveLength(3)
      for (const text of warnings) expect(text).toContain(endpoint)
      missing = true
      await page.getByLabel('반복 보내기',{exact:true}).uncheck()
      await page.getByRole('button',{name:'보내기',exact:true}).click()
      await page.getByRole('button',{name:'전송 오류 · console 열기'}).click()
      await expect.poll(()=>consoleLog.textContent()).toContain(missingBody)
      await expect(consoleLog).toContainText('HTTP 404')
    } finally {
      await consent.evaluate(value => value.restore())
      await consent.dispose()
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('keeps sending in the tray, drains the active round on Exit and resumes at the saved index only on demand', async ({desktop}) => {
  const received: {index:string; auth?:string}[] = []
  const held: ServerResponse[] = []
  let logins = 0
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/login') {
      response.end(JSON.stringify({token:'session-' + ++logins}))
    } else if (request.url === '/samples') {
      const {index} = JSON.parse(Buffer.concat(chunks).toString())
      received.push({index, auth:request.headers.authorization})
      if (held.length < 2) held.push(response)
      else response.end('{"ok":true}')
    } else {
      response.writeHead(404).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
    const allowed = [origin + '/login', origin + '/samples']
    const {page, app} = desktop
    await observeConsent(app, allowed)
    await page.evaluate(async origin => {
      const api = window.postRail!
      await api.mutate({type:'env.save', environment:{
        id:'', name:'로컬', variables:{}, apiOrigin:origin, loginUrl:origin + '/login', loginHeaders:{},
        loginBody:'{}', tokenPath:'token', tokenHeader:'Authorization', tokenPrefix:'Bearer ', hasPassword:false,
      }})
      await api.mutate({type:'request.save', request:{
        id:'', name:'종료 검증', method:'POST', url:origin + '/samples', groupId:null, headers:{}, useAuth:true,
        body:'{"index":"${index}"}', timeoutMs:null, nextIndex:'1', favorite:true,
      }})
    }, origin)
    await page.getByRole('navigation', {name:'WorkRail 도구'}).getByRole('button', {name:'PostRail', exact:true}).click()
    await page.getByRole('checkbox', {name:'반복 보내기'}).check()
    await page.getByLabel('횟수', {exact:true}).fill('3')
    await page.getByRole('button', {name:'3회 보내기'}).click()
    await expect.poll(() => held.length).toBe(1)
    const visible = () => app.evaluate(({BrowserWindow}) =>
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))!.isVisible())
    const closing = page.getByRole('button', {name:'창 닫기', exact:true}).click().then(() => null, error => error)
    await expect.poll(visible).toBe(false)
    held[0].end('{"ok":true}')
    await expect.poll(() => held.length).toBe(2)
    expect(await visible()).toBe(false)
    const control = (action:'show'|'requestQuit') => app.evaluate((_electron, action) => {
      const controller = (globalThis as unknown as {desktopController:{show():void; requestQuit():void}}).desktopController
      controller[action]()
    }, action)
    await control('show')
    expect(await closing).toBeNull()
    await expect.poll(visible).toBe(true)
    await expect(page.getByRole('button', {name:'중지', exact:true})).toBeVisible()
    await page.getByRole('button',{name:'console',exact:true}).click()
    await expect(page.getByLabel('console 로그')).toContainText(/로그인 시작[\s\S]*토큰 발급[\s\S]*2회차 · 요청 전송/)
    await expect(page.getByLabel('console 로그')).not.toContainText('session-1')

    const exited = Promise.all([app.waitForEvent('close'), once(app.process(), 'exit')])
    await control('requestQuit')
    // Observe the shutdown write/read fence while the second HTTP response is still pending.
    // A premature exit closes this page and fails the assertion.
    await expect.poll(() => page.evaluate(async () => {
      try {await window.postRail!.state(); return false}
      catch (error) {return String(error).includes('PostRail 접근이 허용되지 않았습니다')}
    })).toBe(true)
    held[1].end('{"ok":true}')
    await exited
    expect(received).toEqual([{index:'1',auth:'Bearer session-1'}, {index:'2',auth:'Bearer session-1'}])
    expect(logins).toBe(1)

    await desktop.restart()
    const restored = await desktop.page.evaluate(async () => ({
      run:await window.postRail!.state(), library:await window.postRail!.read(), lines:await window.postRail!.consoleSince(0),
    }))
    expect(restored.lines).toEqual([])
    expect(restored.run).toMatchObject({phase:'idle', runId:'', authenticatedEnvironmentIds:[], completed:'0'})
    expect(restored.library.requests).toMatchObject([{name:'종료 검증', nextIndex:'3', favorite:true}])
    expect(received).toHaveLength(2)
    const consent = await observeConsent(desktop.app, allowed)
    try {
      await desktop.page.getByRole('button', {name:'종료 검증 즉시 실행'}).click()
      await expect.poll(() => received.length).toBe(3)
      expect(received[2]).toEqual({index:'3',auth:'Bearer session-2'})
      expect(logins).toBe(2)
    } finally {
      await consent.evaluate(value => value.restore())
      await consent.dispose()
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('sends native-selected binary and repeated multipart files to a loopback server', async ({desktop}, testInfo) => {
  const uploads:{body:Buffer,type:string}[]=[]
  const server=createServer(async (req,res)=>{
    const chunks:Buffer[]=[]
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    uploads.push({body:Buffer.concat(chunks),type:req.headers['content-type'] ?? ''})
    res.writeHead(204).end()
  })
  const path=testInfo.outputPath('upload.bin')
  const bytes=Buffer.from([0,255,10,128,1])
  await writeFile(path,bytes)
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  try {
    const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/upload'
    await observeConsent(desktop.app,[url])
    await desktop.app.evaluate(({dialog},path)=>{
      dialog.showOpenDialog=async ()=>({canceled:false,filePaths:[path]})
    },path)
    const {page}=desktop
    const saved=await page.evaluate(async url=>{
      const api=window.postRail!
      const env=await api.mutate({type:'env.save',environment:{
        id:'',name:'첨부 시험',variables:{},apiOrigin:'',loginUrl:'',loginHeaders:{},loginBody:'',
        tokenPath:'token',tokenHeader:'Authorization',tokenPrefix:'Bearer ',hasPassword:false,
      }})
      const request=(await api.mutate({type:'request.save',request:{
        id:'',name:'첨부',method:'POST',url,body:'',headers:{},useAuth:false,groupId:null,
        timeoutMs:null,nextIndex:'1',favorite:false,
      }})).requests[0]
      const file=await api.chooseFile(request.id)
      if (!file) throw Error('첨부 파일 선택 취소')
      const part={name:'uploads',value:'',enabled:true,kind:'file' as const,file,mime:'application/vnd.team'}
      const updated=await api.mutate({type:'request.save',request:{...request,bodyMode:'binary',binaryFile:file,parts:[part,part]}})
      return {request:updated.requests[0],environmentId:env.environmentId!,count:'1'}
    },url)
    expect(saved.request.binaryFile?.name).toBe('upload.bin')
    expect(JSON.stringify(saved)).not.toContain(path)
    await page.evaluate(input=>window.postRail!.start(input),saved)
    await expect.poll(()=>page.evaluate(()=>window.postRail!.state())).toMatchObject({phase:'completed',completed:'1',failed:'0',uncertain:'0'})
    expect(uploads[0]).toEqual({type:'application/octet-stream',body:bytes})
    await page.evaluate(input=>window.postRail!.start({...input,request:{...input.request,bodyMode:'multipart'}}),saved)
    await expect.poll(()=>page.evaluate(()=>window.postRail!.state())).toMatchObject({phase:'completed',completed:'1',failed:'0',uncertain:'0'})
    expect(uploads).toHaveLength(2)
    const mime=uploads[1].type
    expect(mime).toMatch(/^multipart\/form-data; boundary=/)
    const parts=(await new Response(new Uint8Array(uploads[1].body),{headers:{'content-type':mime}}).formData()).getAll('uploads') as File[]
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part.name).toBe('upload.bin')
      expect(part.type).toBe('application/vnd.team')
      expect(Buffer.from(await part.arrayBuffer())).toEqual(bytes)
    }
    await rm(path)
    await expect(page.evaluate(input=>window.postRail!.start(input),saved)).rejects.toThrow('파일을 다시 선택하세요.')
    expect(uploads).toHaveLength(2)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()))
    await rm(path,{force:true})
  }
})
