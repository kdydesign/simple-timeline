import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { sharedId } from '../../src/domain/sharing'
import { App } from '../../src/renderer/App'
import * as presentation from '../../src/visualization/presentation'
import { project, schedule } from '../fixtures/timeline'
import { memoryApi } from './fake-api'
import { sharingFixture } from './sharing-fixture'

function fixture() {
  const personal = schedule('1', '1', '2026-11-11', '2026-11-11')
  const remoteId = sharedId('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '1')
  const remote = { ...schedule(remoteId, remoteId, '2026-11-12', '2026-11-12'), name: '공유 일정', sharing: 'member' as const }
  return memoryApi({
    projects: [project(), { ...project(remoteId), sharing: 'member' }],
    schedules: [{ ...personal, id: '10' }, remote, personal],
  })
}

function barLabels(attribute: 'data-bar' | 'data-segment') {
  return Array.from(document.querySelectorAll(`[${attribute}]`), item => item.textContent)
}

it('indexes each visible snapshot once across both views, filters and navigation', async () => {
  using buildIndex = vi.spyOn(presentation, 'indexSnapshot')
  const { api } = fixture()
  render(<App api={api} today={new Date(2026, 10, 11)} initialTool="home" />)
  expect(buildIndex).not.toHaveBeenCalled()
  await waitFor(() => expect(barLabels('data-bar')).toHaveLength(3))
  expect(buildIndex).toHaveBeenCalledTimes(1)
  const all = ['개발 · #1', '개발 · #10', '공유 일정']
  expect(barLabels('data-bar')).toEqual(all)
  expect(barLabels('data-segment')).toEqual(all)

  fireEvent.click(screen.getByRole('button', { name: 'PlanRail' }))
  const slider = screen.getByRole('scrollbar', { name: '간트 가로 이동' })
  fireEvent.change(slider, { target: { value: '28' } })
  expect(slider).toHaveValue('28')
  fireEvent.click(screen.getByRole('button', { name: '달력' }))
  fireEvent.click(screen.getByRole('button', { name: '달력 다음 달' }))
  expect(screen.getByLabelText('선택 날짜')).toHaveValue('2026-12-11')
  fireEvent.click(screen.getByRole('button', { name: '달력 이전 달' }))
  expect(buildIndex).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: '개인' }))
  expect(barLabels('data-bar')).toEqual(['개발 · #1', '개발 · #10'])
  expect(barLabels('data-segment')).toEqual(['개발 · #1', '개발 · #10'])
  expect(buildIndex).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '공유' }))
  expect(barLabels('data-bar')).toEqual(['공유 일정'])
  expect(barLabels('data-segment')).toEqual(['공유 일정'])
  expect(buildIndex).toHaveBeenCalledTimes(3)
})

it('keeps both views frozen during a drag and rebuilds once immediately on shared revocation', async () => {
  const sharing = sharingFixture({ role: 'member', status: 'connected' })
  const { api, snapshot } = fixture()
  await act(async () => { render(<App api={api} today={new Date(2026, 10, 11)} />) })
  const bar = document.querySelector('[data-bar="1"]')!
  // JSDOM has no hit-test geometry for the Gantt heading and vertical scroller.
  for (const area of document.querySelectorAll('.gantt-date-heading, .gantt-body')) {
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 220))
  }
  const pointer = { button: 0, pointerId: 1, isPrimary: true, clientY: 20 }
  fireEvent.pointerDown(bar, { ...pointer, clientX: 42 })
  fireEvent.pointerMove(window, { ...pointer, clientX: 70 })
  expect(document.querySelector('.drag-preview')).toBeVisible()

  using buildIndex = vi.spyOn(presentation, 'indexSnapshot')
  snapshot.schedules.push({ ...schedule('11', '1', '2026-11-13', '2026-11-13'), name: '추가 일정' })
  await act(async () => sharing.emit({ snapshotRevision: 1 }))
  for (const attribute of ['data-bar', 'data-segment'] as const) {
    expect(barLabels(attribute)).toEqual(['개발 · #1', '개발 · #10', '공유 일정'])
  }
  expect(buildIndex).not.toHaveBeenCalled()

  snapshot.projects = snapshot.projects.filter(p => p.sharing !== 'member')
  snapshot.schedules = snapshot.schedules.filter(s => s.sharing !== 'member')
  await act(async () => sharing.emit({ snapshotRevision: 2 }))
  expect(document.querySelector('.drag-preview')).toBeNull()
  for (const attribute of ['data-bar', 'data-segment'] as const) {
    expect(barLabels(attribute)).toEqual(['개발 · #1', '개발 · #10', '추가 일정'])
  }
  expect(buildIndex).toHaveBeenCalledTimes(1)
  fireEvent.pointerUp(window, { ...pointer, clientX: 70 })
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
