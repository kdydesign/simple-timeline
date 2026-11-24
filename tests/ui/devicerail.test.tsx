import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DeviceMacroRun, DeviceObservation, DeviceRailApi, DeviceSnapshot, RailDevice } from '../../src/shared/device-rail'
import { DeviceRail } from '../../src/renderer/devicerail/DeviceRail'
import { DeviceWidget } from '../../src/renderer/devicerail/DeviceWidget'
import { useDeviceRail } from '../../src/renderer/devicerail/useDeviceRail'

const device: RailDevice = {
  id: 'qa', name: '검증 API', host: 'qa.example', port: 22, favorite: true, location: '검증실',
  description: '배포 검증', service: { kind: 'http', url: 'https://qa.example/status' },
  macros: [{ id: 'info', name: '작업 경로', commands: 'pwd' }],
}
function observation(state: DeviceObservation['state'], time: number | null = Date.now()): DeviceObservation {
  return { state, checking: false, checkedAt: time, lastSuccessAt: state === 'ok' ? time : null, message: '' }
}
function snapshot(): DeviceSnapshot {
  return {
    devices: [device, { ...device, id: 'second', name: '대기 장비', favorite: false, service: { kind: 'none' }, macros: [] }],
    health: { qa: { ssh: observation('ok', Date.now() - 10 * 60_000), service: { ...observation('failed'), message: 'HTTP 503', checking: true } } },
    macroState: {},
  }
}
function setup(value = snapshot()) {
  let listener = () => {}
  const api = {
    snapshot: vi.fn(async () => structuredClone(value)),
    onChange: vi.fn((fn: () => void) => { listener = fn; return () => {} }),
    save: vi.fn(async (next: RailDevice) => {
      value.devices = next.id ? value.devices.map(item => item.id === next.id ? next : item) : [...value.devices, {...next, id:'new'}]
    }),
    remove: vi.fn(async (id: string) => { value.devices = value.devices.filter(d => d.id !== id) }),
    refresh: vi.fn(async () => {}), runMacro: vi.fn(async () => {}),
    trust: vi.fn(async () => {}), login: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
  } satisfies DeviceRailApi
  window.deviceRail = api
  const open = vi.fn()
  const ssh = vi.fn()
  function Harness() {
    const rail = useDeviceRail()
    return <><DeviceWidget rail={rail} onOpen={open}/><DeviceRail rail={rail} onOpenSsh={ssh}/></>
  }
  render(<Harness/>)
  return { api, open, ssh, changed: () => listener() }
}
afterEach(() => { delete window.deviceRail })

it('shows separate observations, stale times and unconfigured services and opens favorites without running a command', async () => {
  const { open, api } = setup()
  const home = within(screen.getByRole('region', { name: '장비 상태' }))
  const list = within(await screen.findByRole('table', { name: '등록 장비' }))
  expect(home.getByText('SSH 가능')).toBeVisible()
  expect(home.getByText('서비스 불가')).toBeVisible()
  expect(home.getByText('오래됨')).toBeVisible()
  expect(home.queryByText('대기 장비')).toBeNull()
  fireEvent.click(list.getByRole('button', { name: '대기 장비' }))
  expect(screen.getByRole('heading', { name: '대기 장비' })).toBeVisible()
  expect(within(list.getByRole('row', {name:/대기 장비/})).getByText('미설정')).toBeVisible()
  fireEvent.click(home.getByRole('button', { name: '검증 API' }))
  expect(open).toHaveBeenCalledOnce()
  expect(screen.getByRole('heading', { name: '검증 API' })).toBeVisible()
  expect(screen.getByText('HTTP 503')).toBeVisible()
  expect(api.runMacro).not.toHaveBeenCalled()
})

it('only requests the selected macro preview on click, and prompts for credentials only during login', async () => {
  const { api } = setup()
  fireEvent.click(await screen.findByRole('button', { name: '작업 경로' }))
  expect(api.runMacro).toHaveBeenCalledWith('qa', 'info')
  expect(screen.queryByLabelText('비밀번호')).toBeNull()
})

it('registers a TCP service with a separate SSH port and keeps the device dialog open after a failed save', async () => {
  const { api } = setup()
  await screen.findByRole('heading', { name: '검증 API' })
  fireEvent.click(screen.getByRole('button', { name: '장비 등록' }))
  const form = within(screen.getByRole('dialog', { name: '장비 등록' }))
  fireEvent.change(form.getByLabelText('장비 이름'), { target: { value: '신규 장비' } })
  fireEvent.change(form.getByLabelText('SSH 주소'), { target: { value: 'new.example' } })
  fireEvent.change(form.getByLabelText('SSH 포트'), { target: { value: '2222' } })
  fireEvent.change(form.getByLabelText('제품 서비스 검사'), { target: { value: 'tcp' } })
  fireEvent.change(form.getByLabelText('제품 포트'), { target: { value: '8443' } })
  api.save.mockRejectedValueOnce(new Error('저장 공간 부족'))
  fireEvent.click(form.getByRole('button', { name: '저장' }))
  expect(await form.findByRole('alert')).toHaveTextContent('저장 공간 부족')
  fireEvent.click(form.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'new.example', port: 2222, service: {kind:'tcp', port:8443} }))
})

