import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/App'
import type { NodeManagementApi, NodeManagementResult, NodeManagementState } from '../../src/shared/node-management'
import type { ChangeNotificationState } from '../../src/shared/sharing'
import { hotfix, project, schedule } from '../fixtures/timeline'
import { memoryApi } from './fake-api'
import { sharingFixture } from './sharing-fixture'

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true })
})
afterEach(() => {
  delete window.workrailNodeManagement
  vi.useRealTimers()
})

const nodeState: NodeManagementState = {
  revision: 1, platform: 'win32', supported: true,
  manager: { status: 'ready', version: '1.2.2' },
  installedVersions: ['24.11.0', '22.20.0'], activeVersion: '24.11.0', activeSource: 'nvm',
  catalog: {
    status: 'ready', checkedAt: '2026-11-18T10:00:00Z', error: null,
    releases: [
      { version: '25.2.0', date: '2026-11-15', lts: null, npm: '11.6.2', security: false },
      { version: '24.11.0', date: '2026-11-14', lts: 'Krypton', npm: '11.6.1', security: true },
    ],
  },
  checkedAt: '2026-11-18T10:00:00Z', conflicts: [], busy: null, error: null,
}
function nodeFixture(initial: Partial<NodeManagementState> = {}) {
  let state = { ...nodeState, ...initial }
  let listener: ((value: NodeManagementState) => void) | undefined
  const getState = async (): Promise<NodeManagementResult> => ({ ok: true, data: state })
  const dispose = vi.fn(() => { listener = undefined })
  const api = {
    selectEnvironment: vi.fn((_id: string) => getState()), startEnvironment: vi.fn(getState), cancelOperation: vi.fn(getState),
    getState: vi.fn(getState), refreshCatalog: vi.fn(getState),
    install: vi.fn(getState), use: vi.fn(getState), installManager: vi.fn(getState), removeStandalone: vi.fn(getState), openMaintenance: vi.fn(getState),
    onChange: (callback: (value: NodeManagementState) => void) => {
      listener = callback
      return dispose
    },
  } satisfies NodeManagementApi
  window.workrailNodeManagement = api
  return { api, dispose, emit(patch: Partial<NodeManagementState>) {
    state = { ...state, ...patch, revision: state.revision + 1 }
    listener?.(state)
  } }
}
function dock(name: 'Home' | 'PlanRail' | 'NodeRail') {
  return within(screen.getByRole('navigation', { name: 'WorkRail 도구' })).getByRole('button', { name })
}
const home = () => screen.getByRole('main', { name: 'Home' })
const node = () => screen.getByRole('main', { name: 'NodeRail' })
const installed = () => within(node()).getByRole('region', { name: '설치된 버전' })

it('opens the dashboard with inclusive, ordered schedules independent of the Planrail filter', async () => {
  nodeFixture()
  sharingFixture({ role: 'member', status: 'disconnected', lastCheckedAt: '2026-11-17T10:00:00Z' })
  const m = memoryApi({
    projects: [project(), { ...project('2', '공유 프로젝트'), sharing: 'member' }],
    schedules: [
      { ...schedule('1', '1', '2026-11-18', '2026-11-18'), name: '시작일 일정' },
      { ...schedule('2', '2', '2026-11-12', '2026-11-18'), name: '종료일 일정', sharing: 'member' },
      { ...schedule('3', '1', '2026-11-17', '2026-11-19'), name: '진행 중 일정' },
      { ...schedule('4', '1', '2026-11-17', '2026-11-17'), name: '지난 일정' },
      { ...schedule('5', '1', '2026-11-19', '2026-11-19'), name: '내일 일정' },
    ],
  })
  render(<App initialTool="home" today={new Date(2026, 10, 18)} api={m.api} />)
  expect(dock('Home')).toHaveAttribute('aria-current', 'page')
  expect(await within(within(home()).getByRole('region', { name: '내 개발 환경' })).findByText('24.11.0')).toBeVisible()
  const rows = within(within(home()).getByRole('list', { name: '오늘의 일정' })).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('종료일 일정')
  expect(rows[0]).toHaveTextContent('공유')
  expect(rows[1]).toHaveTextContent('진행 중 일정')
  expect(rows[2]).toHaveTextContent('시작일 일정')
  expect(within(home()).getByText(/마지막.*공유/)).toBeVisible()
  fireEvent.click(dock('PlanRail'))
  fireEvent.click(screen.getByRole('button', { name: '개인' }))
  fireEvent.click(dock('Home'))
  expect(within(home()).getByText('종료일 일정')).toBeVisible()
  fireEvent.click(within(home()).getByRole('button', { name: 'PlanRail에서 전체 일정 보기' }))
  expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
})

it('refreshes the local dashboard date at midnight', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 59))
  const m = memoryApi({ projects: [project()], schedules: [
    { ...schedule('1', '1', '2026-11-18', '2026-11-18'), name: '수요일 일정' },
    { ...schedule('2', '1', '2026-11-19', '2026-11-19'), name: '목요일 일정' },
  ] })
  render(<App initialTool="home" api={m.api} />)
  await act(async () => {})
  expect(within(home()).getByText('수요일 일정')).toBeVisible()
  act(() => { vi.advanceTimersByTime(1001) })
  expect(within(home()).getByText('목요일 일정')).toBeVisible()
  expect(within(home()).queryByText('수요일 일정')).toBeNull()
})

