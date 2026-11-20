import type { Locator } from 'playwright'
import type { TestInfo } from '@playwright/test'
import { test, expect, type Desktop } from './fixture'
import { reportedVersion } from '../../src/domain/holidays'
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
  return state
}

async function publishNode(desktop: Desktop, state: NodeManagementState) {
  // Only this disposable test application's IPC handler changes. All renderer,
  // preload, layout, and accessibility behavior remain the production code.
  await desktop.app.evaluate(({ ipcMain, BrowserWindow }, { channel, changed, state }) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, command: unknown) => {
      if (command !== 'getState' && command !== 'recheck' && command !== 'refreshCatalog') {
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
      const control = cell.querySelector('.workrail-version-status svg, .workrail-version-action [data-version-state]')
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

test('keeps release actions and status icons distinguishable in both themes', async ({ desktop }, info) => {
  const { page, app } = desktop
  const state = await showWindowsNode(desktop, {
    installedVersions: ['22.1.0', '22.2.0'],
    catalog: { status: 'ready', checkedAt: '2026-11-18T10:00:00Z', error: null,
      releases: ['22.1.0', '22.2.0', '22.3.0'].map(version => ({ version, date: '2026-11-18', lts: null, npm: null, security: false })) },
  })
  await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'NodeRail' }).click()
  const table = page.getByRole('table', { name: '공식 배포 버전' })
  const luminance = (rgb: number[]) => rgb.reduce((sum, channel, i) => {
    const value = channel / 255
    return sum + [.2126, .7152, .0722][i] * (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  }, 0)
  const measurements: object[] = []
  async function contrast(control: Locator, statusIcon: boolean) {
    const foreground = await control.evaluate(el => getComputedStyle(el).color.match(/\d+/g)!.map(Number))
    const bounds = await box(control)
    // Sample the composited background beside the icon or just inside the button's padding.
    const x = Math.floor(bounds.x + (statusIcon ? -2 : 4))
    const y = Math.floor(bounds.y + bounds.height / 2)
    const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } })
    const background = await app.evaluate(({ nativeImage }, bytes) =>
      Array.from(nativeImage.createFromBuffer(Buffer.from(bytes)).toBitmap().subarray(0, 3)).reverse(), Array.from(png))
    const [low, high] = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
    const ratio = (high + .05) / (low + .05)
    measurements.push({ label: await control.getAttribute('aria-label'), foreground, background, ratio })
    expect(ratio).toBeGreaterThanOrEqual(statusIcon ? 3 : 4.5)
    return foreground.join(',')
  }
  let revision = state.revision
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    await publishNode(desktop, { ...state, revision: ++revision })
    const colors = new Set<string>()
    for (const [status, action] of [['미설치', '22.3.0 설치'], ['설치됨', '22.1.0 사용'], ['사용 중', '22.2.0 사용 중']]) {
      colors.add(await contrast(table.getByRole('img', { name: status, exact: true }), true))
      const control = status === '사용 중' ? table.getByText('사용 중', { exact: true }) : table.getByRole('button', { name: action, exact: true })
      await contrast(control, false)
      await expect(control.locator('svg[aria-hidden="true"]')).toHaveCount(1)
      const [r, g, b] = await control.evaluate(el => getComputedStyle(el).color.match(/\d+/g)!.map(Number))
      if (status === '사용 중') {
        await expect(control).toHaveAttribute('aria-current', 'true')
        expect(await control.evaluate(el => Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700)
        expect(g).toBeGreaterThan(Math.max(r, b))
      } else if (status === '설치됨') {
        expect(b).toBeGreaterThan(Math.max(r, g))
        expect(await control.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('gradient')
      } else {
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(25)
        await expect(control).toHaveCSS('background-image', 'none')
      }
    }
    await publishNode(desktop, { ...state, checkedAt: null, revision: ++revision })
    colors.add(await contrast(table.getByRole('img', { name: '확인 불가' }).first(), true))
    await contrast(table.getByRole('button', { name: '22.3.0 다시 확인' }), false)
    expect(colors.size).toBe(4)
  }
  await info.attach('version-contrast', { body: JSON.stringify(measurements), contentType: 'application/json' })
})

