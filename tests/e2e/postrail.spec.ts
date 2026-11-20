import {once} from 'node:events'
import {createServer, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import type {ElectronApplication} from 'playwright'
import {expect, test} from './fixture'

test.use({initialTool:'home'})

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

test('sends a saved indexed POST from the editor and Home to a loopback server', async ({desktop}) => {
  const received: {method?:string; path?:string; body:string}[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    received.push({method:request.method, path:request.url, body:Buffer.concat(chunks).toString('utf8')})
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
      const environment = page.getByRole('dialog', {name:'환경 추가', exact:true})
      await environment.getByLabel('환경 이름').fill('로컬')
      await environment.getByRole('button', {name:'저장', exact:true}).click()
      await expect(environment).toBeHidden()
      await page.getByRole('button', {name:'추가 메뉴', exact:true}).click()
      await page.getByRole('menuitem', {name:'요청 추가', exact:true}).click()
      const form = page.getByRole('dialog', {name:'요청 추가', exact:true})
      const name = '로컬 샘플 등록'
      await form.getByLabel('요청 이름').fill(name)
      await form.getByLabel('URL', {exact:true}).fill(endpoint)
      await form.getByRole('button', {name:'저장', exact:true}).click()
      await page.getByLabel('HTTP 메서드').selectOption('POST')
      await page.getByLabel('JSON 요청 본문').fill('{"sample":"sample_${index}"}')
      await page.getByRole('button', {name:'변경 저장'}).click()
      await expect(page.getByRole('button', {name:/변경 저장|저장 중…/})).toHaveCount(0)
      const star = page.getByRole('button', {name:name + ' 즐겨찾기', exact:true})
      await star.click()
      await expect(star).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', {name:'보내기', exact:true}).click()
      await expect(page.getByLabel('응답 본문', {exact:true})).toContainText('loopback-1')
      await page.getByRole('button', {name:'회차별 결과', exact:true}).click()
      await expect(page.getByLabel('회차별 결과 로그')).toHaveValue(/201/)

      await dock.getByRole('button', {name:'Home', exact:true}).click()
      const widget = page.getByRole('region', {name:'PostRail 즐겨찾기'})
      await widget.getByRole('button', {name:name + ' 즉시 실행'}).click()
      await expect.poll(() => received.length).toBe(2)
      await expect(widget).toBeVisible()
      await widget.getByRole('button', {name:'PostRail 열기'}).click()
      await expect(page.getByLabel('응답 본문', {exact:true})).toContainText('loopback-2')
      expect(received.map(row => ({...row, body:JSON.parse(row.body)}))).toEqual([
        {method:'POST', path:'/samples', body:{sample:'sample_1'}},
        {method:'POST', path:'/samples', body:{sample:'sample_2'}},
      ])
      const warnings = await consent.evaluate(value => value.warnings)
      expect(warnings).toHaveLength(2)
      for (const text of warnings) expect(text).toContain(endpoint)
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
      run:await window.postRail!.state(), library:await window.postRail!.read(),
    }))
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
