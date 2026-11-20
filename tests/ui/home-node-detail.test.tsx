import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip'
import { Home } from '../../src/renderer/workrail/Home'
import { useNodeManagement, type NodeManagement } from '../../src/renderer/workrail/useNodeManagement'
import type { NodeEnvironment, NodeManagementState } from '../../src/shared/node-management'
import { schedule } from '../fixtures/timeline'

const ubuntu: NodeEnvironment = {
  id: 'wsl:12345678-1234-1234-1234-123456789abc', kind: 'wsl2', label: 'Ubuntu', user: 'minsu', running: true,
}
const initial: NodeManagementState = {
  revision: 1, platform: 'win32', supported: true, environments: { status: 'ready', items: [ubuntu], selectedId: ubuntu.id, error: null },
  manager: { kind: 'nodenv', status: 'ready', version: '1.6.2' }, installedVersions: ['24.22.2', '22.16.0'], activeVersion: '22.16.0',
  activeSource: 'nodenv', catalog: { status: 'idle', checkedAt: null, error: null, releases: [] },
  checkedAt: '2026-11-19T10:00:00Z', conflicts: [], busy: null, error: null,
}
const noop = () => {}
function Dashboard({ date = '2026-11-19', end = date, node = {} }: { date?: string; end?: string; node?: Partial<NodeManagement> }) {
  const defaults = useNodeManagement(false)
  const state = node.state ?? initial
  const environment = state.environments?.items.find(item => item.id === state.environments?.selectedId)
  return <TooltipProvider><Home date={date} snapshot={{ projects: [], schedules: [schedule('1', '1', '0001-01-01', end)] }}
    phase="ready" timelineError={null} sharing={null} sharingError={null}
    node={{ ...defaults, available: true, error: null, state, environment, ...node }}
    onRefresh={noop} onPlanrail={noop} onNode={noop} onEnvironment={noop} /></TooltipProvider>
}

it.each([
  ['2026-11-20', '2026-11-23', '3일 남음'],
  ['2024-02-28', '2024-03-01', '2일 남음'],
  ['2026-12-31', '2027-01-01', '1일 남음'],
  ['2026-03-07', '2026-03-09', '2일 남음'],
  ['0001-01-01', '0001-01-01', '오늘 마감'],
])('displays the calendar days from %s through %s after the sharing badge', (date, end, remaining) => {
  const view = render(<Dashboard date={date} end={end} />)
  const schedules = within(screen.getByRole('list', { name: '오늘의 일정' }))
  expect(schedules.getByRole('listitem')).toHaveTextContent('개인' + remaining)
  view.rerender(<Dashboard date={end} end={end} />)
  expect(schedules.getByRole('listitem')).toHaveTextContent('개인오늘 마감')
})

it('retains the pre-operation inventory while the live stage, cancellation and log stay accessible', () => {
  const view = render(<Dashboard />)
  const widget = within(screen.getByRole('region', { name: 'Node 작업' }))
  const list = widget.getByRole('list', { name: '설치된 버전' })
  const busy: NodeManagementState = { ...initial, revision: 2, installedVersions: [], activeVersion: null,
    busy: { kind: 'install', version: '24.22.3', phase: 'compiling', cancellable: true }, operationLog: ['building'] }
  const cancel = vi.fn(async () => {})
  view.rerender(<Dashboard node={{ state: busy, operationBaseline: initial, busy: true, cancelOperation: cancel }} />)
  expect(list).toBeInTheDocument()
  expect(list.closest('[inert]')).not.toBeNull()
  expect(list).toHaveTextContent('22.16.0')
  expect(list).toHaveTextContent('24.22.2')
  const status = widget.getByRole('status')
  expect(status.closest('[inert]')).toBeNull()
  expect(status).toHaveTextContent(/24\.22\.3 설치.*소스 컴파일 중/)
  fireEvent.click(widget.getByRole('button', { name: '작업 취소' }))
  expect(cancel).toHaveBeenCalledOnce()
  fireEvent.click(widget.getByRole('button', { name: '작업 로그 보기' }))
  expect(widget.getByText('building')).toBeVisible()
  expect(screen.getByRole('button', { name: 'PlanRail에서 전체 일정 보기' })).toBeEnabled()
  view.rerender(<Dashboard node={{ state: { ...initial, revision: 3, installedVersions: ['24.22.3'], activeVersion: '24.22.3' } }} />)
  expect(widget.getByText('사용 중')).toHaveAttribute('aria-current', 'true')
  expect(widget.queryByText('22.16.0')).toBeNull()
  expect(widget.queryByRole('status')).toBeNull()
})

it('gives an uncertain operation a live recovery control despite the retained busy operation', () => {
  const refresh = vi.fn()
  const unknown: NodeManagementState = { ...initial, error: { code: 'operation-unknown', message: '작업 종료를 확인하세요.' },
    busy: { kind: 'install', version: '24.22.3', phase: 'waiting' } }
  render(<Dashboard node={{ state: unknown, busy: true, refresh }} />)
  const widget = within(screen.getByRole('region', { name: 'Node 작업' }))
  expect(widget.getByRole('alert')).toHaveTextContent('작업 종료를 확인하세요.')
  const recover = widget.getByRole('button', { name: '다시 확인' })
  expect(recover.closest('[inert]')).toBeNull()
  fireEvent.click(recover)
  expect(refresh).toHaveBeenCalledOnce()
})

it('labels the current folder, blocks stale or stopped targets and reports the folder error in its panel', () => {
  const open = vi.fn(async () => {})
  const view = render(<Dashboard node={{ openManagerFolder: open }} />)
  const environment = within(screen.getByRole('region', { name: '내 개발 환경' }))
  const folder = () => environment.getByRole('button', { name: /폴더 열기/ })
  expect(folder()).toHaveAccessibleName(/Ubuntu.*minsu.*nodenv/)
  fireEvent.click(folder())
  expect(open).toHaveBeenCalledOnce()
  view.rerender(<Dashboard node={{ recheckPending: true }} />)
  expect(folder()).toBeDisabled()
  view.rerender(<Dashboard node={{ state: { ...initial, manager: { ...initial.manager, status: 'missing' } } }} />)
  expect(folder()).toBeDisabled()
  view.rerender(<Dashboard node={{ state: { ...initial, error: { code: 'inspection-failed', message: '환경 확인 실패' } } }} />)
  expect(folder()).toBeDisabled()
  const stopped = { ...ubuntu, running: false, user: undefined }
  view.rerender(<Dashboard node={{ state: { ...initial, environments: { ...initial.environments!, items: [stopped] } } }} />)
  expect(folder()).toBeDisabled()
  expect(folder()).toHaveAccessibleDescription('환경 시작 후 열 수 있습니다')
  view.rerender(<Dashboard node={{ folderError: '탐색기에서 폴더를 열 수 없습니다.' }} />)
  expect(environment.getByRole('alert')).toHaveTextContent('탐색기에서 폴더를 열 수 없습니다.')
})
