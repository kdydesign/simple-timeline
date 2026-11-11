import { it, expect, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/renderer/App'
import { memoryApi } from './fake-api'
import { hotfix } from '../fixtures/timeline'
afterEach(() => localStorage.clear())
async function ready() {
  const m = memoryApi(hotfix)
  const view = render(<App api={m.api} />)
  await waitFor(() => expect(screen.getByRole('button', {name:'프로젝트 추가'})).toBeEnabled())
  return {m, ...view}
}
it('forces dark on first mount and remount while preserving saved zoom and collapsed projects', async () => {
  localStorage.setItem('simple-timeline.preferences.v1',JSON.stringify({theme:'light',dayWidth:42,collapsed:['1']}))
  const v=await ready()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.queryByRole('button',{name:/^(다크|라이트) 모드$/})).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('simple-timeline.preferences.v1')!)).toMatchObject({theme:'dark',dayWidth:42,collapsed:['1']})
  v.unmount(); await ready()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.getByRole('button',{name:'1.1.1 핫픽스 펼치기'})).toBeInTheDocument()
})
it('opens a date picker and supports year 0001 without auto-saving', async () => {
  const u=userEvent.setup(); await ready()
  await u.click(document.querySelector<HTMLElement>('[data-focus="schedule-add"]')!)
  await u.click(screen.getByLabelText('시작일'))
  const picker=screen.getByRole('group',{name:'시작일 달력'})
  fireEvent.change(within(picker).getByLabelText('달력 연도'),{target:{value:'1'}})
  await u.click(within(picker).getByRole('combobox',{name:'달력 월'}))
  await u.click(screen.getByRole('option',{name:'1월'}))
  await u.click(within(picker).getByRole('button',{name:'0001-01-02'}))
  expect(screen.getByLabelText('시작일')).toHaveValue('0001-01-02')
  expect(screen.queryByRole('group',{name:'시작일 달력'})).not.toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeVisible()
})
it('creates from a calendar date and remembers the selected project within this run', async () => {
  const u=userEvent.setup(); await ready()
  await u.click(screen.getByRole('button',{name:'달력'}))
  fireEvent.change(screen.getByLabelText('선택 날짜'),{target:{value:'2026-11-01'}})
  fireEvent.blur(screen.getByLabelText('선택 날짜'))
  await u.click(screen.getByRole('button',{name:'2026-11-12 일정 추가'}))
  expect(screen.getByLabelText('시작일')).toHaveValue('2026-11-12')
  expect(screen.getByLabelText('종료일')).toHaveValue('2026-11-12')
  await u.click(screen.getByRole('combobox',{name:'소속 프로젝트'}))
  await u.click(screen.getByRole('option',{name:'일정 없음 · #2'}))
  await u.click(screen.getByRole('button',{name:'편집 닫기'}))
  await u.click(screen.getByRole('button',{name:'변경 버리기'}))
  await u.click(screen.getByRole('button',{name:'2026-11-13 일정 추가'}))
  expect(screen.getByRole('combobox',{name:'소속 프로젝트'})).toHaveTextContent('일정 없음 · #2')
})
it('collapses only gantt rows and restores collapsed state', async () => {
  const u=userEvent.setup(), v=await ready()
  await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 접기'}))
  expect(screen.queryByRole('button',{name:'QA 편집'})).not.toBeInTheDocument()
  v.unmount(); await ready()
  expect(screen.getByRole('button',{name:'1.1.1 핫픽스 펼치기'})).toHaveAttribute('aria-expanded','false')
})
it('left aligns today even near the beginning of the displayed month', async () => {
  const {GanttView}=await import('../../src/renderer/components/GanttView')
  const {unmount}=render(<GanttView snapshot={hotfix} selectedMonth={{year:2026,month:11}}
    onEditProject={()=>{}} onEditSchedule={()=>{}} onAddSchedule={()=>{}}
    todayRequest={{date:'2026-11-01',token:1}} />)
  const tick=document.querySelector<HTMLElement>('[data-day="2026-11-01"]')!
  expect(parseFloat(tick.style.left)).toBe(0)
  unmount()
})