it('loads Node state at startup, checks the catalog on Node entry, and installs only a missing manager', async () => {
  const fixture = nodeFixture({ manager: { status: 'missing', version: null }, installedVersions: [], activeVersion: null, activeSource: null })
  fixture.api.installManager.mockResolvedValue({ ok: true, data: { ...nodeState, revision: 2 } })
  render(<App initialTool="home" api={memoryApi().api} />)
  expect(await within(home()).findByText('nvm-windows 설치 필요')).toBeVisible()
  expect(fixture.api.refreshCatalog).not.toHaveBeenCalled()
  fireEvent.click(dock('NodeRail'))
  await waitFor(() => expect(fixture.api.refreshCatalog).toHaveBeenCalledTimes(1))
  fireEvent.click(within(node()).getByRole('button', { name: 'nvm-windows 설치' }))
  expect(await within(node()).findByText('NVM 1.2.2 설치')).toBeVisible()
  expect(fixture.api.installManager).toHaveBeenCalledTimes(1)
})

it('shows the Windows x64 scope before interpreting missing manager state', async () => {
  nodeFixture({ supported: false, platform: 'linux', manager: { status: 'missing', version: null }, activeVersion: null, activeSource: null, installedVersions: [], checkedAt: null })
  render(<App initialTool="node" api={memoryApi().api} />)
  expect(await within(node()).findByText(/Windows x64에서 사용할 수 있습니다/)).toBeVisible()
  expect(within(node()).queryByRole('button', { name: /설치|사용/ })).toBeNull()
})

it('shows an incompatible manager with its conflict path and official inspection instructions', async () => {
  const path = 'C:\\nvm\\nvm.exe'
  nodeFixture({ manager: { status: 'error', version: '1.1.12' }, conflicts: [
    { code: 'manager-configuration', path, message: '호환되지 않는 nvm-windows입니다.' },
  ] })
  render(<App initialTool="node" api={memoryApi().api} />)
  const detail = (await within(node()).findByText('자세히')).closest('details')!
  expect(detail).not.toHaveAttribute('open')
  fireEvent.click(within(node()).getByText('자세히'))
  expect(within(node()).getByText(path)).toBeVisible()
  expect(within(node()).getByText('호환되지 않는 nvm-windows입니다.')).toBeVisible()
  expect(within(node()).getByText(/공식 nvm-windows 설치 안내/)).toBeVisible()
  expect(within(node()).queryByRole('button', { name: 'nvm-windows 설치' })).toBeNull()
  expect(within(installed()).getByRole('button', { name: '22.20.0 다시 확인' })).toBeEnabled()
})

it('summarizes a standalone conflict, keeps diagnostics folded, and enables installation only after clearance', async () => {
  const path = 'C:\\Program Files\\nodejs\\node.exe'
  const fixture = nodeFixture({ manager: { status: 'missing', version: null }, activeSource: 'standalone',
    conflicts: [{ code: 'standalone-node', path, message: '기존 Node 설치가 PATH에 있습니다.' }],
    removal: { status: 'manual', target: null, confirmationId: null, reason: '공식 MSI 설치 여부를 확인하지 못했습니다.', rebootRequired: false, msiExitCode: null },
  })
  render(<App initialTool="node" api={memoryApi().api} />)
  const guidance = await within(node()).findByRole('region', { name: 'Node 환경 충돌' })
  expect(within(guidance).getByText('제거할 Node.js 설치 정보를 확인하지 못했습니다.')).toBeVisible()
  expect(within(guidance).getByRole('button', { name: 'Node.js 제거' })).toBeDisabled()
  expect(within(guidance).getByRole('button', { name: 'nvm-windows 설치' })).toBeDisabled()
  const details = within(guidance).getByText('자세히').closest('details')!
  expect(details).not.toHaveAttribute('open')
  expect(within(details).getByText(path)).not.toBeVisible()
  fireEvent.click(within(guidance).getByText('자세히'))
  expect(within(details).getByText(path)).toBeVisible()
  expect(within(details).getByText('공식 MSI 설치 여부를 확인하지 못했습니다.')).toBeVisible()
  act(() => fixture.emit({ conflicts: [], activeSource: null, activeVersion: null,
    removal: { status: 'unavailable', target: null, confirmationId: null, reason: null, rebootRequired: false, msiExitCode: 0 },
  }))
  expect(within(node()).queryByRole('button', { name: 'Node.js 제거' })).toBeNull()
  fireEvent.click(within(node()).getByRole('button', { name: 'nvm-windows 설치' }))
  await waitFor(() => expect(fixture.api.installManager).toHaveBeenCalledOnce())
})

it('keeps installed switching available when the catalog is offline and shows a service-side failure', async () => {
  const catalog = { ...nodeState.catalog, status: 'error' as const, error: { code: 'catalog-unavailable' as const, message: '공식 목록에 연결할 수 없습니다.' } }
  const fixture = nodeFixture({ catalog })
  fixture.api.use.mockResolvedValue({ ok: true, data: {
    ...nodeState, revision: 2, catalog, error: { code: 'verification-failed', message: '요청한 버전이 적용되지 않았습니다.' },
  } })
  render(<App initialTool="node" api={memoryApi().api} />)
  expect(await within(node()).findByText(catalog.error.message)).toBeVisible()
  expect(within(node()).getByRole('button', { name: '25.2.0 설치' })).toBeDisabled()
  fireEvent.click(within(installed()).getByRole('button', { name: '22.20.0 사용' }))
  expect(await within(node()).findByText('요청한 버전이 적용되지 않았습니다.')).toBeVisible()
  expect(fixture.api.use).toHaveBeenCalledWith('22.20.0')
  expect(within(node()).getByRole('region', { name: '현재 사용 버전' })).toHaveTextContent('24.11.0')
})

