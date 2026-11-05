import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { installCloseGuard } from '../../src/main/close'
import type { BrowserWindow } from 'electron'
function windowStub() {
  const events = new EventEmitter()
  let destroyed = false
  let state = { dirty: true, saving: false }
  return {
    events,
    get destroyed() {
      return destroyed
    },
    set state(v: { dirty: boolean; saving: boolean }) {
      state = v
    },
    window: Object.assign(events, {
      isDestroyed: () => destroyed,
      webContents: { executeJavaScript: async () => state },
      destroy() {
        destroyed = true
        events.emit('closed')
      },
    }) as unknown as BrowserWindow,
  }
}
it('keeps a dirty window open when discard is declined', async () => {
  const w = windowStub()
  installCloseGuard(w.window, async () => false)
  const preventDefault = vi.fn()
  w.events.emit('close', { preventDefault })
  await vi.waitFor(() => expect(preventDefault).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 20))
  expect(w.destroyed).toBe(false)
})
it('waits for pending save before deciding whether to close', async () => {
  const w = windowStub()
  w.state = { dirty: true, saving: true }
  let asked = 0
  installCloseGuard(w.window, async () => {
    asked++
    return true
  })
  w.events.emit('close', { preventDefault() {} })
  await new Promise((r) => setTimeout(r, 30))
  expect(w.destroyed).toBe(false)
  expect(asked).toBe(0)
  w.state = { dirty: false, saving: false }
  await vi.waitFor(() => expect(w.destroyed).toBe(true))
  expect(asked).toBe(0)
})
it('asks conservatively when renderer close state is malformed', async () => {
  const w = windowStub()
  w.window.webContents.executeJavaScript = async () => ({})
  let asked = 0
  const requestClose = installCloseGuard(w.window, async () => { asked++; return false })
  requestClose()
  await vi.waitFor(() => expect(asked).toBe(1))
  expect(w.destroyed).toBe(false)
})
