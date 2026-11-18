import type { Locator } from 'playwright'
import { test, expect, type Desktop } from './fixture'
import { nodeManagementChannel, nodeManagementChanged, type NodeManagementState } from '../../src/shared/node-management'

test.use({ initialTool: 'home', seed: 'hotfix' })

async function showWindowsNode(desktop: Desktop) {
  const state: NodeManagementState = {
    revision: 1000, platform: 'win32', supported: true,
    manager: { status: 'ready', version: '1.2.2' }, activeVersion: '22.2.0', activeSource: 'nvm',
    installedVersions: Array.from({ length: 40 }, (_, index) => `22.${index}.0`),
    catalog: {
      status: 'ready', checkedAt: '2026-11-18T10:00:00Z', error: null,
      releases: Array.from({ length: 46 }, (_, index) => ({
        version: `22.${index}.0`, date: '2026-11-18', security: false,
        lts: index % 3 === 0 ? null : index % 2 === 0 ? 'Iron' : 'Jod',
        npm: index === 45 ? null : `10.${index}.0`,
      })),
    },
    busy: null, error: null, conflicts: [], checkedAt: '2026-11-18T10:00:00Z',
  }
  // Only this disposable test application's IPC handler changes. All renderer,
  // preload, layout, and accessibility behavior remain the production code.
  await desktop.app.evaluate(({ ipcMain, BrowserWindow }, { channel, changed, state }) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, command: unknown) => {
      if (command !== 'getState' && command !== 'refreshCatalog') {
        return { ok: false, error: { code: 'forbidden', message: 'Presentation fixture permits reads only.' } }
      }
      return { ok: true, data: state }
    })
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(changed, state)
  }, { channel: nodeManagementChannel, changed: nodeManagementChanged, state })
  await expect(desktop.page.getByRole('region', { name: '내 개발 환경' }).getByText('22.2.0', { exact: true })).toBeVisible()
}

async function box(locator: Locator) {
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  return bounds!
}

async function expectMatchingEdges(left: Locator, right: Locator) {
  const [a, b] = await Promise.all([box(left), box(right)])
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(a.y + a.height - b.y - b.height)).toBeLessThanOrEqual(1)
}

