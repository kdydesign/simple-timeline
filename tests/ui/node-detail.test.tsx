import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NodeScreen } from '../../src/renderer/workrail/NodeScreen'
import { useNodeManagement, type NodeManagement } from '../../src/renderer/workrail/useNodeManagement'
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip'
import type { NodeEnvironment, NodeManagementState } from '../../src/shared/node-management'

const windows: NodeEnvironment = { id: 'windows', label: 'Windows', kind: 'windows', running: true }
const snapshot: NodeManagementState = {
  revision: 1, platform: 'win32', supported: true, checkedAt: '2026-11-19T10:00:00Z',
  environments: { status: 'ready', items: [windows], selectedId: windows.id, error: null },
  manager: { status: 'ready', version: '1.1.11' }, activeSource: 'nvm', activeVersion: '22.0.0',
  installedVersions: ['22.0.0'], catalog: { status: 'ready', releases: [], checkedAt: null, error: null },
  busy: null, conflicts: [], error: null,
}

function showDetail() {
  const model = { state: snapshot, environment: windows as NodeEnvironment | undefined,
    available: true, error: null, recheckPending: false, releaseError: null as string | null,
    openingManager: null as 'folder' | 'release' | null, openManagerRelease: vi.fn(async () => {}) }
  function View({ changes }: { changes?: Partial<NodeManagement> }) {
    const defaults = useNodeManagement(false)
    return <TooltipProvider><NodeScreen node={{ ...defaults, ...model, ...changes }} onEnvironment={vi.fn()} /></TooltipProvider>
  }
  const { rerender } = render(<View />)
  return { model, update: (changes: Partial<NodeManagement>) => rerender(<View changes={changes} />),
    panel: within(screen.getByRole('region', { name: '현재 사용 버전' })) }
}

it('exposes the manual inspection separately from the catalog refresh', () => {
  const { update } = showDetail()
  const current = screen.getByRole('region', { name: '현재 사용 버전' })
  const catalog = screen.getByRole('table', { name: '공식 배포 버전' })
  update({ recheckPending: true })
  expect(current).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status', { name: '환경 검사 상태' })).toHaveTextContent('환경 다시 검사 중')
  expect(within(current).getByRole('button', { name: '환경 다시 검사' })).toBeDisabled()
  expect(catalog).toHaveAttribute('aria-busy', 'false')
  update({ catalogPending: true })
  expect(current).toHaveAttribute('aria-busy', 'false')
  expect(catalog).toHaveAttribute('aria-busy', 'true')
})

it('offers the selected manager release even when missing and shows opener failures inline', () => {
  const { model, panel, update } = showDetail()
  update({ state: { ...snapshot, manager: { status: 'missing', version: null }, activeSource: 'standalone' } })
  const link = panel.getByRole('link', { name: /최신 릴리스/ })
  expect(panel.queryByText(/1\.1\.11/)).toBeNull()
  expect(panel.getByText('기존 Node 설치')).toBeVisible()
  fireEvent.click(link)
  expect(model.openManagerRelease).toHaveBeenCalledOnce()
  update({ state: { ...snapshot, error: { code: 'inspection-failed', message: '환경을 확인할 수 없습니다.' } } })
  expect(panel.queryByText('NVM 1.1.11 설치')).toBeNull()
  expect(link).toBeVisible()
  update({ openingManager: 'release' })
  fireEvent.click(link)
  expect(model.openManagerRelease).toHaveBeenCalledOnce()
  update({ releaseError: '기본 브라우저를 열 수 없습니다.' })
  expect(panel.getByRole('alert')).toHaveTextContent('기본 브라우저를 열 수 없습니다.')
  update({ environment: undefined, state: { ...snapshot, environments: { ...snapshot.environments!, selectedId: null } } })
  expect(panel.queryByRole('link')).toBeNull()
  expect(panel.getByRole('button', { name: '환경 선택' })).toBeEnabled()
})

