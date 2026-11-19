import { test, expect } from './fixture'

test.use({ seed: 'scale' })

test.describe('Home launch', () => {
  test.use({ initialTool: 'home', seed: 'hotfix' })
  test('launches on Home with top navigation and a separate PlanRail status footer', async ({ desktop: { page } }, info) => {
    await page.setViewportSize({ width: 1100, height: 680 })
    const dock = page.getByRole('navigation', { name: 'WorkRail 도구' })
    await expect(dock.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 4000 })
    await expect(page.getByRole('heading', { name: 'WorkRail' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '오늘의 일정' })).toBeVisible()
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeEnabled()
    await page.screenshot({ path: info.outputPath('workrail-home.png') })

    await dock.getByRole('button', { name: 'PlanRail' }).click()
    await expect(page.getByRole('scrollbar', { name: '간트 가로 이동' })).toBeVisible()
    const [navigation, footer] = await Promise.all([dock.boundingBox(), page.locator('.gantt-navigation').boundingBox()])
    expect(navigation!.y + navigation!.height).toBeLessThanOrEqual(footer!.y)
    const status = await page.getByRole('contentinfo', {name:'PlanRail 상태'}).boundingBox()
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(status!.y)
    await page.screenshot({ path: info.outputPath('workrail-planrail.png') })

    await dock.getByRole('button', { name: 'NodeRail' }).click()
    await expect(page.getByRole('main', { name: 'NodeRail' })).toBeVisible()
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      await expect(page.getByText('Node 관리는 Windows x64에서 사용할 수 있습니다.')).toBeVisible()
    }
    await page.screenshot({ path: info.outputPath('workrail-node.png') })
    await page.getByRole('button', { name: '설정', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '설정' })
    await expect(settings).toBeVisible()
    await expect(dock).toBeHidden()
    await settings.getByRole('button', { name: '설정 닫기' }).click()
    await expect(dock.getByRole('button', { name: 'NodeRail' })).toHaveAttribute('aria-current', 'page')
  })
})

test('retains narrow drafts, date selection, and both Gantt scroll positions', async ({ desktop: { page } }) => {
  await page.setViewportSize({ width: 980, height: 620 })
  const dock = page.getByRole('navigation', { name: 'WorkRail 도구' })
  const date = page.getByRole('textbox', { name: '선택 날짜' })
  await date.fill('2026-12-15')
  await date.press('Enter')
  const horizontal = page.getByRole('scrollbar', { name: '간트 가로 이동' })
  await horizontal.press('ArrowRight')
  const position = await horizontal.getAttribute('aria-valuetext')
  const body = page.locator('.gantt-body')
  await body.evaluate(element => { element.scrollTop = 680 })
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(680)
  await page.getByRole('banner').getByRole('button', { name: '일정 추가', exact: true }).click()
  const name = page.getByRole('textbox', { name: '일정 이름' })
  await name.fill('메뉴 전환 후 이어 쓸 일정')
  const start = page.getByRole('textbox', { name: '시작일' })
  await start.fill('2026-12-16')
  await start.press('Tab')
  await page.keyboard.press('F6')
  await expect(dock.getByRole('button', { name: 'PlanRail' })).toBeFocused()
  await dock.getByRole('button', { name: 'NodeRail' }).click()
  await expect(name).toBeHidden()

  // A hidden Gantt must not arm the Space-to-pan shortcut in another tool.
  await page.locator('body').evaluate(element => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
  })
  await dock.getByRole('button', { name: 'PlanRail' }).click()
  await expect(name).toHaveValue('메뉴 전환 후 이어 쓸 일정')
  await expect(start).toHaveValue('2026-12-16')
  await page.getByRole('button', { name: '편집 닫기', exact: true }).click()
  await expect(date).toHaveValue('2026-12-15')
  await expect(horizontal).toHaveAttribute('aria-valuetext', position!)
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(680)

  const area = (await page.locator('.gantt-date-heading').boundingBox())!
  await page.mouse.move(area.x + 180, area.y + 20)
  await page.mouse.down()
  await page.mouse.move(area.x + 80, area.y + 20)
  await page.mouse.up()
  await expect(horizontal).toHaveAttribute('aria-valuetext', position!)
})