it('filters the real catalog and sends the selected release version to install', async () => {
  const fixture = nodeFixture()
  fixture.api.install.mockResolvedValue({ ok: true, data: { ...nodeState, revision: 2, installedVersions: ['25.2.0', ...nodeState.installedVersions] } })
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  await within(list).findByRole('button', { name: '25.2.0 설치' })
  fireEvent.click(within(list).getByRole('button', { name: 'LTS' }))
  expect(within(list).queryByRole('button', { name: '25.2.0 설치' })).toBeNull()
  expect(within(list).getByText('LTS · Krypton')).toBeVisible()
  fireEvent.click(within(list).getByRole('button', { name: '설치됨' }))
  expect(within(list).getByText('22.20.0')).toBeVisible()
  fireEvent.click(within(list).getByRole('button', { name: '전체' }))
  fireEvent.change(within(list).getByRole('searchbox', { name: '버전 검색' }), { target: { value: '25.2' } })
  expect(within(list).queryByText('24.11.0')).toBeNull()
  fireEvent.click(within(list).getByRole('button', { name: '25.2.0 설치' }))
  expect(await within(installed()).findByRole('button', { name: '25.2.0 사용' })).toBeEnabled()
  expect(fixture.api.install).toHaveBeenCalledWith('25.2.0')
})

it('keeps one mutation pending across menu navigation and reflects busy and unknown state on Home', async () => {
  const fixture = nodeFixture()
  let finish!: (value: NodeManagementResult) => void
  fixture.api.install.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="node" api={memoryApi().api} />)
  fireEvent.click(await within(node()).findByRole('button', { name: '25.2.0 설치' }))
  expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeDisabled()
  fireEvent.click(dock('Home'))
  act(() => fixture.emit({ busy: { kind: 'install', version: '25.2.0', phase: 'waiting' } }))
  expect(within(home()).getByText(/25\.2\.0 설치.*Windows 권한/)).toBeVisible()
  await act(async () => finish({ ok: true, data: {
    ...nodeState, revision: 3, busy: { kind: 'install', version: '25.2.0', phase: 'waiting' },
    error: { code: 'operation-unknown', message: '승격 작업의 종료를 확인해 주세요.' },
  } }))
  expect(within(home()).getByText('승격 작업의 종료를 확인해 주세요.')).toBeVisible()
  fireEvent.click(dock('NodeRail'))
  expect(within(installed()).getByRole('button', { name: '22.20.0 다시 확인' })).toBeEnabled()
  fireEvent.click(dock('PlanRail'))
  expect(screen.getByRole('button', { name: '프로젝트 추가' })).toBeEnabled()
})

it('preserves the latest Node event when an older state response finishes and disposes the subscription', async () => {
  const fixture = nodeFixture()
  let finish!: (value: NodeManagementResult) => void
  fixture.api.getState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<App initialTool="home" api={memoryApi().api} />)
  act(() => fixture.emit({ activeVersion: '22.20.0' }))
  await act(async () => finish({ ok: true, data: nodeState }))
  const current = within(within(home()).getByRole('region', { name: '내 개발 환경' }))
  expect(current.getByText('22.20.0')).toBeVisible()
  expect(current.queryByText('24.11.0')).toBeNull()
  await act(async () => fireEvent(window, new Event('focus')))
  expect(fixture.api.getState).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(fixture.dispose).toHaveBeenCalledTimes(1)
  fireEvent(window, new Event('focus'))
  expect(fixture.api.getState).toHaveBeenCalledTimes(2)
})

it('keeps the narrow Planrail editor, the date selection and unsaved exit protection across tools', async () => {
  const user = userEvent.setup()
  window.innerWidth = 980
  const m = memoryApi(hotfix)
  render(<App api={m.api} today={new Date(2026, 10, 12)} />)
  await user.click(await screen.findByRole('button', { name: '일정 추가' }))
  const name = screen.getByRole('textbox', { name: '일정 이름' })
  await user.type(name, '아직 저장하지 않은 일정')
  const start = screen.getByRole('textbox', { name: '시작일' })
  fireEvent.change(start, { target: { value: '2026-11-15' } })
  fireEvent.blur(start)
  await user.keyboard('{F6}')
  expect(dock('PlanRail')).toHaveFocus()
  await user.click(dock('NodeRail'))
  expect(screen.queryByRole('dialog', { name: '일정 추가' })).toBeNull()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await user.click(dock('PlanRail'))
  expect(screen.getByRole('textbox', { name: '일정 이름' })).toBe(name)
  expect(name).toHaveValue('아직 저장하지 않은 일정')
  expect(start).toHaveValue('2026-11-15')
})

it('routes shared notification clicks from Node to a visible Planrail editor', async () => {
  const change: ChangeNotificationState = {
    enabled: true, baselining: false, supported: true, failed: 0, unknown: 0, storageError: false, openRequest: null,
  }
  const sharing = sharingFixture({ role: 'member', status: 'connected', changeNotifications: change })
  const m = memoryApi(hotfix)
  m.snapshot.projects[0].sharing = 'member'
  m.snapshot.schedules[0].sharing = 'member'
  render(<App initialTool="node" api={m.api} />)
  expect(await within(node()).findByRole('region', { name: '현재 사용 버전' })).toBeVisible()
  await act(async () => sharing.emit({
    changeNotifications: { ...change, openRequest: { token: 'node-notification', target: { kind: 'schedule', id: '1', projectId: '1' } } },
  }))
  expect(await screen.findByRole('textbox', { name: '일정 이름' })).toHaveValue('개발')
  expect(dock('PlanRail')).toHaveAttribute('aria-current', 'page')
})

