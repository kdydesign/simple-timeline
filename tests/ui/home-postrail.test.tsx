import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { PrLibrary, PrRequest } from '../../src/shared/postrail'
import type { PrRunState } from '../../src/shared/postrail-run'
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip'
import { Home } from '../../src/renderer/workrail/Home'
import { useNodeManagement } from '../../src/renderer/workrail/useNodeManagement'

HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
HTMLDialogElement.prototype.close ??= function () { this.open = false }

const noop = () => {}
function request(id: string, groupId: string | null, method: PrRequest['method'] = 'GET'): PrRequest {
  return { id, name: id, groupId, method, url: 'https://example.test/' + id, body: '{"id":"${index}"}',
    headers: {}, useAuth: false, favorite: true, nextIndex: '9007199254740993', timeoutMs: null }
}
const post = request('등록', 'samples', 'POST')
const library: PrLibrary = {
  groups: [{ id: 'samples', name: '샘플' }, { id: 'devices', name: '장비' }],
  requests: [request('분류 전', null), request('조회', 'devices'), post, request('삭제', 'samples', 'DELETE'),
    request('상태', 'devices'), request('로그', 'devices')],
  environments: [{ id: 'qa', name: '검수 환경', variables: {}, apiOrigin: 'https://qa.example.test', loginUrl: 'https://qa.example.test/login', loginHeaders: {},
    loginBody: '', tokenPath: '', tokenHeader: '', tokenPrefix: '', hasPassword: false }],
  environmentId: 'qa',
}
const run: PrRunState = { phase: 'running', runId: 'run1', requestId: 'old', requestName: '이전 요청', environmentId: 'old',
  environmentName: '개발 환경', total: '8', completed: '3', failed: '1', uncertain: '1', message: '', authenticatedEnvironmentIds: ['qa'] }
function Dashboard({ saved = library, currentRun = null, error = '', submitting = false, available = true, start = async () => true, open = noop }: {
  saved?: PrLibrary; currentRun?: PrRunState | null; error?: string; submitting?: boolean; available?: boolean
  start?: (request: PrRequest, environmentId: string, count: string) => Promise<boolean>; open?: () => void
}) {
  const node = useNodeManagement(false)
  return <TooltipProvider><Home date="2026-11-19" snapshot={null} phase="ready" timelineError={null} sharing={null}
    sharingError={null} node={node} onRefresh={noop} onPlanrail={noop} onNode={noop} onEnvironment={noop}
    postrail={{library: saved, run: currentRun, error, start, submitting, available}} onPostRail={open} /></TooltipProvider>
}
const widget = () => within(screen.getByRole('region', { name: 'PostRail 즐겨찾기' }))

it('shows the first five saved favorites in group order and promotes the next when a star is removed', () => {
  const open = vi.fn()
  const view = render(<Dashboard open={open} />)
  const names = () => widget().getAllByRole('button', {name: /즉시 실행$/}).map(button => button.getAttribute('aria-label'))
  expect(names()).toEqual(['등록 즉시 실행', '삭제 즉시 실행', '조회 즉시 실행', '상태 즉시 실행', '로그 즉시 실행'])
  expect(widget().getByText('즐겨찾기 6개')).toBeVisible()
  view.rerender(<Dashboard saved={{...library, requests: library.requests.map(r => r.id === post.id ? {...r, favorite: false} : r)}} />)
  expect(names()).toEqual(['삭제 즉시 실행', '조회 즉시 실행', '상태 즉시 실행', '로그 즉시 실행', '분류 전 즉시 실행'])
  view.rerender(<Dashboard saved={{...library, requests: []}} open={open} />)
  expect(widget().getByText(/☆/)).toBeVisible()
  fireEvent.click(widget().getByRole('button', {name: 'PostRail 열기'}))
  expect(open).toHaveBeenCalledOnce()
})

it('sends the saved definition once in the displayed environment, and requires an explicit POST repeat count', () => {
  const start = vi.fn(async () => true)
  render(<Dashboard start={start} />)
  expect(widget().getByText('검수 환경')).toBeVisible()
  fireEvent.click(widget().getByRole('button', { name: '등록 즉시 실행' }))
  expect(start).toHaveBeenCalledWith(post, 'qa', '1')
  expect(widget().getAllByRole('button', {name: /반복 보내기$/})).toHaveLength(1)
  const repeat = widget().getByRole('button', {name: '등록 반복 보내기'})
  fireEvent.click(repeat)
  let dialog = within(screen.getByRole('dialog', {name: '반복 보내기'}))
  expect(dialog.getByLabelText('횟수')).toHaveValue('1')
  fireEvent.change(dialog.getByLabelText('횟수'), {target: {value: '3'}})
  expect(dialog.getByText(/9007199254740993.*9007199254740995/)).toBeVisible()
  fireEvent.click(dialog.getByRole('button', {name: '취소'}))
  expect(start).toHaveBeenCalledTimes(1)
  fireEvent.click(repeat)
  dialog = within(screen.getByRole('dialog', {name: '반복 보내기'}))
  expect(dialog.getByLabelText('횟수')).toHaveValue('1')
  fireEvent.change(dialog.getByLabelText('횟수'), {target: {value: '0'}})
  expect(dialog.getByRole('button', {name: /보내기$/})).toBeDisabled()
  fireEvent.change(dialog.getByLabelText('횟수'), {target: {value: '101'}})
  fireEvent.click(dialog.getByRole('button', {name: '101회 보내기'}))
  expect(start).toHaveBeenLastCalledWith(post, 'qa', '101')
})

it('uses the shared auth and run state, distinguishes the last run environment, and exposes errors on Home', () => {
  const view = render(<Dashboard currentRun={run} />)
  expect(widget().getByText('인증됨')).toBeVisible()
  expect(widget().getByRole('button', {name: '등록 즉시 실행'})).toBeDisabled()
  expect(widget().getByRole('button', {name: '등록 반복 보내기'})).toBeDisabled()
  expect(widget().getByRole('status')).toHaveTextContent(/이전 요청.*개발 환경/)
  expect(widget().getByRole('status')).toHaveTextContent(/3\s*\/\s*8/)
  view.rerender(<Dashboard currentRun={{...run, phase: 'stopped', authenticatedEnvironmentIds: []}} error="변수 deviceUrl을 입력하세요." />)
  expect(widget().getByText('로그인 필요')).toBeVisible()
  expect(widget().getByRole('alert')).toHaveTextContent('변수 deviceUrl을 입력하세요.')
  expect(widget().getByRole('status')).toHaveTextContent(/실패 1.*결과 확인 필요 1/)
  expect(widget().getByRole('button', {name: '등록 즉시 실행'})).toBeEnabled()
})

it('disables both actions while a send awaits confirmation, and avoids an empty count before the library loads', () => {
  const view = render(<Dashboard submitting />)
  expect(widget().getByRole('button', {name: '등록 즉시 실행'})).toBeDisabled()
  expect(widget().getByRole('button', {name: '등록 반복 보내기'})).toBeDisabled()
  view.rerender(<Dashboard available={false} saved={{groups: [], requests: [], environments: [], environmentId: null}} error="저장소를 열 수 없습니다." />)
  expect(widget().queryByText('즐겨찾기 0개')).toBeNull()
  expect(widget().queryByText(/☆/)).toBeNull()
  expect(widget().getByRole('alert')).toHaveTextContent('저장소를 열 수 없습니다.')
})
