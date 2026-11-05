import type { BrowserWindow } from 'electron'
export function installCloseGuard(
  window: BrowserWindow,
  confirm: () => Promise<boolean>,
  options: { hide?: () => void; beforeClose?: () => void; afterClose?: () => void } = {},
): () => void {
  let checking = false
  const requestClose = () => {
    if (checking || window.isDestroyed()) return
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
    if (options.hide) options.hide()
    else requestClose()
  })
  return requestClose
}