test('centers and sorts the Node catalog with aligned independently scrolling panels', async ({ desktop }, info) => {
  const { page } = desktop
  await page.setViewportSize({ width: 1440, height: 900 })
  await showWindowsNode(desktop)
  await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'NodeRail', exact: true }).click()
  const main = page.getByRole('main', { name: 'NodeRail' })
  const table = main.getByRole('table', { name: '공식 배포 버전' })
  await expect(table).toHaveAttribute('aria-busy', 'false')
  const firstVersion = table.getByRole('rowheader').first()
  await expect(firstVersion).toHaveText('22.45.0')
  await expectMatchingEdges(main.locator('.workrail-node-table'), main.getByRole('region', { name: '설치된 버전' }))
  const centering = await table.evaluate(element => {
    const headers = [...element.querySelectorAll('thead th')]
    const cells = [...element.querySelectorAll('tbody tr:first-child > *')]
    return [...headers, ...cells].map(cell => {
      const label = cell.querySelector('.workrail-sort > span:first-child') ?? cell.querySelector('button, .workrail-tag')
      const range = document.createRange()
      range.selectNodeContents(cell)
      const text = label?.getBoundingClientRect() ?? range.getBoundingClientRect()
      const bounds = cell.getBoundingClientRect()
      const style = getComputedStyle(cell)
      return { align: style.textAlign, vertical: style.verticalAlign, offset: Math.abs(text.x + text.width / 2 - bounds.x - bounds.width / 2) }
    })
  })
  expect(centering).toHaveLength(10)
  for (const cell of centering) {
    expect(cell.align).toBe('center')
    expect(cell.vertical).toBe('middle')
    expect(cell.offset).toBeLessThanOrEqual(1)
  }
  await page.screenshot({ path: info.outputPath('node-presentation.png') })

  await table.getByRole('button', { name: 'Node 버전 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.0.0')
  await expect(table.getByRole('columnheader', { name: 'Node 버전 정렬' })).toHaveAttribute('aria-sort', 'ascending')
  await table.getByRole('button', { name: 'npm 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.44.0')
  await table.getByRole('button', { name: 'npm 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.0.0')
  await main.getByRole('button', { name: '버전 더 보기' }).click()
  await expect(table.getByRole('rowheader').last()).toHaveText('22.45.0')
  await table.getByRole('button', { name: '분류 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.44.0')
  await table.getByRole('button', { name: '분류 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.45.0')
  await table.getByRole('button', { name: '상태 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.2.0')
  await table.getByRole('button', { name: '상태 정렬', exact: true }).click()
  await expect(firstVersion).toHaveText('22.45.0')

  const catalogScroll = main.locator('.workrail-node-table-scroll')
  const installed = main.getByRole('region', { name: '설치된 버전' })
  const installedHeading = installed.getByRole('heading', { name: '설치된 버전' })
  await catalogScroll.evaluate(element => { element.scrollTop = 240 })
  await expect.poll(() => catalogScroll.evaluate(element => element.scrollTop)).toBe(240)
  expect(await installed.evaluate(element => element.scrollTop)).toBe(0)
  await installed.evaluate(element => { element.scrollTop = 160 })
  await expect.poll(() => installed.evaluate(element => element.scrollTop)).toBe(160)
  expect(await catalogScroll.evaluate(element => element.scrollTop)).toBe(240)
  const headingText = await installedHeading.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element)
    const bounds = range.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom }
  })
  const installedBounds = await box(installed)
  expect(headingText.top).toBeGreaterThanOrEqual(installedBounds.y)
  expect(headingText.bottom).toBeLessThanOrEqual(installedBounds.y + installedBounds.height)
  await expectMatchingEdges(main.locator('.workrail-node-table'), installed)
  expect(await main.evaluate(element => element.scrollTop)).toBe(0)
  await page.screenshot({ path: info.outputPath('node-independent-scroll.png') })
})

test('matches Home card heights while keeping PlanRail status fit to its contents', async ({ desktop }, info) => {
  const { page } = desktop
  await page.setViewportSize({ width: 1440, height: 900 })
  await showWindowsNode(desktop)
  const main = page.getByRole('main', { name: 'Home' })
  const today = main.getByRole('region', { name: '오늘의 일정' })
  const development = main.getByRole('region', { name: '내 개발 환경' })
  const status = main.getByRole('region', { name: 'PlanRail 상태' })
  await expectMatchingEdges(today, development)
  await expect(development.getByText('40개', { exact: true })).toBeVisible()
  await expect(development.getByText('nvm-windows 사용 중', { exact: true })).toBeVisible()
  const [gridBounds, statusBounds, devBounds, buttonBounds] = await Promise.all([
    box(main.locator('.workrail-home-grid')), box(status), box(development), box(development.getByRole('button', { name: 'NodeRail 열기' })),
  ])
  expect(statusBounds.width).toBeLessThanOrEqual(380)
  expect(statusBounds.width).toBeLessThan(gridBounds.width / 2)
  expect(statusBounds.height).toBeLessThan(devBounds.height / 2)
  expect(buttonBounds.width).toBeGreaterThan(devBounds.width * .85)
  expect(Math.abs(buttonBounds.x + buttonBounds.width / 2 - devBounds.x - devBounds.width / 2)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('home-presentation.png') })

  await page.setViewportSize({ width: 600, height: 760 })
  const [narrowToday, narrowDevelopment] = await Promise.all([box(today), box(development)])
  expect(narrowDevelopment.y).toBeGreaterThanOrEqual(narrowToday.y + narrowToday.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('home-presentation-narrow.png') })
})
