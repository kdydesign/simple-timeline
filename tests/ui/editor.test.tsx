import { it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/renderer/App'
import { memoryApi } from './fake-api'
import { hotfix } from '../fixtures/timeline'
it('traps keyboard focus in a narrow editor and confirms Escape with a long draft', async () => {
  const u = userEvent.setup(),
    m = memoryApi()
  render(<App api={m.api} />)
  const add = await screen.findByRole('button', { name: '프로젝트 추가' })
  await waitFor(() => expect(add).toBeEnabled())
  await u.click(add)
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  await u.type(
    screen.getByLabelText('프로젝트 이름'),
    '아주 긴 프로젝트 이름 '.repeat(12),
  )
  screen.getByRole('button', { name: '편집 닫기' }).focus()
  await u.tab({ shift: true })
  expect(screen.getByRole('button', { name: '저장' })).toHaveFocus()
  await u.keyboard('{Escape}')
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(screen.getByRole('button', { name: '계속 편집' })).toHaveFocus()
})
it('lets the user explicitly discard an uncertain draft after a lost response', async () => {
  const u = userEvent.setup(),
    m = memoryApi()
  m.api.createProject = async () => {
    throw Error('lost')
  }
  render(<App api={m.api} />)
  const add = await screen.findByRole('button', { name: '프로젝트 추가' })
  await waitFor(() => expect(add).toBeEnabled())
  await u.click(add)
  await u.type(screen.getByLabelText('프로젝트 이름'), '보존할 입력')
  await u.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('저장 결과'),
  )
  expect(screen.getByRole('button', { name: '편집 닫기' })).toBeEnabled()
  await u.click(screen.getByRole('button', { name: '편집 닫기' }))
  expect(screen.getByRole('alertdialog')).toBeVisible()
  await u.click(screen.getByRole('button', { name: '변경 버리기' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '다시 조회' })).toHaveFocus(),
  )
})
it('keeps uncertain-draft reconciliation inside the active narrow modal', async () => {
  const u = userEvent.setup(),
    m = memoryApi()
  m.api.createProject = async () => {
    throw Error('lost')
  }
  render(<App api={m.api} />)
  const add = await screen.findByRole('button', { name: '프로젝트 추가' })
  await waitFor(() => expect(add).toBeEnabled())
  await u.click(add)
  await u.type(screen.getByLabelText('프로젝트 이름'), '입력을 보존')
  await u.click(screen.getByRole('button', { name: '저장' }))
  const dialog = screen.getByRole('dialog')
  const retry = await within(dialog).findByRole('button', { name: '다시 조회' })
  retry.focus()
  await u.keyboard('{Enter}')
  await waitFor(() =>
    expect(screen.getByLabelText('프로젝트 이름')).toBeEnabled(),
  )
  expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('입력을 보존')
})
it('creates a project with defaults and participant rows, then restores focus', async () => {
  const u = userEvent.setup(),
    m = memoryApi()
  render(<App api={m.api} />)
  const add = await screen.findByRole('button', { name: '프로젝트 추가' })
  await waitFor(() => expect(add).toBeEnabled())
  await u.click(add)
  expect(screen.getByLabelText('프로젝트 이름')).toHaveFocus()
  expect(screen.getByLabelText('색상 코드')).toHaveValue('#2563EB')
  await u.type(screen.getByLabelText('프로젝트 이름'), '새 프로젝트')
  await u.click(screen.getByRole('button', { name: '참여자 이름 추가' }))
  await u.type(screen.getByLabelText('참여자 1'), '민수')
  await u.click(screen.getByRole('button', { name: '저장' }))
  expect(
    await screen.findByRole('button', { name: '새 프로젝트 편집' }),
  ).toHaveFocus()
  expect(m.snapshot.projects[0].participants).toEqual(['민수'])
})
it('keeps input after failed save and confirms discard rather than losing it', async () => {
  const u = userEvent.setup(),
    m = memoryApi()
  m.api.createProject = async () => ({
    ok: false,
    error: { code: 'STORAGE_FULL', message: '저장 공간 부족' },
  })
  render(<App api={m.api} />)
  const add = await screen.findByRole('button', { name: '프로젝트 추가' })
  await waitFor(() => expect(add).toBeEnabled())
  await u.click(add)
  await u.type(screen.getByLabelText('프로젝트 이름'), '미저장')
  await u.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('저장 공간 부족')
  expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('미저장')
  await u.click(screen.getByRole('button', { name: '편집 닫기' }))
  const dialog = screen.getByRole('alertdialog')
  expect(
    within(dialog).getByRole('button', { name: '계속 편집' }),
  ).toHaveFocus()
  await u.click(within(dialog).getByRole('button', { name: '계속 편집' }))
  expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('미저장')
})
it('validates dates, preserves the parent and confirms cascade deletion', async () => {
  const u = userEvent.setup(),
    m = memoryApi(hotfix)
  render(<App api={m.api} />)
  await u.click(await screen.findByRole('button', { name: 'QA 편집' }))
  expect(screen.getByLabelText('소속 프로젝트')).toHaveTextContent(
    '1.1.1 핫픽스',
  )
  await u.clear(screen.getByLabelText('종료일'))
  await u.type(screen.getByLabelText('종료일'), '2026-12-01')
  await u.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByLabelText('종료일')).toHaveFocus()
  expect(screen.getByRole('alert')).toHaveTextContent('종료일')
  await u.click(screen.getByRole('button', { name: '편집 닫기' }))
  await u.click(screen.getByRole('button', { name: '변경 버리기' }))
  await u.click(screen.getByRole('button', { name: '1.1.1 핫픽스 편집' }))
  await u.click(screen.getByRole('button', { name: '삭제' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent('일정 3개')
  expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
  await u.click(screen.getByRole('button', { name: '함께 삭제' }))
  await waitFor(() => expect(m.snapshot.schedules).toHaveLength(0))
})
