import type { Locator } from 'playwright'
import type { TestInfo } from '@playwright/test'
import { test, expect, type Desktop } from './fixture'
import { channels } from '../../src/shared/api'
import { sharingChannel, sharingChanged, type SharingState } from '../../src/shared/sharing'
import { nodeManagementChannel, nodeManagementChanged, type NodeManagementState } from '../../src/shared/node-management'

test.use({ initialTool: 'home', seed: 'hotfix' })

async function showWindowsNode(desktop: Desktop, patch: Partial<NodeManagementState> = {}) {
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
    ...patch,
  }
  await publishNode(desktop, state)
  await expect(desktop.page.getByRole('region', { name: '내 개발 환경' }).getByText(state.activeVersion!, { exact: true })).toBeVisible()
}

async function publishNode(desktop: Desktop, state: NodeManagementState) {
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

async function expectCenteredColumns(table: Locator, info: TestInfo, attachment: string) {
  const centering = await table.evaluate(element => {
    const headers = [...element.querySelectorAll('thead th')]
    const cells = [...element.querySelectorAll('tbody tr:first-child > *')]
    const measurements = [...headers, ...cells].map(cell => {
      const textNode = cell.querySelector('.workrail-sort > span:first-child, .workrail-tag') ?? cell
      const control = cell.querySelector('.workrail-version-status svg, .workrail-version-action button')
      const range = document.createRange()
      range.selectNodeContents(textNode)
      const content = control?.getBoundingClientRect() ?? range.getBoundingClientRect()
      const bounds = cell.getBoundingClientRect()
      const style = getComputedStyle(cell)
      const contentCenter = content.x + content.width / 2
      const cellCenter = bounds.x + bounds.width / 2
      return { text: textNode.textContent, align: style.textAlign, vertical: style.verticalAlign, contentCenter, cellCenter }
    })
    return { headers: measurements.slice(0, headers.length), row: measurements.slice(headers.length) }
  })
  expect(centering.headers).toHaveLength(5)
  expect(centering.row).toHaveLength(5)
  for (const [index, header] of centering.headers.entries()) {
    const cell = centering.row[index]
    for (const measurement of [header, cell]) {
      expect(measurement.align).toBe('center')
      expect(measurement.vertical).toBe('middle')
      expect(Math.abs(measurement.contentCenter - measurement.cellCenter), measurement.text ?? undefined).toBeLessThanOrEqual(1)
    }
    expect(Math.abs(header.contentCenter - cell.contentCenter), header.text ?? undefined).toBeLessThanOrEqual(1)
  }
  await info.attach(attachment, { body: JSON.stringify(centering, null, 2), contentType: 'application/json' })
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
  await expectCenteredColumns(table, info, 'column-centers-dark')
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
  await expect(table.locator('thead')).toHaveCSS('backdrop-filter', 'blur(12px)')
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

test('matches the calendar header material and menu gap while retaining keyboard sorting', async ({ desktop }) => {
  const { page } = desktop
  await showWindowsNode(desktop)
  const menu = page.getByRole('navigation', { name: 'WorkRail 도구' })
  const table = page.getByRole('table', { name: '공식 배포 버전' })
  for (const width of [1440, 800, 600]) {
    await page.setViewportSize({ width, height: 900 })
    await menu.getByRole('button', { name: 'PlanRail', exact: true }).click()
    await page.getByRole('button', { name: '달력', exact: true }).click()
    const calendar = page.locator('.calendar-top')
    await expect(calendar).toBeVisible()
    const calendarStyle = await calendar.evaluate(element => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, blur: style.backdropFilter }
    })
    const toolbarTop = (await box(page.locator('.toolbar'))).y
    await menu.getByRole('button', { name: 'NodeRail', exact: true }).click()
    const panelTop = (await box(page.getByRole('region', { name: '현재 사용 버전' }))).y
    expect(Math.abs(panelTop - toolbarTop)).toBeLessThanOrEqual(1)
    await expect(table.locator('thead')).toHaveCSS('background-color', calendarStyle.background)
    await expect(table.locator('thead')).toHaveCSS('backdrop-filter', calendarStyle.blur)
  }
  const sort = table.getByRole('button', { name: 'Node 버전 정렬' })
  const restingStyle = await sort.evaluate(element => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, filter: style.filter, shadow: style.boxShadow }
  })
  await sort.hover()
  await sort.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
  await expect(sort).toHaveCSS('background-color', restingStyle.background)
  await expect(sort).toHaveCSS('filter', restingStyle.filter)
  await expect(sort).toHaveCSS('box-shadow', restingStyle.shadow)
  await table.getByRole('button', { name: '분류 정렬' }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(sort).toBeFocused()
  await expect(sort).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(table.getByRole('columnheader', { name: 'Node 버전 정렬' })).toHaveAttribute('aria-sort', 'ascending')
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
  await expect(development.getByText('NVM 1.2.2 설치', { exact: true })).toBeVisible()
  const [gridBounds, statusBounds, devBounds, buttonBounds] = await Promise.all([
    box(main.locator('.workrail-home-grid')), box(status), box(development), box(development.getByRole('button', { name: 'NodeRail 열기' })),
  ])
  expect(statusBounds.width).toBeLessThanOrEqual(400)
  expect(statusBounds.width).toBeLessThan(gridBounds.width / 2)
  expect(statusBounds.height).toBeLessThan(devBounds.height)
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

async function publishSharing(desktop: Desktop, state: SharingState) {
  await desktop.app.evaluate(({ ipcMain, BrowserWindow }, { channel, changed, state }) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, command: unknown) => command === 'getState'
      ? { ok: true, data: state }
      : { ok: false, error: { code: 'FORBIDDEN', message: 'Presentation fixture permits reads only.' } })
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(changed, state)
  }, { channel: sharingChannel, changed: sharingChanged, state })
}

