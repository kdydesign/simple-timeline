import { test, expect } from './fixture'
for (const [fault, message] of [
  ['refresh', '저장은 완료했지만'],
  ['lost', '저장 결과를 확인할 수 없습니다'],
]) {
  test.describe(fault, () => {
    test.use({ fault })
    test('preserves draft and does not duplicate committed creates after failed responses', async ({
      desktop: d,
    }) => {
      await d.page
        .getByRole('button', { name: '프로젝트 추가', exact: true })
        .click()
      await d.page
        .getByLabel('프로젝트 이름', { exact: true })
        .fill('한 번만 저장')
      await d.page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(d.page.getByRole('alert')).toContainText(message)
      await expect(
        d.page.getByLabel('프로젝트 이름', { exact: true }),
      ).toHaveValue('한 번만 저장')
      await expect(
        d.page.getByRole('button', { name: '저장', exact: true }),
      ).toBeDisabled()
      await d.page.getByRole('button', { name: '다시 조회' }).click()
      const saved = await d.page.evaluate(() =>
        window.simpleTimeline.getSnapshot(),
      )
      expect(saved.ok && saved.data.projects).toHaveLength(1)
    })
  })
}
