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
    getState: vi.fn(getState), refreshCatalog: vi.fn(getState),
    install: vi.fn(getState), use: vi.fn(getState), installManager: vi.fn(getState),
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
function dock(name: '홈' | 'Planrail' | 'Node 관리') {
  return within(screen.getByRole('navigation', { name: 'WorkRail 도구' })).getByRole('button', { name })
}
const home = () => screen.getByRole('main', { name: '홈' })
const node = () => screen.getByRole('main', { name: 'Node 버전 관리' })
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
  expect(dock('홈')).toHaveAttribute('aria-current', 'page')
  expect(await within(home()).findByText('24.11.0')).toBeVisible()
  const rows = within(within(home()).getByRole('list', { name: '오늘의 일정' })).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('종료일 일정')
  expect(rows[0]).toHaveTextContent('공유')
  expect(rows[1]).toHaveTextContent('진행 중 일정')
  expect(rows[2]).toHaveTextContent('시작일 일정')
  expect(within(home()).getByText(/마지막.*공유/)).toBeVisible()
  fireEvent.click(dock('Planrail'))
  fireEvent.click(screen.getByRole('button', { name: '개인' }))
  fireEvent.click(dock('홈'))
  expect(within(home()).getByText('종료일 일정')).toBeVisible()
  fireEvent.click(within(home()).getByRole('button', { name: 'Planrail에서 전체 일정 보기' }))
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
  fireEvent.click(dock('Node 관리'))
  await waitFor(() => expect(fixture.api.refreshCatalog).toHaveBeenCalledTimes(1))
  fireEvent.click(within(node()).getByRole('button', { name: 'nvm-windows 1.2.2 설치' }))
  expect(await within(node()).findByText('nvm-windows 1.2.2')).toBeVisible()
  expect(fixture.api.installManager).toHaveBeenCalledTimes(1)
})

it('shows the Windows x64 scope before interpreting missing manager state', async () => {
  nodeFixture({ supported: false, platform: 'linux', manager: { status: 'missing', version: null }, activeVersion: null, activeSource: null, installedVersions: [], checkedAt: null })
  render(<App initialTool="node" api={memoryApi().api} />)
  expect(await within(node()).findByText(/Windows x64에서 사용할 수 있습니다/)).toBeVisible()
  expect(within(node()).queryByRole('button', { name: /설치|사용/ })).toBeNull()
})

it('shows an incompatible manager with its conflict path and official upgrade instructions', async () => {
  const path = 'C:\\nvm\\nvm.exe'
  nodeFixture({ manager: { status: 'error', version: '1.1.12' }, conflicts: [
    { code: 'manager-configuration', path, message: '호환되지 않는 nvm-windows입니다.' },
  ] })
  render(<App initialTool="node" api={memoryApi().api} />)
  expect(await within(node()).findByText(path)).toBeVisible()
  expect(within(node()).getByText('호환되지 않는 nvm-windows입니다.')).toBeVisible()
  expect(within(node()).getByText(/공식 nvm-windows 1\.2\.2.*수동/)).toBeVisible()
  expect(within(node()).queryByRole('button', { name: 'nvm-windows 1.2.2 설치' })).toBeNull()
  expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeDisabled()
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
  expect(within(list).getByText('Krypton')).toBeVisible()
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
  fireEvent.click(dock('홈'))
  act(() => fixture.emit({ busy: { kind: 'install', version: '25.2.0', phase: 'waiting' } }))
  expect(within(home()).getByText(/25\.2\.0 설치.*Windows 권한/)).toBeVisible()
  await act(async () => finish({ ok: true, data: {
    ...nodeState, revision: 3, busy: { kind: 'install', version: '25.2.0', phase: 'waiting' },
    error: { code: 'operation-unknown', message: '승격 작업의 종료를 확인해 주세요.' },
  } }))
  expect(within(home()).getByText('승격 작업의 종료를 확인해 주세요.')).toBeVisible()
  fireEvent.click(dock('Node 관리'))
  expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeDisabled()
  fireEvent.click(dock('Planrail'))
  expect(screen.getByRole('button', { name: '프로젝트 추가' })).toBeEnabled()
})

