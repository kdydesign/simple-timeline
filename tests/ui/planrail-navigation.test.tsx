import { afterEach, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/renderer/App'
import { GanttView } from '../../src/renderer/components/GanttView'
import { memoryApi } from './fake-api'
import { hotfix } from '../fixtures/timeline'
afterEach(() => localStorage.clear())
async function ready() {
  Object.defineProperty(window,"innerWidth",{value:1280,writable:true,configurable:true})
  const m = memoryApi(hotfix)
  const view = render(<App api={m.api} today={new Date(2027, 0, 31)} />)
  await waitFor(() => expect(screen.getByRole('button', {name:'프로젝트 추가'})).toBeEnabled())
  return {m, ...view}
}
function enter(date:string) {
  const input=screen.getByLabelText('선택 날짜')
  fireEvent.change(input,{target:{value:date}})
  fireEvent.keyDown(input,{key:'Enter'})
}
it('starts on today and clamps successive month navigation to the actual selected date', async () => {
  await ready()
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2027-01-31')
  expect(document.querySelector<HTMLElement>('[data-day="2027-01-31"]')!.style.left).toBe('0px')
  fireEvent.click(screen.getByRole('button',{name:'다음 달'}))
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2027-02-28')
  fireEvent.click(screen.getByRole('button',{name:'다음 달'}))
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2027-03-28')
})
it('rejects invalid direct entry and preserves selection and the visible anchor', async () => {
  await ready(); enter('2027-02-30')
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2027-01-31')
  expect(screen.getByRole('alert')).toHaveTextContent('날짜')
  expect(document.querySelector<HTMLElement>('[data-day="2027-01-31"]')!.style.left).toBe('0px')
})
it('shares selection across views, preserves it on dirty cancel, and does not jump on date creation', async () => {
  const u=userEvent.setup(); await ready(); enter('2026-11-30')
  const slider=screen.getByRole('scrollbar',{name:'간트 가로 이동'})
  const before=(slider as HTMLInputElement).value
  fireEvent.click(document.querySelector('[data-day="2026-12-18"]')!)
  expect(slider).toHaveValue(before)
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2026-12-18')
  expect(document.querySelector('[data-day="2026-12-18"]')).toHaveAttribute('aria-pressed','true')
  await u.type(screen.getByLabelText('일정 이름'),'미저장')
  fireEvent.click(document.querySelector('[data-day="2026-12-19"]')!)
  await u.click(screen.getByRole('button',{name:'계속 편집'}))
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2026-12-18')
  enter('2026-12-20')
  expect(screen.getByLabelText('일정 이름')).toHaveValue('미저장')
  await u.click(screen.getByRole('button',{name:'달력'}))
  expect(document.querySelector('[data-date="2026-12-20"]')).toHaveAttribute('aria-pressed','true')
})
it('aligns the final supported day left without making trailing padding selectable and retains visited months', async () => {
  await ready(); enter('9999-12-31')
  expect(document.querySelector<HTMLElement>('[data-day="9999-12-31"]')!.style.left).toBe('0px')
  expect(document.querySelectorAll('[data-day]').length).toBeLessThan(110)
  enter('0001-01-01'); enter('2026-12-18')
  expect(document.querySelector('[data-range]')).toHaveTextContent('0001-01-01 — 9999-12-31')
})
it('applies variable day geometry and ignores clicks in trailing viewport padding', () => {
  const dates:string[]=[]
  const {container}=render(<GanttView snapshot={hotfix} selectedMonth={{year:2026,month:12}} selectedDate="2026-12-31"
    todayRequest={{date:'2026-12-31',token:1}} dayWidth={14} onAddDate={d=>dates.push(d)}
    onEditProject={()=>{}} onEditSchedule={()=>{}} onAddSchedule={()=>{}} />)
  const last=container.querySelector<HTMLElement>('[data-day="2026-12-31"]')!
  expect(last.style.left).toBe('0px'); expect(last.style.width).toBe('14px')
  fireEvent.click(container.querySelector('.gantt-track')!,{clientX:28})
  expect(dates).toEqual([])
})
it('selects a clicked date even before there is a project to receive a new schedule', async()=>{
  const m=memoryApi({projects:[],schedules:[]})
  render(<App api={m.api} today={new Date(2027,0,31)}/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled())
  fireEvent.click(document.querySelector('[data-day="2027-01-30"]')!)
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2027-01-30')
  expect(screen.getByRole('alert')).toHaveTextContent('먼저 프로젝트')
})
it('does not navigate on blur of unchanged toolbar text after the viewport was moved',async()=>{
  await ready();enter('2026-11-30')
  const slider=screen.getByRole('scrollbar',{name:'간트 가로 이동'})
  fireEvent.change(slider,{target:{value:'900'}})
  fireEvent.blur(screen.getByLabelText('선택 날짜'))
  expect(slider).toHaveValue('900')
  fireEvent.keyDown(screen.getByLabelText('선택 날짜'),{key:'Enter'})
  expect(slider).toHaveValue('812')
})
