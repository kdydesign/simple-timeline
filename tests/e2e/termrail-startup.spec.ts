import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { Server, utils, type Connection } from 'ssh2'
import { expect, test } from './fixture'

test.use({ initialTool: 'home' })

test('imports a startup file through the native picker and authenticates only after host trust', async ({ desktop }) => {
  const { app, page, profile } = desktop
  const password = randomUUID()
  const file = join(profile, 'startup-fixture.sh')
  await writeFile(file, '# workrail-user: fixture\n# workrail-password: ' + password + '\npwd\n')
  const clients = new Set<Connection>()
  let authentications = 0
  let transports = 0
  const server = new Server({ hostKeys: [utils.generateKeyPairSync('ed25519').private] }, client => {
    transports++
    clients.add(client)
    client.on('error', () => {}).on('close', () => clients.delete(client))
    client.on('authentication', request => {
      if (request.method === 'password' && request.username === 'fixture' && request.password === password) {
        authentications++
        request.accept()
      } else request.reject(['password'])
    }).on('ready', () => {
      client.on('session', accept => {
        accept().on('pty', permit => permit?.()).on('exec', (permit, reject, info) => {
          if (info.command.includes(password)) { reject(); return }
          const channel = permit()
          let body = Buffer.alloc(0)
          channel.on('data', (chunk: Buffer) => {
            body = Buffer.concat([body, chunk])
            if (body.includes(0)) {
              if (body.equals(Buffer.from('pwd\n\0'))) channel.write('STARTUP-SESSION-READY\r\n')
              else channel.end()
            }
          })
          channel.write(Buffer.from([0]))
        })
      })
    })
  })
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
    await dialog.getByLabel('서버 이름').fill('Startup fixture')
    await dialog.getByLabel('호스트', { exact: true }).fill('127.0.0.1')
    await dialog.getByLabel('포트', { exact: true }).fill(String((server.address() as AddressInfo).port))
    await dialog.getByRole('button', { name: '시작 파일 가져오기' }).click()
    if (process.platform === 'win32') expect(secure).toBe(true)
    if (!secure) {
      await expect(dialog.getByRole('alert')).toBeVisible()
      await expect(dialog.getByText('startup-fixture.sh', { exact: true })).toHaveCount(0)
      expect(authentications).toBe(0)
      return
    }
    await expect(dialog.getByText('startup-fixture.sh', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: '저장하고 연결' }).click()
    const trust = page.getByRole('button', { name: '키 신뢰', exact: true })
    await expect(trust).toBeVisible()
    expect(authentications).toBe(0)
    await trust.click()
    await expect(page.locator('.termrail-console[data-state=connected] .xterm-rows')).toBeVisible()
    await expect(page.locator('.xterm-rows')).toContainText('STARTUP-SESSION-READY')
    expect(authentications).toBe(1)
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
    expect(authentications).toBe(1)
    await resume.click()
    await expect(page.locator('.termrail-console[data-state=connected] .xterm-rows')).toBeVisible()
    await expect(page.locator('.xterm-rows')).toContainText('STARTUP-SESSION-READY')
    expect(authentications).toBe(2)
    expect(transports).toBe(2)
  } finally {
    for (const client of clients) client.end()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