it('scopes credentials to one pending run and disables another macro on that device', async () => {
  const value = snapshot()
  const run: DeviceMacroRun = { id:'r', deviceId:'qa', macroId:'info', deviceName:device.name, host:device.host, port:22,
    macroName:'작업 경로', phase:'login', startedAt:Date.now(), stdout:'', stderr:'', truncated:false }
  value.macroState.qa = { runs: [run] }
  const { api } = setup(value)
  const password = await screen.findByLabelText('비밀번호')
  expect(screen.getByRole('button', {name:'작업 경로'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('SSH 계정'), {target:{value:'operator'}})
  fireEvent.change(password, {target:{value:'local-test-only'}})
  fireEvent.click(screen.getByRole('button', {name:'로그인'}))
  expect(api.login).toHaveBeenCalledWith('qa','r','operator','local-test-only')
})

it('saves macros and favorites independently, preserves the device on cancelled deletion, and removes it on confirmation', async () => {
  const {api} = setup()
  await screen.findByRole('heading', {name:device.name})
  fireEvent.click(screen.getByRole('button', {name:'Home 즐겨찾기'}))
  const home = within(screen.getByRole('region', {name:'장비 상태'}))
  await waitFor(() => expect(home.queryByRole('button', {name:device.name})).toBeNull())
  fireEvent.click(screen.getByRole('button', {name:'매크로 추가'}))
  let form = within(screen.getByRole('dialog', {name:'매크로 추가'}))
  fireEvent.change(form.getByLabelText('매크로 이름'), {target:{value:'시간 확인'}})
  fireEvent.change(form.getByLabelText('셸 명령'), {target:{value:'date\npwd'}})
  fireEvent.click(form.getByRole('button', {name:'저장'}))
  await screen.findByRole('button', {name:'시간 확인'})
  fireEvent.click(screen.getByRole('button', {name:'시간 확인 수정'}))
  form = within(screen.getByRole('dialog', {name:'매크로 수정'}))
  fireEvent.change(form.getByLabelText('셸 명령'), {target:{value:'date -u'}})
  fireEvent.click(form.getByRole('button', {name:'저장'}))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({favorite:false,macros:expect.arrayContaining([expect.objectContaining({commands:'date -u'})])}))
  fireEvent.click(screen.getByRole('button', {name:'시간 확인 삭제'}))
  fireEvent.click(within(screen.getByRole('dialog', {name:'매크로 삭제'})).getByRole('button', {name:'삭제'}))
  await waitFor(() => expect(screen.queryByRole('button', {name:'시간 확인'})).toBeNull())
  expect(screen.getByRole('button', {name:'작업 경로'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button', {name:'장비 삭제'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name:'취소'}))
  expect(api.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name:'장비 삭제'}))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name:'삭제'}))
  await waitFor(() => expect(screen.queryByRole('heading', {name:device.name})).toBeNull())
  expect(api.remove).toHaveBeenCalledWith('qa')
  expect(api.runMacro).not.toHaveBeenCalled()
})

it('binds changed host-key approval to the pending fingerprint and shows uncertain termination independently of probe success', async () => {
  const value = snapshot()
  const run: DeviceMacroRun = { id:'r', deviceId:'qa', macroId:'info', deviceName:device.name, host:device.host, port:22,
    macroName:'작업 경로', phase:'host-key', previousFingerprint:'previous', fingerprint:'presented', startedAt:Date.now(),
    stdout:'', stderr:'', truncated:false }
  value.macroState.qa = { runs:[run] }
  const {api, changed} = setup(value)
  const trust = await screen.findByRole('form', { name:'호스트 키 확인' })
  expect(within(trust).getByText('호스트 키 변경')).toBeVisible()
  expect(within(trust).getByText('previous')).toBeVisible()
  expect(within(trust).getByText('presented')).toBeVisible()
  expect(screen.queryByLabelText('비밀번호')).toBeNull()
  fireEvent.click(within(trust).getByRole('button', {name:'지문 승인'}))
  expect(api.trust).toHaveBeenCalledWith('qa','r','presented')
  value.macroState.qa = { runs:[{...run, phase:'uncertain', finishedAt:Date.now(), stdout:'일부 출력', stderr:'연결 종료', truncated:true}] }
  changed()
  await waitFor(() => expect(screen.queryByRole('form', {name:'호스트 키 확인'})).toBeNull())
  const summary = within(screen.getByRole('region', {name:'매크로 실행 기록'})).getByText(/작업 경로 · 연결 종료 · 결과 확인 필요/)
  fireEvent.click(summary)
  expect(await screen.findByText('일부 출력')).toBeVisible()
  expect(screen.getByText('출력이 길어 일부만 표시합니다.')).toBeVisible()
  expect(within(screen.getByRole('region', {name:'SSH 검사 결과'})).getByText('가능')).toBeVisible()
  expect(api.runMacro).not.toHaveBeenCalled()
})

it('counts a device with two failures once and includes non-favorites in the Home and table totals', async () => {
  const value = snapshot()
  value.health.qa = { ssh:observation('failed'), service:observation('failed') }
  value.health.second = { ssh:observation('failed'), service:observation('unconfigured') }
  const {changed} = setup(value)
  const home = within(screen.getByRole('region', {name:'장비 상태'}))
  expect(await home.findByText('전체 장비 중 점검 필요 2대')).toBeVisible()
  expect(screen.getByText('등록 장비 2대 · 점검 필요 2대')).toBeVisible()
  value.health.qa = {ssh:observation('ok'), service:observation('unknown', null)}
  value.health.second = {ssh:observation('ok'), service:observation('unconfigured')}
  changed()
  expect(await home.findByText('전체 장비 중 점검 필요 0대')).toBeVisible()
  expect(screen.getByText('등록 장비 2대 · 점검 필요 0대')).toBeVisible()
})