test('centers and sorts the Node catalog with aligned independently scrolling panels', async ({ desktop }, info) => {
  const { page } = desktop
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await showWindowsNode(desktop)
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
  const listScroll = installed.locator('.workrail-installed-scroll')
  const headingBounds = await box(installedHeading)
  const listBounds = await box(listScroll)
  expect(listBounds.y).toBeGreaterThanOrEqual(headingBounds.y + headingBounds.height - 1)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    await catalogScroll.evaluate(element => { element.scrollTop = 0 })
    const headerColor = await installedHeading.evaluate(element => getComputedStyle(element).backgroundColor)
    expect(headerColor).toMatch(/^rgba\(.+, 0\.\d+\)$/)
    await expect(table.locator('thead')).toHaveCSS('background-color', headerColor)
    await expect(installedHeading).toHaveCSS('backdrop-filter', 'blur(12px)')
    await expect(table.locator('thead')).toHaveCSS('backdrop-filter', 'blur(12px)')
    await catalogScroll.evaluate(element => { element.scrollTop = 240 })
    await expect(table.locator('thead')).toHaveCSS('background-color', headerColor)
    await expect(table.locator('thead')).toHaveCSS('backdrop-filter', 'blur(12px)')
    for (const end of ['bottom', 'top']) {
      const scrollTop = await listScroll.evaluate((element, end) => {
        element.scrollTop = end === 'bottom' ? element.scrollHeight : 0
        return element.scrollTop
      }, end)
      if (end === 'bottom') expect(scrollTop).toBeGreaterThan(160)
      else expect(scrollTop).toBe(0)
      expect(await box(installedHeading)).toEqual(headingBounds)
      expect(await installed.evaluate(element => element.scrollTop)).toBe(0)
      expect(await catalogScroll.evaluate(element => element.scrollTop)).toBe(240)
      await expectMatchingEdges(main.locator('.workrail-node-table'), installed)
    }
  }
  expect(await main.evaluate(element => element.scrollTop)).toBe(0)
  await page.screenshot({ path: info.outputPath('node-independent-scroll.png') })
  await publishNode(desktop, { ...state, revision: state.revision + 1, installedVersions: [], activeVersion: null, activeSource: null })
  await expect(installed.getByText('설치된 버전이 없습니다.')).toBeVisible()
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    expect(await box(installedHeading)).toEqual(headingBounds)
    await expectMatchingEdges(main.locator('.workrail-node-table'), installed)
  }
})

