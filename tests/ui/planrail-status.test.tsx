import {act,render,renderHook,screen,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {PlanRailStatus} from '../../src/renderer/workrail/PlanRailStatus'
import {useReminders} from '../../src/renderer/state/useReminders'
import type {ReminderApi,ReminderState} from '../../src/shared/reminder-api'

describe('PlanRail notification policy',()=>{
 it('distinguishes enabled, muted and unavailable without implying delivered notifications',()=>{
  const {rerender}=render(<PlanRailStatus sharing={null} muted={false} loading={false}/>)
  expect(screen.getByText('일정 알림 켜짐')).toBeVisible()
  expect(screen.getByTestId('notification-policy')).toHaveAttribute('data-policy','on')
  rerender(<PlanRailStatus sharing={null} muted loading={false}/>)
  expect(screen.getByText('전체 알림 무음')).toBeVisible()
  expect(screen.getByTestId('notification-policy')).toHaveAttribute('data-policy','muted')
  expect(screen.getByTestId('notification-policy').querySelector('[data-muted-mark]')).not.toBeNull()
  rerender(<PlanRailStatus sharing={null} muted={null} loading={false}/>)
  expect(screen.getByText('알림 상태 확인 불가')).toBeVisible()
 })
 it('does not keep an old enabled policy after refresh fails and rechecks on focus',async()=>{
  const good:ReminderState={muted:false,failed:0,unknown:0,storageError:false,openRequest:null}
  const read=vi.fn().mockResolvedValue({ok:true,data:good})
  const api={getState:read,onChange:()=>()=>{},retry:read,acknowledge:read} satisfies ReminderApi
  const {result}=renderHook(()=>useReminders(api))
  await waitFor(()=>expect(result.current.muted).toBe(false))
  read.mockResolvedValue({ok:false,error:{code:'IPC_UNAVAILABLE',message:'확인 실패'}})
  act(()=>window.dispatchEvent(new Event('focus')))
  await waitFor(()=>expect(result.current.muted).toBeNull())
 })
})