test('keeps the compact dashboard and real status controls legible in dark, light, and narrow windows', async ({ desktop }, info) => {
  const page = desktop.page
  const menu = page.getByRole('navigation', { name: 'WorkRail 도구' })
  const main = page.getByRole('main', { name: 'Home' })
  const status = main.getByRole('region', { name: 'PlanRail 상태' })
  const lastCheckedAt = '2026-11-18T10:00:00Z'
  const devices = ['민수의 이름이 긴 사무실 PC', '지연', '서준', '오프라인', '연결 대기'].map((name, index) => ({
    id: String(index), name, ip: '192.168.0.' + (index + 30), revoked: false, approved: index < 4,
  }))
  const host: SharingState = {
    snapshotRevision: 190, role: 'host', roleHistory: null, address: '192.168.0.21', port: 47831,
    hostingEnabled: true, status: 'connected', message: '', cleanupPending: false, lastCheckedAt,
    pendingPair: null, pendingPairs: [], settingsRequestToken: null, availableAddresses: ['192.168.0.21'],
    devices, projects: [], memberPresence: Object.fromEntries(devices.map(device => [device.id, { connected: Number(device.id) < 3, lastSeenAt: lastCheckedAt }])),
    deviceVersions: { '0': { version: '0.8.8', checkedAt: lastCheckedAt } },
  }
  const windows = { id: 'windows', label: 'Windows', kind: 'windows', running: true } as const
  const ubuntu = { id: 'wsl:12345678-1234-1234-1234-123456789abc', label: 'Ubuntu', kind: 'wsl2', running: true, user: 'daeyong' } as const
  await page.setViewportSize({ width: 1280, height: 900 })
  await showWindowsNode(desktop, { environments: { status: 'ready', items: [windows, ubuntu], selectedId: windows.id, error: null },
    manager: { kind: 'nvm-windows', version: '1.1.11', status: 'ready' }, activeVersion: '24.22.3',
    installedVersions: ['24.22.3', '22.16.0', '20.19.0', '18.20.1'] })
  const day = await main.locator('.workrail-page-heading time').getAttribute('datetime')
  const snapshot = await page.evaluate(() => window.simpleTimeline.getSnapshot())
  if (!snapshot.ok || !day) throw Error('Timeline presentation fixture unavailable')
  const today = { ...snapshot.data,
    projects: snapshot.data.projects.map((project, index) => index === 0 ? { ...project, sharing: 'host' as const } : project),
    schedules: snapshot.data.schedules.map((schedule, index) => index === 0 ? { ...schedule, startDate: day, endDate: day, sharing: 'host' as const } : schedule),
  }
  await desktop.app.evaluate(({ ipcMain }, { channel, today }) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, () => ({ ok: true, data: today }))
  }, { channel: channels.getSnapshot, today })
  await publishSharing(desktop, host)
  await expect(main.getByRole('region', { name: '오늘의 일정' }).getByText('공유', { exact: true })).toHaveClass('sharing-badge')
  await expect(status.getByText('공유 제공 중')).toBeVisible()
  await expect(status.getByRole('button', { name: '외 1명' })).toBeVisible()
  await expect(main.getByRole('region', { name: 'Node 작업' }).getByRole('listitem')).toHaveCount(3)
  const frame = await main.evaluate(element => {
    const css = getComputedStyle(element)
    return [css.paddingBlockStart, css.paddingInlineEnd, css.paddingBlockEnd, css.paddingInlineStart]
  })
  expect(frame).toEqual(['14px', '14px', '14px', '14px'])
  const other = menu.getByRole('button', { name: 'PlanRail' })
  await expect(other).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(other).toHaveCSS('box-shadow', 'none')
  const active = menu.getByRole('button', { name: 'Home' })
  const cta = main.getByRole('button', { name: 'NodeRail 열기' })
  await expect(cta).toHaveCSS('background-image', await active.evaluate(element => getComputedStyle(element).backgroundImage))
  await expect(cta).toHaveCSS('border-color', await active.evaluate(element => getComputedStyle(element).borderColor))
  const number = main.getByRole('region', { name: '내 개발 환경' }).getByText('24.22.3')
  await expect(number).toHaveCSS('font-family', await main.evaluate(element => getComputedStyle(element).fontFamily))
  expect((await box(main.getByRole('region', { name: 'Node 작업' }))).width).toBeLessThanOrEqual(360)
  await page.screenshot({ path: info.outputPath('compact-home-host-dark.png') })
  await other.click()
  const footer = page.getByRole('contentinfo', { name: 'PlanRail 상태' })
  await expect(footer.getByRole('listitem')).toHaveCount(3)
  await expect(footer.getByText('민수의 이름이 긴 사무실 PC')).toBeVisible()
  await page.screenshot({ path: info.outputPath('compact-planrail-host-dark.png') })

  await page.setViewportSize({ width: 500, height: 750 })
  await expect(footer.getByRole('button', { name: '외 2명' })).toBeVisible()
  await expect(footer.getByRole('listitem')).toHaveCount(1)
  await page.setViewportSize({ width: 430, height: 750 })
  await expect(footer.getByRole('button', { name: '외 3명' })).toBeVisible()
  await expect(footer.getByTestId('notification-policy')).toBeVisible()
  const allMembers = footer.getByRole('button', { name: '외 3명' })
  await allMembers.click()
  await expect(page.getByRole('dialog', { name: '연결된 참여자' }).getByText('민수의 이름이 긴 사무실 PC')).toBeVisible()
  await page.screenshot({ path: info.outputPath('compact-footer-narrow.png') })
  await page.keyboard.press('Escape')
  await expect(allMembers).toBeFocused()
  await active.click()

  // The app currently defaults to dark. Set the theme attribute in this temporary-profile renderer to check Forest Crystal tokens.
  await page.evaluate(() => { delete document.documentElement.dataset.theme })
  await publishSharing(desktop, { ...host, snapshotRevision: 191, role: 'member', devices: [], memberPresence: undefined, deviceVersions: undefined })
  await showWindowsNode(desktop, { revision: 1001, environments: { status: 'ready', items: [windows, ubuntu], selectedId: ubuntu.id, error: null },
    manager: { kind: 'nodenv', status: 'ready', version: '1.5.0' }, activeSource: 'nodenv', activeVersion: '24.22.3',
    installedVersions: ['24.22.3', '22.16.0', '20.19.0'],
    catalog: { status: 'ready', checkedAt: lastCheckedAt, error: null, releases: [
      { version: '25.2.0', date: day, lts: null, npm: '11.5.0', security: false, installReason: '이 환경의 node-build 설치 정의가 없습니다.' },
      { version: '24.22.3', date: day, lts: 'Krypton', npm: '11.4.0', security: true },
      { version: '22.16.0', date: day, lts: 'Jod', npm: '10.9.0', security: true },
      { version: '20.19.1', date: day, lts: null, ltsKnown: false, sourceOnly: true, npm: null, security: false },
    ] },
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(status.getByText('호스트 앱 버전')).toBeVisible()
  await expect(status.getByText('확인 불가', { exact: true })).toBeVisible()
  await expect(main.getByText('Ubuntu · daeyong · 기본 Node')).toBeVisible()
  await page.screenshot({ path: info.outputPath('compact-home-member-light.png') })
  await page.setViewportSize({ width: 500, height: 740 })
  expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('compact-home-member-narrow.png') })
  await main.getByRole('region', { name: 'Node 작업' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('compact-home-member-narrow-widgets.png') })

  await menu.getByRole('button', { name: 'NodeRail' }).click()
  const node = page.getByRole('main', { name: 'NodeRail' })
  await expect(node.getByRole('region', { name: '기본 버전' }).getByText('nodenv 1.5.0 설치')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(node.getByRole('button', { name: '25.2.0 설치' })).toBeDisabled()
  await expect(node.getByText('이 환경의 node-build 설치 정의가 없습니다.')).toBeVisible()
  await expect(node.getByText('소스 컴파일')).toBeVisible()
  await expectMatchingEdges(node.locator('.workrail-node-table'), node.getByRole('region', { name: '설치된 버전' }))
  await expectCenteredColumns(node.getByRole('table', { name: '공식 배포 버전' }), info, 'column-centers-light')
  await page.screenshot({ path: info.outputPath('compact-node-wsl-light.png') })
  await node.getByRole('button', { name: '환경 변경' }).click()
  await expect(page.getByRole('dialog', { name: '관리 환경 선택' }).getByRole('button', { name: /Ubuntu/ })).toHaveAttribute('aria-current', 'true')
  await page.screenshot({ path: info.outputPath('compact-node-environment-picker.png') })
  await page.keyboard.press('Escape')
  await publishNode(desktop, {
    revision: 1002, platform: 'win32', supported: true,
    environments: { status: 'ready', items: [windows, { ...ubuntu, user: undefined, running: false }], selectedId: ubuntu.id, error: null },
    manager: { status: 'checking', version: null }, activeSource: null, activeVersion: null, installedVersions: [],
    catalog: { status: 'idle', checkedAt: null, error: null, releases: [] }, checkedAt: null, conflicts: [], busy: null, error: null,
  })
  await expect(node.getByRole('button', { name: '환경 시작' })).toBeEnabled()
  await expect(node.getByText('Ubuntu · 기본 사용자 확인 전 · 종료됨')).toBeVisible()
  await expect(node.getByRole('table')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('compact-node-wsl-stopped.png') })
})
