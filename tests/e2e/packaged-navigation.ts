import { expect, type Page } from '@playwright/test'

/** New WorkRail opens Home; legacy migration fixtures still open Planrail. */
export async function openPackagedPlanrail(page: Page) {
  await page.getByRole('button', { name: '프로젝트 추가', exact: true, includeHidden: true }).waitFor({ state: 'attached' })
  const dock = page.getByRole('navigation', { name: 'WorkRail 도구' })
  if (await dock.count()) await dock.getByRole('button', { name: 'Planrail', exact: true }).click()
  await expect(page.getByRole('button', { name: '프로젝트 추가', exact: true })).toBeVisible()
}
