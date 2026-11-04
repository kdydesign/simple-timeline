import { BrowserWindow } from 'electron'
export function createWindow(preload: string, url: string, onShown?: () => void, icon?: string): BrowserWindow {
  const window = new BrowserWindow({
    icon,
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: '#f4f6fa',
    title: 'Simple Timeline',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  })
  window.once('show', () => onShown?.())
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
  // Make the window visible independently of the first renderer/GPU paint.
  window.show()
  return window
}
