import type { BrowserWindow } from 'electron'
export function installCloseGuard(
  window: BrowserWindow,
  confirm: () => Promise<boolean>,
): void {
  let checking = false
  window.on('close', (event) => {
    event.preventDefault()
    if (checking || window.isDestroyed()) return
    checking = true
    void (async () => {
      try {
        let state: { dirty: boolean; saving: boolean }
        do {
          state = await window.webContents.executeJavaScript(
            '({dirty:document.documentElement.dataset.editorDirty === "true",saving:document.documentElement.dataset.saving === "true"})',
          )
          if (state.saving)
            await new Promise((resolve) => setTimeout(resolve, 50))
        } while (state.saving && !window.isDestroyed())
        if (!window.isDestroyed() && (!state.dirty || (await confirm())))
          window.destroy()
      } catch {
        if (!window.isDestroyed() && (await confirm())) window.destroy()
      } finally {
        checking = false
      }
    })()
  })
}
