import type { BrowserWindow } from 'electron'
export type CloseChoice = 'hide' | 'quit' | 'cancel'
export function installCloseGuard(
  window: BrowserWindow,
  confirm: () => Promise<boolean>,
  options: { chooseClose?: () => Promise<CloseChoice>; hide?: () => void; beforeClose?: () => void; afterClose?: () => void } = {},
): () => void {
  let checking = false
  let choosing = false
  const requestClose = () => {
    if (checking || choosing || window.isDestroyed()) return
    checking = true
    void (async () => {
      try {
        let state: { dirty: boolean; saving: boolean }
        do {
          state = await window.webContents.executeJavaScript(
            '({dirty:document.documentElement.dataset.editorDirty === "true",saving:document.documentElement.dataset.saving === "true"})',
          )
          if (!state || typeof state.dirty !== 'boolean' || typeof state.saving !== 'boolean')
            throw Error('Renderer close state unavailable')
          if (state.saving)
            await new Promise((resolve) => setTimeout(resolve, 50))
        } while (state.saving && !window.isDestroyed())
        if (!window.isDestroyed() && (!state.dirty || (await confirm()))) close()
      } catch {
        if (!window.isDestroyed() && (await confirm())) close()
      } finally {
        checking = false
      }
    })()
  }
  const close = () => {
    options.beforeClose?.()
    window.destroy()
    options.afterClose?.()
  }
  window.on('close', event => {
    event.preventDefault()
    if (checking || choosing || window.isDestroyed()) return
    if (!options.chooseClose) {
      if (options.hide) options.hide()
      else requestClose()
      return
    }
    choosing = true
    void (async () => {
      let choice: CloseChoice = 'cancel'
      try { choice = await options.chooseClose!() }
      catch { /* A failed dialog must not silently discard input or hide the app. */ }
      finally { choosing = false }
      if (window.isDestroyed()) return
      if (choice === 'hide') options.hide?.()
      else if (choice === 'quit') requestClose()
    })()
  })
  return requestClose
}
