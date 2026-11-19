import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'

const workArea = { x: -1280, y: 0, width: 1280, height: 800 }
vi.mock('electron', () => ({ screen: { getDisplayMatching: () => ({ workArea }) } }))
import { installTermWindows } from '../../src/main/term-window'
import { termWindowChannel } from '../../src/shared/term-window'

const url = 'file:///renderer/index.html'
function createHost() {
  const mainFrame = { url }
  const webContents = Object.assign(new EventEmitter(), {
    ipc: new EventEmitter(), mainFrame, getURL: () => mainFrame.url, setWindowOpenHandler: vi.fn(),
  })
  const host = Object.assign(new EventEmitter(), {
    webContents, getBounds: () => ({ ...workArea, width: 1000 }), isDestroyed: () => false, isVisible: () => true,
  })
  installTermWindows(host as never, url)
  function grant(bounds?: unknown, frame = mainFrame) {
    const replies: Array<string | null> = []
    const event = { sender: webContents, senderFrame: frame, set returnValue(value: string | null) { replies.push(value) } }
    webContents.ipc.emit(termWindowChannel, event, bounds)
    expect(replies).toHaveLength(1)
    return replies[0]
  }
  function open(name: string | null, to = 'about:blank', features = '') {
    return webContents.setWindowOpenHandler.mock.calls[0][0]({
      frameName: name, url: to, features, disposition: 'new-window', postBody: null,
    })
  }
  return { host, grant, open, mainFrame }
}

it('grants one blank terminal window to the exact main frame and clamps restored bounds', () => {
  const { open, grant, mainFrame } = createHost()
  expect(grant(undefined, { url })).toBeNull()
  expect(grant({ x: Infinity, y: 0, width: 400, height: 300 })).toBeNull()
  expect(open('termrail-forged').action).toBe('deny')
  const name = grant({ x: -2100, y: 600, width: 1500, height: 460 })
  expect(typeof name).toBe('string')
  expect(open(name)).toMatchObject({
    action: 'allow', overrideBrowserWindowOptions: {
      x: -1280, y: 340, width: 1280, height: 460, frame: true,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, webviewTag: false },
    },
  })
  expect(open(name).action).toBe('deny')
  expect(open(grant(), 'https://example.org/').action).toBe('deny')
  expect(open(grant(), 'about:blank', 'nodeIntegration=yes').action).toBe('deny')
  mainFrame.url = 'file:///renderer/help.html'
  expect(grant()).toBeNull()
})

it('revokes a grant when navigation starts and when its short deadline expires', () => {
  const { open, grant, host } = createHost()
  const old = grant()
  host.webContents.emit('did-start-navigation', { isMainFrame: true })
  expect(open(old).action).toBe('deny')
  vi.useFakeTimers()
  try {
    const expired = grant()
    vi.advanceTimersByTime(30_000)
    expect(open(expired).action).toBe('deny')
  } finally { vi.useRealTimers() }
})
