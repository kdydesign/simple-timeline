import { expect, test } from './fixture'

test('server and layout editors use full-size controls beside a compact terminal sidebar', async ({ desktop }, info) => {
  const { page } = desktop
  await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'TermRail' }).click()
  const sidebar = page.locator('.termrail-sidebar')
  for (const [name, field] of [['서버 추가', '서버 이름'], ['레이아웃 저장', '레이아웃 이름']]) {
    const trigger = sidebar.getByRole('button', { name })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog).toBeVisible()
    expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(400)
    expect((await dialog.getByLabel(field).boundingBox())!.height).toBeGreaterThanOrEqual(32)
    if (name === '서버 추가') await dialog.screenshot({ path: info.outputPath('termrail-server-help.png') })
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger.locator('svg')).toBeVisible()
  }
  await page.setViewportSize({ width: 760, height: 520 })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(100)
  const add = sidebar.getByRole('button', { name: '서버 추가' })
  await expect(add.locator('span')).toBeHidden()
  await add.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '서버 추가' })
  await expect(dialog.getByLabel('서버 이름')).toBeFocused()
  await expect(dialog.getByRole('button', { name: '저장', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(add).toBeFocused()
})