it.each(['catalog-first', 'rejection-first'] as const)(
  'keeps a failed Use visible after a catalog publication in %s order',
  async order => {
    const fixture = nodeFixture({ catalog: { ...nodeState.catalog, status: 'idle', releases: [], checkedAt: null } })
    const loaded = nodeState.catalog
    let resolveCatalog!: (result: NodeManagementResult) => void
    fixture.api.refreshCatalog.mockImplementationOnce(() => new Promise(resolve => { resolveCatalog = resolve }))
    let finishUse!: () => void
    const failure = order === 'catalog-first'
      ? 'Node 관리 응답을 확인하지 못했습니다. 다시 검사해 주세요.'
      : 'Node 전환 요청의 응답을 받지 못했습니다.'
    fixture.api.use.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finishUse = order === 'catalog-first'
        ? () => reject(new Error('renderer transport lost'))
        : () => resolve({ ok: false, error: { code: 'ipc-unavailable', message: failure } })
    }))
    render(<App initialTool="node" api={memoryApi().api} />)
    await within(node()).findByRole('status', { name: '목록 조회 상태' })
    fireEvent.click(within(installed()).getByRole('button', { name: '22.20.0 사용' }))
    const publishCatalog = () => act(async () => {
      fixture.emit({ catalog: loaded })
      resolveCatalog(await fixture.api.getState())
    })
    if (order === 'catalog-first') await publishCatalog()
    await act(async () => finishUse())
    expect(within(node()).getByRole('alert')).toHaveTextContent(failure)
    if (order === 'rejection-first') await publishCatalog()
    await act(async () => fireEvent(window, new Event('focus')))
    expect(within(node()).getByRole('alert')).toHaveTextContent(failure)
    fireEvent.click(dock('Home'))
    expect(within(home()).getByRole('alert')).toHaveTextContent(failure)

    fireEvent.click(dock('NodeRail'))
    expect(within(installed()).getByRole('button', { name: '22.20.0 다시 확인' })).toBeEnabled()
    fireEvent.click(within(node()).getByRole('button', { name: '환경 다시 검사' }))
    await waitFor(() => expect(within(node()).queryByRole('alert')).toBeNull())
    expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeEnabled()
  },
)

it.each(['ipc', 'inspection'] as const)('shows the failed mutation and explicit %s recheck and keeps changes disabled', async failure => {
  const fixture = nodeFixture()
  const mutationError = { code: 'ipc-unavailable', message: 'Node 전환 응답을 확인하지 못했습니다.' } as const
  const recoveryError = { code: 'inspection-failed', message: 'Windows 환경 재검사에 실패했습니다.' } as const
  fixture.api.use.mockResolvedValueOnce({ ok: false, error: mutationError })
  render(<App initialTool="node" api={memoryApi().api} />)
  const panel = await within(node()).findByRole('region', { name: '설치된 버전' })
  const use = within(panel).getByRole('button', { name: '22.20.0 사용' })
  await act(async () => fireEvent.click(use))
  expect(use).toHaveAccessibleName('22.20.0 다시 확인')
  fixture.api.getState.mockResolvedValueOnce(failure === 'ipc'
    ? { ok: false, error: recoveryError }
    : { ok: true, data: { ...nodeState, error: recoveryError } })
  const recheck = within(node()).getByRole('button', { name: '환경 다시 검사' })
  await act(async () => fireEvent.click(recheck))
  expect(within(node()).getByText(mutationError.message)).toBeVisible()
  expect(within(node()).getByText(recoveryError.message, { exact: false })).toBeVisible()
  expect(use).toHaveAccessibleName('22.20.0 다시 확인')
  await act(async () => fireEvent(window, new Event('focus')))
  fireEvent.click(dock('Home'))
  expect(within(home()).getByText(mutationError.message)).toBeVisible()
  expect(within(home()).getByText(recoveryError.message, { exact: false })).toBeVisible()
  fireEvent.click(dock('NodeRail'))
  await act(async () => fireEvent.click(within(node()).getByRole('button', { name: '환경 다시 검사' })))
  expect(within(node()).queryByText(mutationError.message)).toBeNull()
  expect(within(node()).queryByText(recoveryError.message, { exact: false })).toBeNull()
  expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeEnabled()
})

it('reports an unread inventory consistently across the catalog, Installed filter, and panel', async () => {
  nodeFixture({
    manager: { status: 'error', version: null }, installedVersions: [], activeVersion: null, activeSource: null,
    conflicts: [{ code: 'manager-configuration', path: 'C:\\nvm\\nvm.exe', message: '공식 nvm 버전이 필요합니다.' }],
  })
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  expect(within(list).getAllByRole('cell', { name: '확인 불가' })).toHaveLength(2)
  expect(within(list).queryByRole('cell', { name: '미설치' })).toBeNull()
  fireEvent.click(within(list).getByRole('button', { name: '설치됨' }))
  expect(within(list).getByText('설치된 버전을 확인할 수 없습니다.')).toBeVisible()
  expect(within(installed()).getByText('설치된 버전을 확인할 수 없습니다.')).toBeVisible()
})

it('reports an unread active standalone version while showing the detected installation in both tools', async () => {
  nodeFixture({
    manager: { status: 'missing', version: null }, installedVersions: [],
    activeVersion: null, activeSource: 'standalone',
    conflicts: [{ code: 'standalone-node', path: 'C:\\Node\\node.exe', message: '기존 Node가 PATH에 있습니다.' }],
  })
  render(<App initialTool="home" api={memoryApi().api} />)
  const summary = within(home()).getByRole('region', { name: '내 개발 환경' })
  expect(await within(summary).findByText('기존 Node 설치')).toBeVisible()
  expect(within(summary).getByText('확인할 수 없음')).toBeVisible()
  expect(within(summary).queryByText('사용 중인 버전 없음')).toBeNull()
  fireEvent.click(dock('NodeRail'))
  const current = within(node()).getByRole('region', { name: '현재 사용 버전' })
  expect(within(current).getByText('기존 Node 설치')).toBeVisible()
  expect(within(current).getByText('확인할 수 없음')).toBeVisible()
  expect(within(current).queryByText('사용 중인 버전 없음')).toBeNull()
})

