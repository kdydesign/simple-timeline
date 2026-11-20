import type {Page} from 'playwright'
import {createServer, type AddressInfo} from 'node:net'
import {once} from 'node:events'
import {expect, test} from './fixture'

async function gripColors(page: Page, vertical: boolean, hitSize: number) {
  const grip = page.getByRole('separator').and(page.locator('[aria-orientation="' + (vertical ? 'vertical' : 'horizontal') + '"]'))
  await expect(grip).toBeVisible()
  await page.mouse.move(0, 0)
  const read = () => grip.evaluate(el => {
    const style = getComputedStyle(el, '::after')
    return {width:style.width, height:style.height, color:style.backgroundColor}
  })
  const resting = await read()
  expect([resting.width, resting.height]).toEqual(vertical ? ['3px', '36px'] : ['36px', '3px'])
  expect((await grip.boundingBox())![vertical ? 'width' : 'height']).toBe(hitSize)
  await grip.hover()
  const accent = (await read()).color
  expect(accent).not.toBe(resting.color)
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await grip.focus()
  expect((await read()).color).toBe(accent)
  return [resting.color, accent]
}

test('shares the PostRail grip across terminal split axes and detached windows', async ({desktop:{page, app}}) => {
  // This fixture only supplies a loopback endpoint. Release both socket halves
  // immediately so an unread SSH greeting cannot keep server.close() pending.
  const server = createServer(socket => socket.destroy())
  server.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    await page.evaluate(port => {
      const pane = {kind:'pane', pane:'a'}
      const tree = {kind:'split', direction:'row', ratio:0.6, first:pane,
        second:{kind:'split', direction:'column', ratio:0.4, first:pane, second:pane}}
      const tab = {titleProfileId:'a', title:'테스트', tree}
      localStorage.setItem('workrail.termrail.v1', JSON.stringify({
        profiles:[{id:'a', name:'테스트', host:'127.0.0.1', port}],
        layouts:[{name:'분할 확인', layout:{tabs:[tab], selected:0, windows:[]}}],
      }))
    }, (server.address() as AddressInfo).port)
    const dock = page.getByRole('navigation', {name:'WorkRail 도구'})
    await dock.getByRole('button', {name:'TermRail'}).click()
    await page.getByRole('button', {name:'분할 확인'}).click()
    const expected = await gripColors(page, true, 5)
    expect(await gripColors(page, false, 5)).toEqual(expected)
    await page.getByRole('tablist', {name:'작업 탭'}).getByRole('tab').click({button:'right'})
    const childWindow = app.waitForEvent('window')
    await page.getByRole('menuitem', {name:'별도 창으로 열기'}).click()
    const child = await childWindow
    expect(await gripColors(child, true, 5)).toEqual(expected)
    expect(await gripColors(child, false, 5)).toEqual(expected)
    await page.bringToFront()
    await dock.getByRole('button', {name:'PostRail'}).click()
    expect(await gripColors(page, false, 10)).toEqual(expected)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