test('preserves the calendar header and shared menu gap while retaining keyboard sorting', async ({ desktop }) => {
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
    await expect(calendar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const toolbarTop = (await box(page.locator('.toolbar'))).y
    await menu.getByRole('button', { name: 'NodeRail', exact: true }).click()
    const panelTop = (await box(page.getByRole('region', { name: '현재 사용 버전' }))).y
    expect(Math.abs(panelTop - toolbarTop)).toBeLessThanOrEqual(1)
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

test('keeps the current panel in place during a manual inspection and exposes keyboard search', async ({ desktop }) => {
  const { page } = desktop
  const windows = { id: 'windows', label: 'Windows', kind: 'windows', running: true } as const
  const state = await showWindowsNode(desktop, {
    environments: { status: 'ready', items: [windows], selectedId: windows.id, error: null },
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'NodeRail' }).click()
  const node = page.getByRole('main', { name: 'NodeRail' })
  const panel = node.getByRole('region', { name: '현재 사용 버전' })
  const heading = await box(panel.getByRole('heading'))
  const environment = await box(panel.getByText('Windows', { exact: true }))
  const manager = await box(panel.getByText('NVM 1.2.2 설치'))
  expect(environment.x).toBeGreaterThan(heading.x + heading.width)
  expect(manager.x).toBeGreaterThan(environment.x + environment.width)
  expect(Math.abs(heading.y + heading.height / 2 - environment.y - environment.height / 2)).toBeLessThanOrEqual(2)
  expect((await box(panel.getByText('22.2.0'))).y).toBeGreaterThanOrEqual(heading.y + heading.height)
  await expect(panel.locator(':scope > svg')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -3)')
  await panel.getByRole('link', { name: '최신 릴리스' }).focus()
  await page.keyboard.press('Tab')
  const recheck = panel.getByRole('button', { name: '환경 다시 검사' })
  await expect(recheck).toBeFocused()
  await page.keyboard.press('Tab')
  const search = node.getByRole('searchbox', { name: '버전 검색' })
  await expect(search).toBeFocused()
  await expect(search.locator('..')).toHaveCSS('outline-style', 'solid')
  await page.setViewportSize({ width: 380, height: 750 })
  await panel.scrollIntoViewIfNeeded()
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const panelBounds = await box(panel)
  await desktop.app.evaluate(({ ipcMain }, { channel, state }) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, command) => {
      if (command === 'recheck') await new Promise<void>(resolve => ipcMain.once('presentation-finish-recheck', () => resolve()))
      return { ok: true, data: state }
    })
  }, { channel: nodeManagementChannel, state })
  await recheck.click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await expect(node.getByRole('table')).toHaveAttribute('aria-busy', 'false')
  const progress = panel.locator('.workrail-panel-progress')
  await expect(progress).toHaveCSS('height', '2px')
  expect(await box(panel)).toEqual(panelBounds)
  const track = await box(progress)
  expect(track.y - panelBounds.y).toBe(1)
  expect(await progress.evaluate(element => getComputedStyle(element, '::before').animationDuration)).toBe('1.1s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await progress.evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('none')
  await desktop.app.evaluate(({ ipcMain }) => { ipcMain.emit('presentation-finish-recheck') })
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  expect(await box(panel)).toEqual(panelBounds)
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

async function expectFooterMembers(footer: Locator, info: TestInfo, visible: number, total: number, targetWidth?: number) {
  const page = footer.page()
  const area = footer.locator('.planrail-members')
  const overflow = footer.getByRole('button')
  let layout
  try {
    if (targetWidth !== undefined) {
      // Resize the real viewport around the space taken by this platform's labels.
      const inset = await area.evaluate(element => innerWidth - element.getBoundingClientRect().width)
      await page.setViewportSize({ width: Math.round(targetWidth + inset), height: 750 })
      expect(Math.abs((await box(area)).width - targetWidth)).toBeLessThan(40)
    }
    await expect(footer.getByRole('listitem')).toHaveCount(visible)
    if (visible === total) await expect(overflow).toHaveCount(0)
    else await expect(footer.getByRole('button', { name: `외 ${total - visible}명`, exact: true })).toBeVisible()
    await expect(footer.getByTestId('notification-policy')).toBeVisible()
  } finally {
    layout = await footer.evaluate(element => {
      const bounds = (selector: string) => {
        const rect = element.querySelector(selector)?.getBoundingClientRect()
        return rect ? { left: rect.left, right: rect.right, width: rect.width } : null
      }
      return {
        viewport: innerWidth, area: bounds('.planrail-members'), visible: element.querySelectorAll('li').length,
        overflow: element.querySelector('.workrail-member-more')?.textContent ?? null,
        badge: bounds('.sharing-badge'), connection: bounds('.planrail-connection'), version: bounds('.workrail-member-version'),
        button: bounds('.workrail-member-more'), policy: bounds('.planrail-policy'),
      }
    })
    await info.attach('footer-layout-' + visible, {
      body: JSON.stringify({ targetWidth, expectedVisible: visible, total, ...layout }), contentType: 'application/json',
    })
  }
  expect(layout.badge!.right).toBeLessThanOrEqual(layout.connection!.left)
  expect(layout.connection!.right).toBeLessThanOrEqual(layout.area!.left)
  expect(layout.area!.right).toBeLessThanOrEqual(layout.policy!.left)
  if (layout.button) expect(layout.button.right).toBeLessThanOrEqual(layout.policy!.left)
  expect(layout.policy!.right).toBeLessThanOrEqual(layout.viewport)
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
    installedVersions: ['24.22.3', '24.22.2', '24.22.1', '22.16.0', '20.19.0', '18.20.1'] })
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
  const extra = ['수현', '예린', '유진'].map((name, index) => ({
    id: 'extra-' + index, name, ip: '192.168.0.' + (40 + index), approved: true, revoked: false,
  }))
  await publishSharing(desktop, { ...host, snapshotRevision: 189, devices: [...devices, ...extra],
    memberPresence: { ...host.memberPresence, ...Object.fromEntries(extra.map(device => [device.id, { connected: true, lastSeenAt: lastCheckedAt }])) },
    deviceVersions: Object.fromEntries([...devices, ...extra].map(device => [device.id, { version: '1.0.0', checkedAt: lastCheckedAt }])) })
  await expect(main.getByRole('region', { name: '오늘의 일정' }).getByText('공유', { exact: true })).toHaveClass('sharing-badge')
  await expect(status.getByText('공유 제공 중')).toBeVisible()
  await expect(status.getByRole('button', { name: '외 1명' })).toBeVisible()
  const widget = main.getByRole('region', { name: 'Node 작업' })
  await expect(status.getByRole('listitem')).toHaveCount(5)
  await expect(widget.getByRole('listitem')).toHaveCount(5)
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
  await main.screenshot({ path: info.outputPath('home-widgets-help.png') })
  const people = status.getByRole('button', { name: '외 1명' })
  await people.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '연결된 참여자' }).getByRole('listitem')).toHaveCount(6)
  await page.keyboard.press('Escape')
  await expect(people).toBeFocused()
  await widget.getByRole('button', { name: '외 1개' }).click()
  const versions = page.getByRole('region', { name: '설치된 버전' })
  await expect(versions.getByRole('heading')).toBeFocused()
  await expect(versions.getByRole('heading')).toBeInViewport()
  await expect(versions.getByRole('listitem')).toHaveCount(6)
  await publishSharing(desktop, host)
  await other.click()
  const footer = page.getByRole('contentinfo', { name: 'PlanRail 상태' })
  await expectFooterMembers(footer, info, 3, 3)
  await expect(footer.getByText('민수의 이름이 긴 사무실 PC')).toBeVisible()
  await page.screenshot({ path: info.outputPath('compact-planrail-host-dark.png') })

  // One member fits between 235 and 420 CSS pixels of allocated member space.
  await expectFooterMembers(footer, info, 1, 3, 325)
  const longVersion = '1.0.0-' + 'W'.repeat(58)
  expect(reportedVersion(longVersion)).toBe(longVersion)
  await publishSharing(desktop, { ...host, snapshotRevision: 191, deviceVersions: { '0': { version: longVersion, checkedAt: lastCheckedAt } } })
  const footerVersion = footer.locator('.workrail-member-version').filter({ hasText: longVersion })
  await expect(footerVersion).toBeVisible()
  const [versionBounds, expansionBounds, policyBounds] = await Promise.all([
    box(footerVersion), box(footer.getByRole('button', { name: '외 2명' })), box(footer.getByTestId('notification-policy')),
  ])
  await info.attach('long-version-footer-bounds', { body: JSON.stringify({ versionBounds, expansionBounds, policyBounds }), contentType: 'application/json' })
  expect(versionBounds.x + versionBounds.width).toBeLessThanOrEqual(expansionBounds.x)
  expect(expansionBounds.x + expansionBounds.width).toBeLessThanOrEqual(policyBounds.x)
  expect(policyBounds.x + policyBounds.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  await footerVersion.focus()
  await expect(page.getByRole('tooltip')).toHaveText('버전 ' + longVersion)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: info.outputPath('long-version-footer.png') })
  await expectFooterMembers(footer, info, 0, 3, 155)
  const allMembers = footer.getByRole('button', { name: '외 3명' })
  await allMembers.focus()
  await page.keyboard.press('Enter')
  const members = page.getByRole('dialog', { name: '연결된 참여자' })
  await expect(members.getByRole('listitem')).toHaveCount(3)
  for (const { name } of devices.slice(0, 3)) await expect(members.getByText(name, { exact: true })).toBeVisible()
  await expect(members.getByText('버전 ' + longVersion, { exact: true })).toBeVisible()
  expect(await members.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('compact-footer-narrow.png') })
  await page.keyboard.press('Escape')
  await expect(allMembers).toBeFocused()
  await active.click()

  // The app currently defaults to dark. Set the theme attribute in this temporary-profile renderer to check Forest Crystal tokens.
  await page.evaluate(() => { delete document.documentElement.dataset.theme })
  await publishSharing(desktop, { ...host, snapshotRevision: 192, role: 'member', devices: [], memberPresence: undefined, deviceVersions: undefined })
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