it('preserves the latest Node event when an older state response finishes and disposes the subscription', async () => {
  const fixture = nodeFixture()
  let finish!: (value: NodeManagementResult) => void
  fixture.api.getState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<App initialTool="home" api={memoryApi().api} />)
  act(() => fixture.emit({ activeVersion: '22.20.0' }))
  await act(async () => finish({ ok: true, data: nodeState }))
  expect(within(home()).getByText('22.20.0')).toBeVisible()
  expect(within(home()).queryByText('24.11.0')).toBeNull()
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
  expect(dock('Planrail')).toHaveFocus()
  await user.click(dock('Node 관리'))
  expect(screen.queryByRole('dialog', { name: '일정 추가' })).toBeNull()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await user.click(dock('Planrail'))
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
  expect(await within(node()).findByRole('heading', { name: 'Node 버전 관리' })).toBeVisible()
  await act(async () => sharing.emit({
    changeNotifications: { ...change, openRequest: { token: 'node-notification', target: { kind: 'schedule', id: '1', projectId: '1' } } },
  }))
  expect(await screen.findByRole('textbox', { name: '일정 이름' })).toHaveValue('개발')
  expect(dock('Planrail')).toHaveAttribute('aria-current', 'page')
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
    await within(node()).findByText('공식 배포 목록을 가져오고 있습니다…')
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
    fireEvent.click(dock('홈'))
    expect(within(home()).getByRole('alert')).toHaveTextContent(failure)

    fireEvent.click(dock('Node 관리'))
    expect(within(installed()).getByRole('button', { name: '22.20.0 사용' })).toBeDisabled()
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
  expect(use).toBeDisabled()
  fixture.api.getState.mockResolvedValueOnce(failure === 'ipc'
    ? { ok: false, error: recoveryError }
    : { ok: true, data: { ...nodeState, error: recoveryError } })
  const recheck = within(node()).getByRole('button', { name: '환경 다시 검사' })
  await act(async () => fireEvent.click(recheck))
  expect(within(node()).getByText(mutationError.message)).toBeVisible()
  expect(within(node()).getByText(recoveryError.message, { exact: false })).toBeVisible()
  expect(use).toBeDisabled()
  await act(async () => fireEvent(window, new Event('focus')))
  fireEvent.click(dock('홈'))
  expect(within(home()).getByText(mutationError.message)).toBeVisible()
  expect(within(home()).getByText(recoveryError.message, { exact: false })).toBeVisible()
  fireEvent.click(dock('Node 관리'))
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
  expect(within(list).getAllByRole('cell', { name: '확인 필요' })).toHaveLength(2)
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
  fireEvent.click(dock('Node 관리'))
  const current = within(node()).getByRole('region', { name: '현재 사용 버전' })
  expect(within(current).getByText('기존 Node 설치')).toBeVisible()
  expect(within(current).getByText('확인할 수 없음')).toBeVisible()
  expect(within(current).queryByText('사용 중인 버전 없음')).toBeNull()
})

it('allows Use for the only installed version while nvm reports that version active', async () => {
  const fixture = nodeFixture({ installedVersions: ['24.11.0'] })
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  expect(within(list).getByRole('row', { name: /^24\.11\.0.*사용 중/ })).toBeVisible()
  expect(within(list).getByRole('button', { name: '24.11.0 사용' })).toBeEnabled()
  expect(within(installed()).getByText('사용 중')).toBeVisible()
  await act(async () => fireEvent.click(within(installed()).getByRole('button', { name: '24.11.0 사용' })))
  expect(fixture.api.use).toHaveBeenCalledWith('24.11.0')
})

it('reports the first empty catalog as loading until its refresh actually fails', async () => {
  const fixture = nodeFixture({ catalog: { status: 'idle', checkedAt: null, releases: [], error: null } })
  let finish!: (result: NodeManagementResult) => void
  fixture.api.refreshCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<App initialTool="node" api={memoryApi().api} />)
  const list = await within(node()).findByRole('region', { name: '공식 배포 목록' })
  expect(await within(list).findByText('공식 배포 목록을 가져오고 있습니다…')).toBeVisible()
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
