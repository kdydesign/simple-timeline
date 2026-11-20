import { expect, test } from './fixture'
import type { Locator } from 'playwright'

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

async function formGeometry(dialog: Locator) {
  const bounds = (await dialog.boundingBox())!
  const controls = [
    dialog.getByRole('heading'), dialog.getByLabel('서버 이름'), dialog.getByLabel('호스트'),
    dialog.getByLabel('포트'), dialog.getByRole('group', { name: '시작 파일' }),
    dialog.getByRole('button', { name: '취소' }), dialog.getByRole('button', { name: '저장', exact: true }),
  ]
  return {
    width: bounds.width,
    controls: await Promise.all(controls.map(async control => {
      const box = (await control.boundingBox())!
      return { x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height }
    })),
  }
}

test('server edit matches the add form in both themes and window sizes and restores focus after Escape', async ({ desktop }) => {
  const { page } = desktop
  await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'TermRail' }).click()
  const add = page.getByRole('button', { name: '서버 추가' })
  const create = page.getByRole('dialog', { name: '서버 추가' })
  await add.click()
  await create.getByLabel('서버 이름').fill('편집 확인')
  await create.getByLabel('호스트').fill('shell.test')
  await create.getByRole('button', { name: '저장', exact: true }).click()
  const server = page.getByRole('button', { name: '편집 확인' })
  const edit = page.getByRole('dialog', { name: '서버 수정' })
  for (const width of [1100, 420]) {
    await page.setViewportSize({ width, height: 600 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await add.press('Enter')
      const standard = await formGeometry(create)
      expect(standard.width).toBeLessThanOrEqual(Math.min(460, width - 28))
      expect(standard.width).toBeGreaterThanOrEqual(Math.min(460, width - 56))
      await create.press('Escape')
      await server.press('Shift+F10')
      await page.getByRole('menuitem', { name: '서버 수정…' }).press('Enter')
      await expect(edit.getByLabel('서버 이름')).toBeFocused()
      await expect(edit.getByLabel('호스트')).toHaveValue('shell.test')
      await expect(edit.getByLabel('포트')).toHaveCSS('height', '36px')
      await expect(edit.getByRole('button', { name: '저장', exact: true })).toBeInViewport()
      expect(await formGeometry(edit)).toEqual(standard)
      await edit.getByLabel('호스트').fill('unsaved.test')
      await edit.press('Escape')
      await expect(server).toBeFocused()
    }
  }
})
