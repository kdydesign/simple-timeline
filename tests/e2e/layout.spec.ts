import { test, expect } from './fixture'
test('short windows scroll the editor without hiding save actions', async ({
  desktop: d,
}) => {
  await d.page.setViewportSize({ width: 640, height: 400 })
  await d.page
    .getByRole('button', { name: '프로젝트 추가', exact: true })
    .click()
  await d.page.getByLabel('프로젝트 이름', { exact: true }).fill('작은 창')
  const save = d.page.getByRole('button', { name: '저장', exact: true })
  await save.scrollIntoViewIfNeeded()
  const box = (await save.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(400)
  await save.focus()
  await d.page.keyboard.press('Enter')
  await expect(
    d.page.getByRole('button', { name: '작은 창 편집', exact: true }),
  ).toBeVisible()
})
test('long-name confirmation keeps complete text and scrollable actions within the viewport', async ({
  desktop: d,
}) => {
  await d.page.setViewportSize({ width: 900, height: 700 })
  const name = '긴이름'.repeat(1200)
  await d.page
    .getByRole('button', { name: '프로젝트 추가', exact: true })
    .click()
  await d.page.getByLabel('프로젝트 이름', { exact: true }).fill(name)
  await d.page.getByRole('button', { name: '저장', exact: true }).click()
  await d.page
    .getByRole('button', { name: name + ' 편집', exact: true })
    .click()
  await d.page.getByRole('button', { name: '삭제', exact: true }).click()
  const dialog = d.page.getByRole('alertdialog')
  await expect(dialog).toContainText(name)
  const box = (await dialog.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(700)
  const cancel = dialog.getByRole('button', { name: '취소', exact: true })
  await cancel.scrollIntoViewIfNeeded()
  await cancel.click()
  await expect(d.page.getByRole('alertdialog')).toHaveCount(0)
})
