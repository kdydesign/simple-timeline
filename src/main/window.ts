import { BrowserWindow } from 'electron'
export function createWindow(preload: string, url: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    title: 'Simple Timeline',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  })
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, next) => {
    if (next !== url) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  )
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  void window
    .loadURL(url)
    .catch((error) => console.error('UI load failed', String(error)))
  window.once('ready-to-show', () => window.show())
  return window
}
