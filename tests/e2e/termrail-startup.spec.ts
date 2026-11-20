import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { unlink, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { Server, type Connection, type ServerChannel } from 'ssh2'
import { expect, test } from './fixture'
import { createTestSshHostKey } from '../fixtures/ssh-host-key'

test.use({ initialTool: 'home' })

test('imports a startup file through the native picker and authenticates only after host trust', async ({ desktop }) => {
  const { app, page, profile } = desktop
  const password = randomUUID()
  const file = join(profile, 'startup-fixture.sh')
  await writeFile(file, '# workrail-user: fixture\n# workrail-password: ' + password + '\nls\npwd\n')
  const clients = new Set<Connection>()
  const shells: { channel: ServerChannel, received: Buffer[] }[] = []
  const prompt = '\x1b]133;A\x07remote@fixture:~$ \x1b]133;B\x07'
  const passwordRequests: (() => void)[] = []
  const shellRequests: (() => void)[] = []
  let execRequests = 0
  let transports = 0
  const server = new Server({ hostKeys: [createTestSshHostKey()] }, client => {
    transports++
    clients.add(client)
    client.on('error', () => {}).on('close', () => clients.delete(client))
    client.on('authentication', request => {
      if (request.method === 'password' && request.username === 'fixture' && request.password === password) {
        passwordRequests.push(() => request.accept())
      } else request.reject(['password'])
    }).on('ready', () => {
      client.on('session', accept => {
        accept().on('pty', permit => permit?.()).on('exec', (_permit, reject) => {
          execRequests++
          reject()
        }).on('shell', permit => {
          shellRequests.push(() => {
            const channel = permit()
            const received: Buffer[] = []
            shells.push({ channel, received })
            channel.on('data', (data: Buffer) => received.push(data))
            channel.write('Connected to disposable server\r\n')
          })
        })
      })
    })
  })
  async function runStartup(sessionIndex: number) {
    await expect(page.getByText('인증 중…', {exact: true})).toBeVisible()
    await expect.poll(() => passwordRequests.length).toBe(sessionIndex + 1)
    passwordRequests[sessionIndex]()
    await expect(page.getByText('터미널 여는 중…', {exact: true})).toBeVisible()
    await expect.poll(() => shellRequests.length).toBe(sessionIndex + 1)
    shellRequests[sessionIndex]()
    const rows = page.locator('.termrail-console[data-state=connected] .xterm-rows')
    await expect(rows).toContainText('Connected to disposable server')
    await expect(page.getByText('시작 명령 대기 중', {exact: false})).toBeVisible()
    const {channel, received} = shells[sessionIndex]
    const input = () => Buffer.concat(received).toString()
    expect(input()).toBe('')
    channel.write(prompt)
    await expect.poll(input).toBe('ls\r')
    channel.write('ls\r\nlisting-witness.txt\r\n')
    await expect(rows).toContainText('listing-witness.txt')
    expect(input()).toBe('ls\r')
    channel.write(prompt)
    await expect.poll(input).toBe('ls\rpwd\r')
    channel.write('pwd\r\n/fixture/work\r\n' + prompt)
    await expect(rows).toContainText('/fixture/work')
    await expect(rows).not.toContainText(password)
    expect(execRequests).toBe(0)
  }
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const secure = await app.evaluate(async ({ dialog, safeStorage }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
      return await safeStorage.isAsyncEncryptionAvailable()
        && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
    }, file)
    await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'TermRail' }).click()
    await page.getByRole('button', { name: '서버 선택' }).click()
    await page.getByRole('menuitem', { name: '새 터미널…' }).click()
    const dialog = page.getByRole('dialog', { name: '새 터미널' })
    await dialog.getByRole('button', { name: '시작 파일 가져오기' }).click()
    if (process.platform === 'win32') expect(secure).toBe(true)
    if (!secure) {
      await expect(dialog.getByRole('alert')).toBeVisible()
      await expect(dialog.getByText('startup-fixture.sh', { exact: true })).toHaveCount(0)
      expect(passwordRequests).toHaveLength(0)
      return
    }
    await expect(dialog.getByText('startup-fixture.sh', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '저장하고 연결' }).click()
    await expect(dialog.getByLabel('서버 이름')).toBeFocused()
    expect(transports).toBe(0)
    await expect(dialog.getByText('startup-fixture.sh', { exact: true })).toBeVisible()
    await dialog.getByLabel('서버 이름').fill('Startup fixture')
    await dialog.getByLabel('호스트', { exact: true }).fill('127.0.0.1')
    await dialog.getByLabel('포트', { exact: true }).fill(String((server.address() as AddressInfo).port))
    await dialog.getByRole('button', { name: '저장하고 연결' }).click()
    const trust = page.getByRole('button', { name: '키 신뢰', exact: true })
    await expect(trust).toBeVisible()
    expect(passwordRequests).toHaveLength(0)
    await trust.click()
    await runStartup(0)
    // Layout restore must resolve the already-bound encrypted copy after the source disappears.
    await unlink(file)
    const dock = page.getByRole('navigation', {name: 'WorkRail 도구'})
    await dock.getByRole('button', {name: 'Home', exact: true}).click()
    await dock.getByRole('button', {name: 'TermRail', exact: true}).click()
    await expect(page.locator('.xterm-rows')).toContainText('/fixture/work')
    await page.locator('.xterm-helper-textarea').focus()
    await page.keyboard.type('echo manual')
    await page.keyboard.press('Enter')
    await expect.poll(() => Buffer.concat(shells[0].received).toString()).toBe('ls\rpwd\recho manual\r')
    expect(passwordRequests).toHaveLength(1)
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password)
    await expect(page.locator('.xterm-rows')).not.toContainText(password)

    await page.getByRole('button', { name: '레이아웃 저장', exact: true }).click()
    const save = page.getByRole('dialog', { name: '레이아웃 저장' })
    await save.getByLabel('레이아웃 이름').fill('Saved startup')
    await save.getByRole('button', { name: '저장', exact: true }).click()
    await page.getByRole('button', { name: 'Saved startup', exact: true }).click()
    const resume = page.getByRole('button', { name: '시작 파일로 로그인' })
    await expect(resume).toBeVisible()
    expect(transports).toBe(2)
    expect(passwordRequests).toHaveLength(1)
    await resume.click()
    await runStartup(1)
    expect(passwordRequests).toHaveLength(2)
    expect(transports).toBe(2)
  } finally {
    for (const client of clients) client.end()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
