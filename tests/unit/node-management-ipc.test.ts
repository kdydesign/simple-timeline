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