it('keeps the active version Use action disabled in both panels', async () => {
  const fixture = nodeFixture({ installedVersions: ['24.11.0'] })
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  expect(within(list).getByRole('row', { name: /^24\.11\.0.*사용 중/ })).toBeVisible()
  expect(within(list).getByRole('button', { name: '24.11.0 사용 중' })).toBeDisabled()
  const active = within(installed()).getByRole('button', { name: '24.11.0 사용 중' })
  expect(active).toBeDisabled()
  fireEvent.click(active)
  expect(fixture.api.use).not.toHaveBeenCalled()
})

it('reports the first empty catalog as loading until its refresh actually fails', async () => {
  const fixture = nodeFixture({ catalog: { status: 'idle', checkedAt: null, releases: [], error: null } })
  let finish!: (result: NodeManagementResult) => void
  fixture.api.refreshCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  expect(await within(list).findByRole('table', { name: '공식 배포 버전' })).toHaveAttribute('aria-busy', 'true')
  expect(within(list).queryByText('공식 배포 목록을 가져오고 있습니다…')).toBeNull()
  expect(within(list).queryByText('공식 배포 목록을 확인하지 못했습니다.')).toBeNull()
  expect(within(list).queryByRole('alert')).toBeNull()
  const message = '공식 목록을 내려받지 못했습니다.'
  await act(async () => finish({ ok: true, data: {
    ...nodeState, revision: 2,
    catalog: { status: 'error', checkedAt: null, releases: [], error: { code: 'catalog-unavailable', message } },
  } }))
  expect(within(list).getByRole('alert')).toHaveTextContent(message)
  expect(within(list).queryByText('공식 배포 목록을 가져오고 있습니다…')).toBeNull()
})


it('sorts every data column before pagination and preserves unknown npm values at the end', async () => {
  const releases = Array.from({ length: 35 }, (_, index) => ({
    version: `22.${index}.0`, date: '2026-11-18', lts: index % 2 ? 'Jod' : null,
    npm: index === 34 ? null : `10.${index}.0`, security: false,
  }))
  nodeFixture({ installedVersions: ['22.2.0', '22.10.0'], activeVersion: '22.2.0', catalog: { ...nodeState.catalog, releases } })
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  const table = within(list).getByRole('table', { name: '공식 배포 버전' })
  const versions = () => within(table).getAllByRole('rowheader').map(row => row.textContent)
  expect(versions()).toHaveLength(30)
  expect(versions()[0]).toBe('22.34.0')
  const versionHeader = within(table).getByRole('columnheader', { name: /Node 버전/ })
  expect(versionHeader).toHaveAttribute('aria-sort', 'descending')
  fireEvent.click(within(versionHeader).getByRole('button'))
  expect(versions()[0]).toBe('22.0.0')
  expect(versionHeader).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(within(list).getByRole('button', { name: '버전 더 보기' }))
  const scroller = table.closest('.workrail-node-table-scroll')!
  scroller.scrollTop = 200
  fireEvent.click(within(table).getByRole('button', { name: 'npm 정렬' }))
  expect(scroller.scrollTop).toBe(0)
  expect(versions()).toHaveLength(30)
  expect(versions()[0]).toBe('22.33.0')
  fireEvent.click(within(table).getByRole('button', { name: 'npm 정렬' }))
  fireEvent.click(within(list).getByRole('button', { name: '버전 더 보기' }))
  expect(versions().at(-1)).toBe('22.34.0')
  fireEvent.click(within(table).getByRole('button', { name: '상태 정렬' }))
  expect(versions().slice(0, 2)).toEqual(['22.2.0', '22.10.0'])
  fireEvent.click(within(table).getByRole('button', { name: '분류 정렬' }))
  expect(versions()[0]).toBe('22.33.0')
  expect(within(table).queryByRole('button', { name: '작업 정렬' })).toBeNull()
})

it('keeps its table frame and existing rows available during refresh without a visible loading sentence', async () => {
  const fixture = nodeFixture()
  let finish!: (result: NodeManagementResult) => void
  fixture.api.refreshCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="node" api={memoryApi().api} />)
  const table = await within(node()).findByRole('table', { name: '공식 배포 버전' })
  expect(table).toHaveAttribute('aria-busy', 'true')
  expect(within(table).getByRole('rowheader', { name: '25.2.0' })).toBeVisible()
  expect(within(node()).queryByText('공식 배포 목록을 가져오고 있습니다…')).toBeNull()
  expect(within(node()).getByRole('status', { name: '목록 조회 상태' })).toHaveTextContent('공식 배포 목록 조회 중')
  expect(within(node()).getByRole('button', { name: '공식 배포 목록 새로고침' })).toBeDisabled()
  expect(within(table).getByRole('button', { name: 'npm 정렬' })).toBeEnabled()
  await act(async () => finish({ ok: true, data: nodeState }))
  expect(table).toHaveAttribute('aria-busy', 'false')
  expect(within(node()).getByRole('status', { name: '목록 조회 상태' })).toHaveTextContent('공식 배포 목록 조회 완료')
})


