import { it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTimeline } from '../../src/renderer/state/useTimeline'
import { memoryApi } from './fake-api'
const input = { name: 'P', color: '#2563EB', participants: [] }
it('does not optimistically change data or issue a second pending mutation', async () => {
  const m = memoryApi()
  let finish: (v: unknown) => void = () => {}
  const original = m.api.createProject
  m.api.createProject = () =>
    new Promise((resolve) => {
      finish = resolve as typeof finish
    })
  const { result } = renderHook(() => useTimeline(m.api))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  let pending!: Promise<unknown>
  act(() => {
    pending = result.current.mutate('createProject', input)
  })
  expect(result.current.snapshot?.projects).toEqual([])
  expect(result.current.phase).toBe('saving')
  await act(async () => {
    await result.current.mutate('createProject', input)
  })
  await act(async () => {
    finish(await original(input))
    await pending
  })
  expect(m.creates).toBe(1)
  expect(result.current.snapshot?.projects).toHaveLength(1)
})
it('distinguishes committed refresh failure and retries only the read', async () => {
  const m = memoryApi(),
    read = m.api.getSnapshot
  const { result } = renderHook(() => useTimeline(m.api))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  m.api.getSnapshot = async () => ({
    ok: false,
    error: { code: 'STORAGE_IO', message: '읽기 실패' },
  })
  await act(async () => {
    await result.current.mutate('createProject', input)
  })
  expect(m.creates).toBe(1)
  expect(result.current.phase).toBe('stale')
  expect(result.current.error?.message).toMatch(/저장.*완료/)
  m.api.getSnapshot = read
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.snapshot?.projects).toHaveLength(1)
  expect(m.creates).toBe(1)
})
it('marks lost responses uncertain and never automatically resends create', async () => {
  const m = memoryApi()
  const original = m.api.createProject
  m.api.createProject = async (input) => {
    await original(input)
    throw Error('transport lost')
  }
  const { result } = renderHook(() => useTimeline(m.api))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  await act(async () => {
    await result.current.mutate('createProject', input)
  })
  expect(result.current.phase).toBe('uncertain')
  expect(m.creates).toBe(1)
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.snapshot?.projects).toHaveLength(1)
  expect(m.creates).toBe(1)
})
