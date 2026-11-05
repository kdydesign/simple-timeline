import { BrowserWindow } from 'electron'
export function createWindow(preload: string, url: string, onShown?: () => void, icon?: string, startup?: { mark: (name: string, errorCode?: number) => void; observeRequests: (window: BrowserWindow) => void }): BrowserWindow {
  const window = new BrowserWindow({
    icon,
    width: 1280,
    height: 820,
    show: false,
    frame: false,
    backgroundColor: '#f4f6fa',
    title: 'Planrail',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  })
  startup?.mark('window-created')
  window.webContents.once('dom-ready', () => startup?.mark('dom-ready'))
  window.once('ready-to-show', () => startup?.mark('first-paint-ready'))
  window.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame) startup?.mark('load-failed', code)
  })
  window.webContents.once('preload-error', () => startup?.mark('preload-failed'))
  window.webContents.once('render-process-gone', () => startup?.mark('renderer-exited'))
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
  startup?.observeRequests(window)
  startup?.mark('load-requested')
  void window
    .loadURL(url)
    .catch((error) => console.error('UI load failed', String(error)))
  // Make the window visible independently of the first renderer/GPU paint.
  window.show()
  return window
}
