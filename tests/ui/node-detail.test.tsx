import { fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NodeScreen } from '../../src/renderer/workrail/NodeScreen'
import { useNodeManagement } from '../../src/renderer/workrail/useNodeManagement'
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
  const { result } = renderHook(() => useNodeManagement(false))
  const model = { ...result.current, state: snapshot, environment: windows as NodeEnvironment | undefined,
    available: true, error: null, recheckPending: false, releaseError: null as string | null,
    openingManager: null as 'folder' | 'release' | null, openManagerRelease: vi.fn(async () => {}) }
  function view(changes: Partial<typeof model> = {}) {
    return <TooltipProvider><NodeScreen node={{ ...model, ...changes }} onEnvironment={vi.fn()} /></TooltipProvider>
  }
  const { rerender } = render(view())
  return { model, update: (changes: Partial<typeof model>) => rerender(view(changes)),
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