it('keeps release guidance available for selected stopped WSL without reporting the last manager version', () => {
  const { update } = showDetail()
  const wsl: NodeEnvironment = { id: 'wsl:12345678-1234-1234-1234-123456789abc', label: 'Ubuntu', kind: 'wsl2', running: false }
  update({ environment: wsl, state: { ...snapshot, manager: { kind: 'nodenv', status: 'ready', version: '1.5.0' },
    environments: { status: 'ready', selectedId: wsl.id, items: [wsl], error: null } } })
  const panel = within(screen.getByRole('region', { name: '기본 버전' }))
  expect(panel.getByText('Ubuntu · 기본 사용자 확인 전 · 종료됨')).toBeVisible()
  expect(panel.queryByText('nodenv 1.5.0 설치')).toBeNull()
  expect(panel.getByRole('link', { name: /최신 릴리스/ })).toHaveAccessibleDescription(/nodenv/)
})

const release = { version: '24.0.0', date: '2026-01-01', lts: null, npm: null, security: false }
const beforeInstall: NodeManagementState = { ...snapshot, catalog: { ...snapshot.catalog, releases: [release] } }
const installing: NodeManagementState = { ...snapshot, revision: 2, activeVersion: null, installedVersions: [],
  busy: { kind: 'install', version: release.version, phase: 'waiting' } }

it('covers both lists with one live stage and restores the focused action after an install', () => {
  const { update } = showDetail()
  update({ state: beforeInstall })
  const catalog = screen.getByRole('region', { name: '공식 배포 목록' })
  const installed = screen.getByRole('region', { name: '설치된 버전' })
  const install = within(catalog).getByRole('button', { name: '24.0.0 설치' })
  const currentVersion = within(installed).getByText('22.0.0')
  const scroll = catalog.querySelector('.workrail-node-table-scroll')!
  const installedScroll = installed.querySelector('.workrail-installed-scroll')!
  scroll.scrollTop = 88
  installedScroll.scrollTop = 112
  install.focus()
  update({ state: installing, operationBaseline: beforeInstall, busy: true })
  expect(catalog.closest('[inert]')).not.toBeNull()
  expect(installed.closest('[inert]')).toBe(catalog.closest('[inert]'))
  expect(currentVersion).toBeInTheDocument()
  expect(install).toBeInTheDocument()
  const status = screen.getByText(/24\.0\.0 설치.*Windows 권한/)
  expect(status).toHaveAttribute('role', 'status')
  const overlay = status.closest('.workrail-node-overlay')!
  expect(overlay).not.toBeNull()
  expect(overlay.contains(document.activeElement)).toBe(true)
  expect(overlay.closest('[inert]')).toBeNull()
  expect(screen.queryByRole('button', { name: '작업 취소' })).toBeNull()
  update({ state: { ...beforeInstall, installedVersions: ['22.0.0', '24.0.0'] } })
  expect(install).toHaveAccessibleName('24.0.0 사용')
  expect(install).toHaveFocus()
  expect(scroll.scrollTop).toBe(88)
  expect(installedScroll.scrollTop).toBe(112)
})

it('uses a nearby heading when the focused use action becomes disabled and respects focus moved elsewhere', () => {
  const { update } = showDetail()
  const initial = { ...beforeInstall, installedVersions: ['22.0.0', '24.0.0'] }
  update({ state: initial })
  const installed = within(screen.getByRole('region', { name: '설치된 버전' }))
  const use = installed.getByRole('button', { name: '24.0.0 사용' })
  const running = { state: { ...initial, busy: { kind: 'use', version: '24.0.0', phase: 'checking' } }, busy: true, operationBaseline: initial } as const
  use.focus()
  update(running)
  update({ state: { ...initial, activeVersion: '24.0.0' } })
  expect(installed.getByRole('heading')).toHaveFocus()
  update({ state: initial })
  use.focus()
  update(running)
  const outside = document.createElement('button')
  document.body.append(outside)
  try {
    outside.focus()
    update({ state: initial })
    expect(outside).toHaveFocus()
  } finally {
    outside.remove()
  }
})

