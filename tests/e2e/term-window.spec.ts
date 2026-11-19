import { expect, test } from './fixture'

test('a detached terminal is a sandboxed local surface and follows the main window to the tray', async ({ desktop }) => {
  const { page, app } = desktop
  const popup = await page.evaluateHandle(() => {
    const frameName = window.workrailTermWindow!.prepare({ x: 25, y: 30, width: 600, height: 480 })
    if (!frameName) throw Error('창 열기 권한이 없습니다.')
    const child = window.open('about:blank', frameName)
    if (!child) throw Error('별도 창을 열지 못했습니다.')
    child.document.body.textContent = '터미널 출력'
    child.addEventListener('pagehide', () => { document.body.dataset.termWindowReturned = 'true' }, { once: true })
    return child
  })
  expect(await popup.evaluate(child => ({
    content: child.document.body.textContent,
    timeline: typeof child.simpleTimeline,
    windows: typeof child.workrailTermWindow,
    node: 'require' in child,
    nested: child.open('about:blank', '_blank') !== null,
  }))).toEqual({ content: '터미널 출력', timeline: 'undefined', windows: 'undefined', node: false, nested: false })
  expect(await page.evaluate(() => window.open('about:blank', 'termrail-unknown') !== null)).toBe(false)
  const result = await app.evaluate(async ({ BrowserWindow }) => {
    const child = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'about:blank')!
    const host = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))!
    const prefs = (child.webContents as unknown as { getLastWebPreferences(): Electron.WebPreferences }).getLastWebPreferences()
    const navigation = new Promise<boolean>(resolve => {
      child.webContents.once('will-frame-navigate', event => resolve(event.defaultPrevented))
    })
    await child.webContents.executeJavaScript("location.assign('https://workrail.invalid/')")
    const blocked = await navigation
    host.hide()
    const hidden = !child.isVisible()
    host.show()
    const restored = child.isVisible()
    child.close()
    return { blocked, hidden, restored, sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation }
  })
  expect(result).toEqual({ blocked: true, hidden: true, restored: true, sandbox: true, contextIsolation: true })
  await expect.poll(() => page.evaluate(() => document.body.dataset.termWindowReturned)).toBe('true')
  expect(await popup.evaluate(child => child.closed)).toBe(true)
})