it('keeps Node search, filter, sort, and panel scroll across tools and catalog refresh', async () => {
  const fixture = nodeFixture()
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  const search = within(list).getByRole('searchbox', { name: '버전 검색' })
  fireEvent.change(search, { target: { value: '2' } })
  fireEvent.click(within(list).getByRole('button', { name: '설치됨' }))
  fireEvent.click(within(list).getByRole('button', { name: 'npm 정렬' }))
  fireEvent.click(within(list).getByRole('button', { name: 'npm 정렬' }))
  const table = within(list).getByRole('table', { name: '공식 배포 버전' })
  const scroller = table.closest('.workrail-node-table-scroll')!
  scroller.scrollTop = 200
  installed().scrollTop = 90
  fireEvent.click(dock('Home'))
  expect(screen.queryByRole('main', { name: 'NodeRail' })).toBeNull()
  fireEvent.click(dock('NodeRail'))
  expect(within(node()).getByRole('searchbox', { name: '버전 검색' })).toBe(search)
  expect(search).toHaveValue('2')
  expect(within(list).getByRole('button', { name: '설치됨' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(table).getByRole('columnheader', { name: /npm/ })).toHaveAttribute('aria-sort', 'ascending')
  expect(scroller.scrollTop).toBe(200)
  expect(installed().scrollTop).toBe(90)
  await act(async () => fireEvent.click(within(list).getByRole('button', { name: '공식 배포 목록 새로고침' })))
  expect(fixture.api.refreshCatalog).toHaveBeenCalled()
  expect(search).toHaveValue('2')
  expect(within(table).getByRole('columnheader', { name: /npm/ })).toHaveAttribute('aria-sort', 'ascending')
  expect(scroller.scrollTop).toBe(200)
})

it('uses the Home title and live PlanRail badges while retaining the last successful check', async () => {
  nodeFixture()
  const sharing = sharingFixture({ role: 'member', status: 'connected', message: '', lastCheckedAt: '2026-11-18T09:00:00Z' })
  render(<App initialTool="home" today={new Date(2026, 10, 18)} api={memoryApi().api} />)
  const widget = await within(home()).findByRole('region', { name: 'PlanRail 상태' })
  expect(within(home()).queryByRole('heading', { name: '작업 현황' })).toBeNull()
  expect(await within(widget).findByText('멤버')).toBeVisible()
  expect(within(widget).getByText('연결 정상')).toHaveAttribute('data-connected', 'true')
  expect(within(home()).getByRole('button', { name: 'NodeRail 열기' })).toBeVisible()
  act(() => sharing.emit({ status: 'disconnected' }))
  expect(within(widget).getByText('연결을 확인할 수 없습니다')).toHaveAttribute('data-connected', 'false')
  expect(within(widget).getByText(/마지막 정상 확인/)).toBeVisible()
  expect(within(widget).queryByText('연결 정상')).toBeNull()
  fireEvent.click(dock('NodeRail'))
  expect(within(node()).queryByRole('heading', { name: 'Node 버전 관리' })).toBeNull()
  expect(within(node()).queryByText(/목록 출처/)).toBeNull()
  expect(within(node()).getByText('NVM 1.2.2 설치')).toBeVisible()
})

it('keeps the actual sharing failure visible when the Home connection badge becomes unknown', async () => {
  nodeFixture()
  const message = '호스트 응답을 확인할 수 없습니다.'
  const sharing = sharingFixture({ role: 'member', status: 'disconnected', address: '192.168.0.10', message })
  vi.mocked(sharing.api.sync).mockResolvedValueOnce({ ok: false, error: { code: 'IPC_UNAVAILABLE', message } })
  render(<App initialTool="planrail" api={memoryApi().api} />)
  fireEvent.click(await screen.findByRole('button', { name: '수동 동기화' }))
  await waitFor(() => expect(sharing.api.sync).toHaveBeenCalled())
  fireEvent.click(dock('Home'))
  const widget = within(home()).getByRole('region', { name: 'PlanRail 상태' })
  expect(within(widget).getByText('공유 상태 확인 불가')).toHaveAttribute('data-connected', 'false')
  expect(within(widget).getByRole('alert')).toHaveTextContent(message)
})

it('shows a pending handoff immediately and allows retry after the recovery window fails to open', async () => {
  const fixture = nodeFixture({
    manager: { status: 'missing', version: null },
    activeSource: 'standalone',
    conflicts: [{ code: 'standalone-node', message: '기존 Node.js', path: null }],
    removal: { status: 'available', target: { version: '24.11.0', path: 'node.exe' }, confirmationId: 'target', rebootRequired: false, msiExitCode: null, reason: null },
    maintenance: { required: true, active: false },
  })
  let finish!: (result: NodeManagementResult) => void
  fixture.api.openMaintenance.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="node" api={memoryApi().api} />)
  const remove = await within(node()).findByRole('button', { name: 'Node.js 제거' })
  fireEvent.click(remove)
  expect(within(node()).getByText(/관리 창을 준비하고 있습니다/)).toBeVisible()
  const message = '복구 파일을 저장할 디스크 공간이 부족합니다.'
  await act(async () => finish({ ok: false, error: { code: 'operation-failed', message } }))
  expect(within(node()).getByRole('alert')).toHaveTextContent(message)
  const retry = within(node()).getByRole('button', { name: 'Node.js 제거' })
  expect(retry).toBeEnabled()
  await act(async () => fireEvent.click(retry))
  expect(fixture.api.openMaintenance).toHaveBeenCalledTimes(2)
  expect(fixture.api.removeStandalone).not.toHaveBeenCalled()
  expect(within(node()).queryByText(message)).toBeNull()
})

const windows = { id: 'windows', label: 'Windows', kind: 'windows', running: true } as const
const ubuntu = { id: 'wsl:12345678-1234-1234-1234-123456789abc', label: 'Ubuntu', distro: 'Ubuntu', kind: 'wsl2', running: false } as const

it('keeps inventory-based actions unknown when the identified manager cannot list installed versions', async () => {
  const fixture = nodeFixture({
    manager: { kind: 'nvm-windows', status: 'ready', version: '1.1.11' },
    capabilities: {
      list: { available: false, reason: '관리자의 설치 목록을 확인하지 못했습니다.' },
      install: { available: true, reason: null }, use: { available: true, reason: null },
    },
  })
  render(<App initialTool="home" api={memoryApi().api} />)
  const widget = within(home()).getByRole('region', { name: 'Node 작업' })
  expect(await within(widget).findByText('관리자의 설치 목록을 확인하지 못했습니다.')).toBeVisible()
  expect(within(widget).queryByRole('button', { name: /22\.20\.0 사용/ })).toBeNull()
  fireEvent.click(dock('NodeRail'))
  const table = await within(node()).findByRole('table', { name: '공식 배포 버전' })
  const row = within(table).getByRole('row', { name: /^25\.2\.0/ })
  expect(within(row).getByRole('img', { name: '확인 불가' })).toBeVisible()
  fireEvent.click(within(row).getByRole('button', { name: '25.2.0 다시 확인' }))
  await waitFor(() => expect(fixture.api.getState).toHaveBeenCalledTimes(2))
  expect(fixture.api.install).not.toHaveBeenCalled()
  expect(fixture.api.use).not.toHaveBeenCalled()
})

it('blocks only the unavailable feature and explains an unsupported release and LTS metadata', async () => {
  const fixture = nodeFixture({
    manager: { kind: 'nvm-windows', status: 'ready', version: '2.0.1' },
    capabilities: {
      list: { available: true, reason: null }, install: { available: true, reason: null },
      use: { available: false, reason: '기본 버전의 전환 경로를 확인하지 못했습니다.' },
    },
    catalog: { ...nodeState.catalog, releases: [
      { ...nodeState.catalog.releases[0], installReason: '이 환경의 설치 정의가 없습니다.' },
      nodeState.catalog.releases[1],
      { version: '23.0.0', date: '', lts: null, ltsKnown: false, npm: null, security: false, sourceOnly: true },
    ] },
  })
  render(<App initialTool="node" api={memoryApi().api} />)
  const table = await within(node()).findByRole('table', { name: '공식 배포 버전' })
  expect(within(table).getByRole('button', { name: '25.2.0 설치' })).toBeDisabled()
  expect(within(table).getByText('이 환경의 설치 정의가 없습니다.')).toBeVisible()
  expect(within(table).getByText('LTS · Krypton')).toBeVisible()
  expect(within(table).getByRole('row', { name: /^23\.0\.0.*확인 불가/ })).toBeVisible()
  expect(within(table).getByRole('button', { name: '23.0.0 설치' })).toBeEnabled()
  expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeDisabled()
  expect(within(node()).getByText(/기본 버전의 전환 경로를 확인하지 못했습니다/)).toBeVisible()
  const status = within(within(table).getByRole('row', { name: /^23\.0\.0/ })).getByRole('img', { name: '미설치' })
  await act(async () => status.focus())
  expect(await screen.findByRole('tooltip')).toHaveTextContent('미설치')
  expect(fixture.api.install).not.toHaveBeenCalled()
})

it('requires the first environment choice and starts a stopped WSL only on explicit request', async () => {
  const environments = { status: 'ready' as const, items: [windows, ubuntu], selectedId: null, error: null }
  const fixture = nodeFixture({
    environments, manager: { status: 'checking', version: null },
    checkedAt: null, installedVersions: [], activeSource: null, activeVersion: null,
  })
  fixture.api.selectEnvironment.mockImplementation(async id => {
    fixture.emit({ environments: { ...environments, selectedId: id } })
    const read = fixture.api.getState.getMockImplementation()!
    return read()
  })
  fixture.api.startEnvironment.mockImplementation(async () => {
    const started = { ...environments, selectedId: ubuntu.id, items: [windows, { ...ubuntu, user: 'minsu', running: true }] }
    fixture.emit({ environments: started, manager: { kind: 'nodenv', status: 'ready', version: '1.5.0' },
      activeSource: 'nodenv', activeVersion: '22.20.0', installedVersions: ['22.20.0'], checkedAt: nodeState.checkedAt })
    const read = fixture.api.getState.getMockImplementation()!
    return read()
  })
  render(<App initialTool="home" api={memoryApi().api} />)
  const picker = await screen.findByRole('dialog', { name: '관리 환경 선택' })
  expect(fixture.api.selectEnvironment).not.toHaveBeenCalled()
  expect(fixture.api.startEnvironment).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(within(picker).getByRole('button', { name: /Ubuntu/ })))
  expect(fixture.api.selectEnvironment).toHaveBeenCalledExactlyOnceWith(ubuntu.id)
  expect(fixture.api.startEnvironment).not.toHaveBeenCalled()
  fireEvent.click(dock('NodeRail'))
  expect(within(node()).getByText(/Ubuntu.*확인 전/)).toBeVisible()
  expect(within(node()).queryByRole('table')).toBeNull()
  expect(fixture.api.refreshCatalog).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(within(node()).getByRole('button', { name: '환경 시작' })))
  expect(fixture.api.startEnvironment).toHaveBeenCalledOnce()
  expect(await within(node()).findByText('nodenv 1.5.0 설치')).toBeVisible()
  fireEvent.click(dock('Home'))
  expect(within(home()).getByText('Ubuntu · minsu · 기본 Node')).toBeVisible()
})

