import { expect, it } from 'vitest'
import { dispatchNodeManagement } from '../../src/main/node-management/ipc-core'
import { isTrustedSender } from '../../src/main/ipc-core'

const frame = { url: 'file:///app/index.html' }
const contents = { mainFrame: frame }
const window = { isDestroyed: () => false, webContents: contents }
const events = [
  { sender: contents, senderFrame: { ...frame } },
  { sender: {}, senderFrame: frame },
  { sender: contents, senderFrame: null },
]

it('rejects subframes, foreign windows, and extra input before reaching Node management', async () => {
  const service = new Proxy({}, { get() { throw Error('must not run') } }) as never
  for (const event of events) {
    expect(await dispatchNodeManagement(service, ['install', '24.11.0'], isTrustedSender(event, window, frame.url))).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  }
  for (const args of [
    ['install', 'v24.11.0'], ['use', '24.11.0\n'], ['install', '1.2.3 & cmd'], ['getState', {}],
    ['installManager', 'https://evil.test/nvm.exe'], ['constructor'], ['refreshCatalog', '--insecure'],
  ]) {
    expect(await dispatchNodeManagement(service, args, true)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  }
})

it('dispatches only the validated version to the service', async () => {
  const service = { install: async (value: unknown) => ({ installedVersions: [value] }) } as never
  const event = { sender: contents, senderFrame: frame }
  expect(await dispatchNodeManagement(service, ['install', '24.11.0'], isTrustedSender(event, window, frame.url))).toEqual({
    ok: true, data: { installedVersions: ['24.11.0'] },
  })
})

it('exposes only opaque environment selection, argument-free start and cancellation', async () => {
  const service = {
    selectEnvironment: async (id: string) => id, startEnvironment: async () => 'started', cancelOperation: async () => 'cancelled',
  } as never
  for (const [args, data] of [[['selectEnvironment', 'windows'], 'windows'], [['startEnvironment'], 'started'], [['cancelOperation'], 'cancelled']] as const) {
    expect(await dispatchNodeManagement(service, [...args], true)).toEqual({ ok: true, data })
  }
  for (const args of [['selectEnvironment', '/bin/sh'], ['startEnvironment', 'Ubuntu'], ['cancelOperation', 42]]) {
    expect(await dispatchNodeManagement(service, args, true)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  }
})

it('accepts only an expected environment ID for folder and release actions', async () => {
  const service = { openManagerFolder: async (id: string) => id, openManagerRelease: async (id: string) => id } as never
  for (const command of ['openManagerFolder', 'openManagerRelease']) {
    expect(await dispatchNodeManagement(service, [command, 'windows'], true)).toEqual({ ok: true, data: 'windows' })
    expect(await dispatchNodeManagement(service, [command, 'windows'], false)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    for (const args of [[], ['/home/test'], ['https://example.com'], ['windows', 'path']]) {
      expect(await dispatchNodeManagement(service, [command, ...args], true)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
    }
  }
})
