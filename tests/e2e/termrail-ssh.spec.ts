import type {AddressInfo} from 'node:net'
import {once} from 'node:events'
import {Server, utils, type Connection, type ServerChannel} from 'ssh2'
import {expect, test} from './fixture'

test.use({initialTool:'home'})

test('TermRail authenticates, renders remote output, and retains its PTY while hidden', async ({desktop}) => {
  const {page, app} = desktop
  const clients = new Set<Connection>()
  const received: Buffer[] = []
  const widths: number[] = []
  let shell: ServerChannel | undefined
  let logins = 0
  const server = new Server({hostKeys:[utils.generateKeyPairSync('ed25519').private]}, client => {
    clients.add(client)
    client.on('error', () => {}).on('close', () => clients.delete(client))
    client.on('authentication', auth => {
      if (auth.method === 'password' && auth.username === 'fixture-user' && auth.password === 'fixture-secret') {
        logins++
        auth.accept()
      } else auth.reject(['password'])
    }).on('ready', () => {
      client.on('session', accept => {
        accept().on('pty', (permit, _reject, dimensions) => {
          widths.push(dimensions.cols)
          permit?.()
        }).on('window-change', (_permit, _reject, dimensions) => {
          widths.push(dimensions.cols)
        }).on('shell', acceptShell => {
          shell = acceptShell()
          shell.on('data', (data: Buffer) => received.push(data))
          shell.write('connected\r\n\x1b[32mREADY\x1b[0m\r\n')
        })
      })
    })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const dock = page.getByRole('navigation', {name:'WorkRail 도구'})
    const termRail = dock.getByRole('button', {name:'TermRail'})
    await termRail.click()
    await page.getByRole('button', {name:'서버 선택'}).click()
    await page.getByRole('menuitem', {name:'새 터미널…'}).click()
    const dialog = page.getByRole('dialog', {name:'새 터미널'})
    await dialog.getByLabel('서버 이름').fill('Loopback')
    await dialog.getByLabel('호스트').fill('127.0.0.1')
    await dialog.getByLabel('포트').fill(String((server.address() as AddressInfo).port))
    await dialog.getByRole('button', {name:'저장하고 연결'}).click()
    await page.getByRole('button', {name:'키 신뢰', exact:true}).click()
    const user = page.getByLabel('login as:')
    await user.fill('fixture-user')
    await user.press('Enter')
    const password = page.getByLabel('Password:')
    await password.fill('fixture-secret')
    await password.press('Enter')
    const rows = page.locator('.xterm-rows')
    await expect(rows).toContainText('READY')
    await expect(rows).not.toContainText('fixture-secret')
    const input = page.locator('.xterm-helper-textarea')
    await input.focus()
    await page.keyboard.insertText('한글')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Control+c')
    await expect.poll(() => Buffer.concat(received).toString()).toBe('한글\x1b[A\x03')

    const previousWidth = widths.at(-1)!
    await app.evaluate(({BrowserWindow}) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))!
      const [width,height] = win.getSize()
      win.setSize(width > 1150 ? width - 240 : width + 240, height)
    })
    await expect.poll(() => widths.at(-1)).not.toBe(previousWidth)
    await dock.getByRole('button', {name:'Home', exact:true}).click()
    shell!.write('메뉴 전환 중 출력\r\n')
    await termRail.click()
    await expect(rows).toContainText('메뉴 전환 중 출력')

    // Overwrite one cell for longer than the transport replay buffer. Keeping
    // READY on screen after the move requires retaining the live emulator.
    shell!.write('x\b'.repeat(140_000) + 'streamed\r\n')
    await expect(rows).toContainText('streamed')
    const detached = app.waitForEvent('window')
    await page.getByRole('tab', {name:'Loopback'}).click({button:'right'})
    await page.getByRole('menuitem', {name:'별도 창으로 열기'}).click()
    const child = await detached
    await expect(child.locator('.xterm-rows')).toContainText('READY')
    await expect(child.locator('.xterm-rows')).toContainText('streamed')
    await child.locator('.xterm-helper-textarea').focus()
    await child.keyboard.press('ArrowDown')
    await expect.poll(() => Buffer.concat(received).toString()).toBe('한글\x1b[A\x03\x1b[B')
    shell!.write('분리 창 출력\r\n')
    await expect(child.locator('.xterm-rows')).toContainText('분리 창 출력')
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'about:blank')!.close())
    await expect(rows).toContainText('분리 창 출력')
    shell!.write('메인 창 복귀 후 출력\r\n')
    await expect(rows).toContainText('메인 창 복귀 후 출력')
    await input.focus()
    await page.keyboard.press('F6')
    await expect.poll(() => Buffer.concat(received).toString()).toBe('한글\x1b[A\x03\x1b[B\x1b[17~')

    const closing = page.getByRole('button', {name:'창 닫기', exact:true}).click().then(() => null, e => e)
    await expect.poll(() => app.evaluate(({BrowserWindow}) =>
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))!.isVisible())).toBe(false)
    shell!.write('트레이에서 계속 실행\r\n')
    await app.evaluate(() => (globalThis as any).desktopController.show())
    expect(await closing).toBeNull()
    await expect(rows).toContainText('트레이에서 계속 실행')
    expect(logins).toBe(1)

    const closed = once(shell!, 'close')
    await page.getByRole('button', {name:'Loopback 터미널 닫기'}).click()
    await closed
    await expect(rows).toHaveCount(0)
  } finally {
    for (const client of clients) client.end()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
