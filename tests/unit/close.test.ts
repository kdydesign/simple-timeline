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
it('does not ask to discard a known dirty window', async () => {
  const w = windowStub()
  installCloseGuard(w.window, async () => false)
  const preventDefault = vi.fn()
  w.events.emit('close', { preventDefault })
  await vi.waitFor(() => expect(preventDefault).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 20))
  expect(w.destroyed).toBe(true)
})
it('waits for pending save before deciding whether to close', async () => {
  const w = windowStub()
  w.state = { dirty: true, saving: true }
  let asked = 0
  const stopDispatch = vi.fn()
  installCloseGuard(w.window, async () => {
    asked++
    return true
  }, {onQuitRequested:stopDispatch})
  w.events.emit('close', { preventDefault() {} })
  expect(stopDispatch).toHaveBeenCalledOnce()
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
it('asks on every window close and preserves dirty input when hiding or cancelling', async () => {
  const w = windowStub(), hide = vi.fn(), confirm = vi.fn(async () => true)
  const chooseClose = vi.fn<() => Promise<'hide'|'quit'|'cancel'>>()
    .mockResolvedValueOnce('cancel').mockResolvedValueOnce('hide').mockResolvedValueOnce('quit')
  const stopDispatch = vi.fn()
  installCloseGuard(w.window, confirm, {hide, chooseClose, onQuitRequested:stopDispatch})
  w.events.emit('close', {preventDefault() {}})
  await vi.waitFor(() => expect(chooseClose).toHaveBeenCalledTimes(1))
  expect(hide).not.toHaveBeenCalled(); expect(w.destroyed).toBe(false)
  w.events.emit('close', {preventDefault() {}})
  await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1))
  expect(confirm).not.toHaveBeenCalled(); expect(w.destroyed).toBe(false)
  expect(stopDispatch).not.toHaveBeenCalled()
  w.events.emit('close', {preventDefault() {}})
  await vi.waitFor(() => expect(w.destroyed).toBe(true))
  expect(confirm).not.toHaveBeenCalled()
})
it('does not let repeated close or direct quit bypass a pending choice', async () => {
  const w=windowStub(), hide=vi.fn()
  let decide!:(v:'cancel')=>void
  const chooseClose=vi.fn(()=>new Promise<'cancel'>(resolve=>{decide=resolve}))
  const quit=installCloseGuard(w.window,async()=>true,{hide,chooseClose})
  w.events.emit('close',{preventDefault(){}})
  w.events.emit('close',{preventDefault(){}}); quit()
  await vi.waitFor(()=>expect(chooseClose).toHaveBeenCalledTimes(1))
  expect(w.destroyed).toBe(false)
  decide('cancel'); await new Promise(resolve=>setTimeout(resolve,0))
  expect(hide).not.toHaveBeenCalled(); expect(w.destroyed).toBe(false)
  quit(); await vi.waitFor(()=>expect(w.destroyed).toBe(true))
  expect(chooseClose).toHaveBeenCalledTimes(1)
})
it('keeps window open if the choice fails or hide is unavailable',async()=>{
 const w=windowStub()
 const chooseClose=vi.fn().mockRejectedValueOnce(Error('dialog failure')).mockResolvedValueOnce('hide')
 installCloseGuard(w.window,async()=>true,{chooseClose})
 w.events.emit('close',{preventDefault(){}})
 await new Promise(resolve=>setTimeout(resolve,0))
 w.events.emit('close',{preventDefault(){}})
 await new Promise(resolve=>setTimeout(resolve,0))
 expect(w.destroyed).toBe(false)
})
it('discards known unsaved input on Exit without asking while pending writes still drain',async()=>{
 const w=windowStub(),confirm=vi.fn(async()=>false),quit=installCloseGuard(w.window,confirm)
 w.state={dirty:true,saving:true};quit();await new Promise(r=>setTimeout(r,20));expect(w.destroyed).toBe(false)
 w.state={dirty:true,saving:false};await vi.waitFor(()=>expect(w.destroyed).toBe(true));expect(confirm).not.toHaveBeenCalled()
})
it('waits for main shutdown preparation before destroying the renderer',async()=>{
 const w=windowStub();let finish!:()=>void;const beforeClose=vi.fn(()=>new Promise<void>(r=>{finish=r}));const quit=installCloseGuard(w.window,async()=>false,{beforeClose});quit();await vi.waitFor(()=>expect(beforeClose).toHaveBeenCalledOnce());expect(w.destroyed).toBe(false);finish();await vi.waitFor(()=>expect(w.destroyed).toBe(true))
})