it('keeps live WSL cancellation and logs available and exposes recheck when the environment becomes unavailable', () => {
  const { update } = showDetail()
  const wsl: NodeEnvironment = { id: 'wsl:12345678-1234-1234-1234-123456789abc', label: 'Ubuntu', kind: 'wsl2', running: true }
  const active = { ...installing, busy: { kind: 'install', version: release.version, phase: 'compiling', cancellable: true },
    operationLog: ['building'], environments: { status: 'ready', selectedId: wsl.id, items: [wsl], error: null } } satisfies NodeManagementState
  const cancel = vi.fn(async () => {})
  update({ state: active, busy: true, environment: wsl, cancelOperation: cancel })
  const status = screen.getByText(/24\.0\.0 설치.*소스 컴파일/)
  const scope = status.closest<HTMLElement>('.workrail-node-overlay')
  expect(scope).not.toBeNull()
  fireEvent.click(within(scope!).getByRole('button', { name: '작업 취소' }))
  expect(cancel).toHaveBeenCalledOnce()
  const logs = within(scope!).getByRole('button', { name: '작업 로그 보기' })
  logs.focus()
  fireEvent.click(logs)
  expect(within(scope!).getByText('building')).toBeVisible()
  const stopped = { ...wsl, running: false }
  update({ state: { ...active, environments: { ...active.environments, items: [stopped] },
    error: { code: 'operation-unknown', message: '종료 상태를 확인해 주세요.' } }, busy: true, environment: stopped })
  expect(screen.queryByRole('region', { name: '설치된 버전' })).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent('종료 상태를 확인해 주세요.')
  expect(screen.getByRole('button', { name: '환경 다시 검사' })).toBeEnabled()
  expect(screen.getByRole('heading', { name: '기본 버전' })).toHaveFocus()
  expect(screen.queryByRole('button', { name: '작업 취소' })).toBeNull()
})

it('keeps focus in the overlay when WSL verification withdraws cancellation', () => {
  const { update } = showDetail()
  const wsl: NodeEnvironment = { id: 'wsl:12345678-1234-1234-1234-123456789abc', label: 'Ubuntu', kind: 'wsl2', running: true }
  const operation = { kind: 'install', version: '24.0.0', phase: 'compiling', cancellable: true } as const
  const active = { ...installing, busy: operation, environments: { status: 'ready', selectedId: wsl.id, items: [wsl], error: null } } satisfies NodeManagementState
  update({ state: active, busy: true, environment: wsl })
  screen.getByRole('button', { name: '작업 취소' }).focus()
  update({ state: { ...active, busy: { ...operation, phase: 'verifying', cancellable: false } }, busy: true, environment: wsl })
  expect(screen.queryByRole('button', { name: '작업 취소' })).toBeNull()
  expect(screen.getByRole('group', { name: 'Node 작업 진행' })).toHaveFocus()
})

it('copies only Windows operation history when the screen includes private manager and account paths', () => {
  const { update } = showDetail()
  const operationLog = ['2026-11-19T10:00:00Z · install · 24.0.0 · nvm 1.x · zip-permission · 대상 폴더 · 최종 이동 · EPERM']
  update({ state: { ...snapshot, operationLog, manager: { ...snapshot.manager, path: 'C:\\Users\\private\\nvm' },
    error: { code: 'zip-incomplete', message: '계정 폴더 C:\\Users\\private' } } })
  const descriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')
  let copied = ''
  Object.defineProperty(document, 'execCommand', { configurable: true, value: (command: string) => {
    expect(command).toBe('copy')
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData(type: string, value: string) {
      expect(type).toBe('text/plain')
      copied = value
    } } })
    document.activeElement!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    return true
  } })
  try {
    fireEvent.click(screen.getByRole('button', { name: '작업 로그 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '진단 복사' }))
    expect(copied).toBe(operationLog[0])
    expect(screen.getByText('진단 이력을 복사했습니다.')).toBeVisible()

    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
    fireEvent.click(screen.getByRole('button', { name: '진단 복사' }))
    const log = screen.getByText(operationLog[0])
    expect(log).toHaveFocus()
    expect(screen.getByText('선택된 이력을 Ctrl+C로 복사해 주세요.')).toBeVisible()
    const setData = vi.fn()
    expect(fireEvent.copy(log, { clipboardData: { setData } })).toBe(false)
    expect(setData.mock.calls).toEqual([['text/plain', operationLog[0]]])
  } finally {
    if (descriptor) Object.defineProperty(document, 'execCommand', descriptor)
    else Reflect.deleteProperty(document, 'execCommand')
  }
})