test('covers the Node widget without moving its previous rows and keeps focus and scrolling outside them', async ({ desktop }) => {
  const { page } = desktop
  await page.setViewportSize({ width: 660, height: 720 })
  await showWindowsNode(desktop)
  const widget = page.getByRole('region', { name: 'Node 작업' })
  const list = widget.locator('.workrail-widget-versions')
  await widget.scrollIntoViewIfNeeded()
  const [widgetBefore, listBefore] = await Promise.all([box(widget), box(list)])
  const current = await page.evaluate(() => window.workrailNodeManagement!.getState())
  if (!current.ok) throw Error('Missing fixture state')
  await publishNode(desktop, { ...current.data, revision: current.data.revision + 1, installedVersions: [], activeVersion: null,
    busy: { kind: 'install', version: '24.22.2', phase: 'compiling', cancellable: true },
    operationLog: Array.from({ length: 40 }, (_, i) => '빌드 단계 ' + i),
  })
  const status = widget.getByRole('status')
  await expect(status).toContainText('소스 컴파일 중')
  expect(await box(widget)).toEqual(widgetBefore)
  expect(await box(list)).toEqual(listBefore)
  const underlayButton = list.getByText('사용', { exact: true }).first()
  await underlayButton.evaluate(button => button.focus())
  await expect(underlayButton).not.toBeFocused()
  const overlay = widget.locator('.workrail-node-overlay')
  const bounds = await box(overlay)
  expect(Math.abs(bounds.y - widgetBefore.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(bounds.x - widgetBefore.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(bounds.height - widgetBefore.height)).toBeLessThanOrEqual(2)
  expect(Math.abs(bounds.width - widgetBefore.width)).toBeLessThanOrEqual(2)
  await widget.getByRole('button', { name: '작업 로그 보기' }).click()
  const log = overlay.locator('pre')
  await log.evaluate(element => { element.scrollTop = element.scrollHeight })
  expect(await log.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await box(widget)).toEqual(widgetBefore)
  const dock = page.getByRole('navigation', { name: 'WorkRail 도구' })
  await dock.getByRole('button', { name: 'PlanRail' }).click()
  await dock.getByRole('button', { name: 'Home' }).click()
  await expect(widget.getByRole('status')).toContainText('소스 컴파일 중')
  await expect(list.locator('li')).toHaveCount(5)
})

test('keeps both lists in place during a switch and returns focus to the list when the version becomes active', async ({ desktop }, info) => {
  const { page } = desktop
  await page.setViewportSize({ width: 1024, height: 720 })
  const state = await showWindowsNode(desktop)
  const menu = page.getByRole('navigation', { name: 'WorkRail 도구' })
  await menu.getByRole('button', { name: 'NodeRail' }).click()
  const main = page.getByRole('main', { name: 'NodeRail' })
  const grid = main.locator('.workrail-node-grid')
  const installed = grid.locator('.workrail-installed-scroll')
  const catalog = grid.locator('.workrail-node-table-scroll')
  const version = '22.19.0'
  const trigger = installed.getByRole('button', { name: version + ' 사용', exact: true })
  await trigger.focus()
  await catalog.evaluate(element => { element.scrollTop = 110 })
  const offsets = () => Promise.all([catalog, installed].map(list => list.evaluate(element => element.scrollTop)))
  const before = await offsets()
  expect(before.every(top => top > 0)).toBe(true)
  const bounds = await box(grid)
  await publishNode(desktop, { ...state, revision: 1001, installedVersions: [], activeVersion: null,
    busy: { kind: 'use', version, phase: 'waiting', cancellable: false } })
  const overlay = main.locator('.workrail-node-overlay')
  await expect(overlay.getByRole('status')).toContainText('Windows 권한 확인')
  await expect(overlay).toBeFocused()
  await expect(grid).toHaveAttribute('inert', '')
  expect(await offsets()).toEqual(before)
  expect(await box(overlay)).toEqual(bounds)
  const card = main.getByRole('region', { name: '현재 사용 버전' })
  const current = await box(card)
  expect(current.y + current.height).toBeLessThanOrEqual(bounds.y)
  await page.screenshot({ path: info.outputPath('noderail-use-overlay.png') })
  await publishNode(desktop, { ...state, revision: 1002, activeVersion: version })
  await expect(overlay).toHaveCount(0)
  await expect(grid.getByRole('heading', { name: '설치된 버전' })).toBeFocused()
  expect(await offsets()).toEqual(before)
})

test('copies the Windows install history without diagnostic screen paths', async ({ desktop }, info) => {
  const history = [
    '2026-11-19T01:02:03Z · install · 24.0.0 · nvm 1.x · zip-permission · 대상 폴더 · 최종 이동 · EPERM',
    '2026-11-19T01:05:00Z · install · 24.0.0 · nvm 1.x · 성공',
  ]
  const state = await showWindowsNode(desktop, { operationLog: history,
    manager: { status: 'ready', version: '1.2.2', path: 'C:\\Users\\example\\nvm\\nvm.exe' } })
  await desktop.page.getByRole('navigation', { name: 'WorkRail 도구' }).getByRole('button', { name: 'NodeRail', exact: true }).click()
  const node = desktop.page.getByRole('main', { name: 'NodeRail' })
  await node.getByRole('button', { name: '작업 로그 보기' }).click()
  await node.getByRole('button', { name: '진단 복사' }).click()
  await expect(node.getByText('진단 이력을 복사했습니다.')).toBeVisible()
  const readCopy = () => desktop.app.evaluate(async ({ clipboard }) => ({ text: await clipboard.readText(), html: await clipboard.has('text/html') }))
  const copied = await readCopy()
  expect(copied.text.replaceAll('\r\n', '\n')).toBe(history.join('\n'))
  expect(copied.html).toBe(false)

  await desktop.page.evaluate(() => { document.execCommand = () => false })
  await desktop.app.evaluate(({ clipboard }) => clipboard.writeText('manual-copy-test'))
  await node.getByRole('button', { name: '진단 복사' }).click()
  await expect(node.getByText('선택된 이력을 Ctrl+C로 복사해 주세요.')).toBeVisible()
  await desktop.page.keyboard.press('Control+c')
  await expect.poll(readCopy).toEqual(copied)

  const error = { code: 'zip-permission', message: 'nvm 버전 폴더의 쓰기 권한을 확인해 주세요.' } as const
  await publishNode(desktop, { ...state, revision: state.revision + 1, error, operationResult: { id: 'retry', error },
    operationLog: [...history, '2026-11-20T01:10:00Z · install · 24.1.0 · nvm 1.x · zip-permission · 대상 폴더 · 최종 이동 · EPERM'] })
  const panel = node.getByRole('region', { name: '작업 로그' })
  await expect(panel.getByRole('alert')).toHaveText(error.message)
  await panel.screenshot({ path: info.outputPath('node-log-help.png') })
})
