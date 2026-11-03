import { it, expect } from 'vitest'
import {
  dispatch,
  isTrustedSender,
  resolveRendererUrl,
} from '../../src/main/ipc-core'
import { toPublicError } from '../../src/main/errors'
import { hotfix } from '../fixtures/timeline'
const mainFrame = { url: 'file:///app/index.html' }
const contents = { mainFrame },
  win = { isDestroyed: () => false, webContents: contents }
const event = { sender: contents, senderFrame: mainFrame }
it('never uses remote UI in packaged or production builds', () => {
  expect(
    resolveRendererUrl('file:///local/index.html', {
      packaged: true,
      development: true,
      devUrl: 'http://evil.test',
    }),
  ).toBe('file:///local/index.html')
  expect(
    resolveRendererUrl('file:///local/index.html', {
      packaged: false,
      development: false,
      devUrl: 'http://evil.test',
    }),
  ).toBe('file:///local/index.html')
  expect(() =>
    resolveRendererUrl('file:///local/index.html', {
      packaged: false,
      development: true,
      devUrl: 'http://evil.test',
    }),
  ).toThrow()
  expect(
    resolveRendererUrl('file:///local/index.html', {
      packaged: false,
      development: true,
      devUrl: 'http://127.0.0.1:5173',
    }),
  ).toBe('http://127.0.0.1:5173/')
})
it('rejects child frames, different windows, URLs and destroyed senders', () => {
  expect(isTrustedSender(event, win, mainFrame.url)).toBe(true)
  expect(
    isTrustedSender(
      { ...event, senderFrame: { ...mainFrame } },
      win,
      mainFrame.url,
    ),
  ).toBe(false)
  expect(isTrustedSender({ ...event, sender: {} }, win, mainFrame.url)).toBe(
    false,
  )
  expect(
    isTrustedSender(event, { ...win, isDestroyed: () => true }, mainFrame.url),
  ).toBe(false)
  expect(isTrustedSender(event, win, 'file:///other/index.html')).toBe(false)
})
it('rejects untrusted or malformed calls before touching the repository', () => {
  const storage = {
    state: 'ready' as const,
    repository: new Proxy(
      {},
      {
        get() {
          throw Error('must not reach DB')
        },
      },
    ),
  } as never
  for (const [method, args] of [
    [
      'createProject',
      [{ name: 'P', color: '#2563EB', participants: [], sql: 'DROP' }],
    ],
    ['deleteProject', [{ id: '1' }]],
    [
      'createSchedule',
      [
        {
          projectId: '1',
          name: 'QA',
          startDate: '2026-02-29',
          endDate: '2026-03-01',
        },
      ],
    ],
    ['getSnapshot', [{}]],
    ['deleteSchedule', [{ id: '1e2' }]],
  ] as const) {
    const r = dispatch(storage, method, args, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('VALIDATION_ERROR')
  }
  expect(dispatch(storage, 'getSnapshot', [], false)).toMatchObject({
    ok: false,
    error: { code: 'FORBIDDEN' },
  })
})
it('returns committed DTOs and normalizes input at the main boundary', () => {
  let received: unknown
  const storage = {
    state: 'ready',
    repository: {
      createProject(input: unknown) {
        received = input
        return hotfix.projects[0]
      },
    },
  } as never
  expect(
    dispatch(
      storage,
      'createProject',
      [{ name: ' P ', color: '#aabbcc', participants: [' A ', 'A'] }],
      true,
    ),
  ).toEqual({ ok: true, data: hotfix.projects[0] })
  expect(received).toEqual({ name: 'P', color: '#AABBCC', participants: ['A'] })
})
it('keeps SQL, stack and raw errors out of public responses', () => {
  const storage = {
    state: 'ready',
    repository: {
      getSnapshot() {
        throw Error('SQL SECRET stack')
      },
    },
  } as never
  const result = dispatch(storage, 'getSnapshot', [], true)
  expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
  expect(JSON.stringify(result)).not.toMatch(/SQL|SECRET|stack/)
  const big = {
    state: 'ready',
    repository: {
      getSnapshot() {
        return { id: 1n }
      },
    },
  } as never
  expect(dispatch(big, 'getSnapshot', [], true)).toMatchObject({
    ok: false,
    error: { code: 'INTERNAL_ERROR' },
  })
  expect(toPublicError({ code: 'SQLITE_FULL' }).code).toBe('STORAGE_FULL')
})