it('keeps only the active and latest installed versions in Home and locks both screens through quick Use', async () => {
  const environments = { status: 'ready' as const, items: [windows, ubuntu], selectedId: windows.id, error: null }
  const fixture = nodeFixture({ environments, installedVersions: ['22.2.0', '21.0.0', '22.10.0', '20.4.0'], activeVersion: '20.4.0' })
  let finish!: (value: NodeManagementResult) => void
  fixture.api.use.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="home" api={memoryApi().api} />)
  const widget = within(home()).getByRole('region', { name: 'Node 작업' })
  const list = await within(widget).findByRole('list', { name: '설치된 버전' })
  expect(within(list).getAllByRole('listitem').map(item => item.querySelector('strong')?.textContent)).toEqual(['20.4.0', '22.10.0', '22.2.0'])
  expect(within(list).getByRole('button', { name: '20.4.0 사용 중' })).toBeDisabled()
  expect(within(widget).getByRole('button', { name: '전체 4개' })).toBeVisible()
  const use = within(list).getByRole('button', { name: '22.10.0 사용' })
  act(() => { use.click(); use.click() })
  expect(fixture.api.use).toHaveBeenCalledExactlyOnceWith('22.10.0')
  expect(within(home()).getByRole('button', { name: '환경 변경' })).toBeDisabled()
  fireEvent.click(dock('NodeRail'))
  expect(within(node()).getByRole('button', { name: '환경 변경' })).toBeDisabled()
  expect(within(installed()).getByRole('button', { name: '22.2.0 사용' })).toBeDisabled()
  await act(async () => finish({ ok: true, data: { ...nodeState, revision: 2, environments } }))
  expect(within(node()).getByRole('button', { name: '환경 변경' })).toBeEnabled()
})

