import {once} from 'node:events'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {Server, type Connection} from 'ssh2'
import {createTestSshHostKey} from '../fixtures/ssh-host-key'
import {expect,test} from './fixture'

test.use({initialTool:'home',fault:'reminder-test'})

test('registers a device, observes independent services, opens a favorite and an unsaved SSH tab',async ({desktop:{app,page}}, info)=>{
  const clients = new Set<Connection>()
  const ssh = new Server({hostKeys:[createTestSshHostKey()]}, client=>{
    clients.add(client)
    client.on('error',()=>{}).on('close',()=>clients.delete(client))
  })
  let code = 503
  const http = createServer((_req,res)=>res.writeHead(code).end())
  try {
    ssh.listen(0,'127.0.0.1')
    http.listen(0,'127.0.0.1')
    await Promise.all([once(ssh,'listening'),once(http,'listening')])
    const dock=page.getByRole('navigation',{name:'WorkRail 도구'})
    await dock.getByRole('button',{name:'DeviceRail',exact:true}).click()
    await page.getByRole('button',{name:'장비 등록',exact:true}).click()
    const dialog=page.getByRole('dialog')
    const name='검증 장비'
    await dialog.getByLabel('장비 이름',{exact:true}).fill(name)
    await dialog.getByLabel('SSH 주소',{exact:true}).fill('127.0.0.1')
    await dialog.getByLabel('SSH 포트',{exact:true}).fill(String((ssh.address() as AddressInfo).port))
    await dialog.getByLabel('위치',{exact:true}).fill('개발실')
    await dialog.getByRole('combobox',{name:/제품 서비스 검사/}).selectOption('http')
    await dialog.getByLabel(/^상태 URL/).fill('http://127.0.0.1:'+(http.address() as AddressInfo).port+'/health')
    const alerts = dialog.getByRole('switch',{name:'장비 이상 알림'})
    await expect(alerts).not.toBeChecked()
    await alerts.click()
    await dialog.getByLabel('Home 즐겨찾기',{exact:true}).check()
    await dialog.getByRole('button',{name:'저장',exact:true}).click()
    await expect(dialog).toHaveCount(0)
    const status=()=>page.evaluate(async()=>{
      const state=await window.deviceRail!.snapshot()
      const device=state.devices.find(d=>d.name==='검증 장비')
      return device && [state.health[device.id]?.ssh.state,state.health[device.id]?.service.state]
    })
    await expect.poll(status).toEqual(['ok','failed'])
    const messages = () => app.evaluate(() => (globalThis as typeof globalThis & {
      reminderMessages?: {title:string; body:string}[]
    }).reminderMessages ?? [])
    expect(await messages()).toEqual([])
    await page.getByRole('button',{name:'다시 검사',exact:true}).click()
    await expect.poll(messages).toEqual([{title:name+' · 장비 이상',body:'제품 서비스 · HTTP 503'}])
    await page.getByRole('button',{name:'매크로 추가',exact:true}).click()
    await dialog.getByLabel('매크로 이름',{exact:true}).fill('작업 경로')
    await dialog.getByLabel('셸 명령',{exact:true}).fill('pwd')
    await dialog.getByRole('button',{name:'저장',exact:true}).click()
    await expect(dialog).toHaveCount(0)
    await page.setViewportSize({width:1280,height:800})
    await page.screenshot({path:info.outputPath('device-status.png')})
    code=204
    await page.getByRole('button',{name:'다시 검사',exact:true}).click()
    await expect.poll(status).toEqual(['ok','ok'])
    await dock.getByRole('button',{name:'Home',exact:true}).click()
    const widget=page.getByRole('region',{name:'장비 상태',exact:true})
    await expect(widget.getByRole('button',{name})).toBeVisible()
    expect(await messages()).toHaveLength(1)
    await widget.screenshot({path:info.outputPath('device-favorites.png')})
    await widget.getByRole('button',{name}).click()
    await expect(dock.getByRole('button',{name:'DeviceRail',exact:true})).toHaveAttribute('aria-current','page')
    await page.getByRole('button',{name:'SSH 열기',exact:true}).click()
    await expect(dock.getByRole('button',{name:'TermRail',exact:true})).toHaveAttribute('aria-current','page')
    await expect(page.getByRole('tab',{name:new RegExp(name)})).toBeVisible()
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('workrail.termrail.v1') ?? '{"profiles":[]}').profiles)).toHaveLength(0)
  } finally {
    for(const c of clients)c.end()
    http.closeAllConnections()
    ssh.close()
    http.close()
  }
})