it('shows a cancellable source build, locks repeated cancellation and exposes operation logs', async () => {
  const fixture = nodeFixture({
    busy: { kind: 'install', version: '24.11.0', phase: 'compiling', cancellable: true },
    operationLog: ['컴파일러 확인', '소스 빌드 중'], operationLogPath: '/logs/node.log',
  })
  let finish!: (result: NodeManagementResult) => void
  fixture.api.cancelOperation.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="home" api={memoryApi().api} />)
  const cancel = await within(home()).findByRole('button', { name: '작업 취소' })
  act(() => { cancel.click(); cancel.click() })
  expect(fixture.api.cancelOperation).toHaveBeenCalledOnce()
  fireEvent.click(dock('NodeRail'))
  expect(within(node()).getByText(/24\.11\.0 설치.*소스 컴파일/)).toBeVisible()
  const log = within(node()).getByText('작업 로그')
  fireEvent.click(log)
  expect(within(node()).getByText('/logs/node.log')).toBeVisible()
  await act(async () => finish({ ok: true, data: { ...nodeState, revision: 2, error: { code: 'cancelled', message: '작업을 취소했습니다.' } } }))
  expect(within(node()).queryByRole('button', { name: '작업 취소' })).toBeNull()
  expect(within(node()).getByRole('alert')).toHaveTextContent('작업을 취소했습니다.')
})

it('uses approved current presence for Home and footer and expands connected names and versions', async () => {
  const displayName = '민수의 이름이 긴 사무실 PC'
  const devices = [displayName, '지연', '서준', '오프라인', '취소', '대기'].map((name, index) => ({
    id: String(index), name, ip: '192.168.0.' + (index + 2), approved: index !== 5, revoked: index === 4,
  }))
  const seen = '2026-11-18T12:00:00Z'
  const sharing = sharingFixture({
    role: 'host', status: 'connected', hostingEnabled: true, address: '192.168.0.10',
    devices, connectedMembers: 5,
    memberPresence: Object.fromEntries(devices.map(device => [device.id, { connected: device.id !== '3', lastSeenAt: seen }])),
    deviceVersions: { '0': { checkedAt: seen, version: '1.0.0' }, '1': { checkedAt: seen, version: null } },
  })
  render(<App initialTool="home" api={memoryApi().api} />)
  const widget = within(home()).getByRole('region', { name: 'PlanRail 상태' })
  expect(await within(widget).findByText(displayName)).toBeVisible()
  expect(within(widget).getByText('버전 1.0.0')).toBeVisible()
  expect(within(widget).getByText('버전 확인 불가')).toBeVisible()
  expect(within(widget).queryByText('서준')).toBeNull()
  fireEvent.click(within(widget).getByRole('button', { name: '외 1명' }))
  let list = await screen.findByRole('dialog', { name: '연결된 참여자' })
  expect(within(list).getByText('서준')).toBeVisible()
  expect(within(list).queryByText('취소')).toBeNull()
  await userEvent.keyboard('{Escape}')
  expect(within(widget).getByRole('button', { name: '외 1명' })).toHaveFocus()
  fireEvent.click(dock('PlanRail'))
  const footer = screen.getByRole('contentinfo', { name: 'PlanRail 상태' })
  expect(within(footer).getByText(displayName)).toBeVisible()
  fireEvent.click(within(footer).getByRole('button', { name: '외 1명' }))
  list = await screen.findByRole('dialog', { name: '연결된 참여자' })
  expect(within(list).getByText('서준')).toBeVisible()
  expect(within(list).queryByText('대기')).toBeNull()
  act(() => sharing.emit({ memberPresence: {} }))
  expect(within(footer).getByText('연결된 참여자 없음')).toBeVisible()
  expect(screen.queryByRole('dialog', { name: '연결된 참여자' })).toBeNull()
})

it('keeps quick Use available when only the configured download mirror blocks installation', async () => {
  const mirror = '설치에 사용할 배포 주소를 확인해 주세요.'
  const fixture = nodeFixture({
    conflicts: [{ code: 'mirror', path: null, message: mirror }],
    capabilities: {
      list: { available: true, reason: null }, install: { available: false, reason: mirror }, use: { available: true, reason: null },
    },
  })
  render(<App initialTool="home" api={memoryApi().api} />)
  const use = await within(home()).findByRole('button', { name: '22.20.0 사용' })
  expect(use).toBeEnabled()
  await act(async () => fireEvent.click(use))
  expect(fixture.api.use).toHaveBeenCalledExactlyOnceWith('22.20.0')
  fireEvent.click(dock('NodeRail'))
  expect(await within(node()).findByRole('button', { name: '25.2.0 설치' })).toBeDisabled()
})
