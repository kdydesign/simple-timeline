import { randomUUID } from 'node:crypto'
import { screen, type BrowserWindow } from 'electron'
import { termWindowChannel, type TermWindowBounds } from '../shared/term-window'

function validBounds(value: unknown): value is TermWindowBounds {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rect = value as TermWindowBounds
  return Object.keys(rect).length === 4 && [rect.x, rect.y, rect.width, rect.height]
    .every(n => Number.isSafeInteger(n) && Math.abs(n) <= 1_000_000)
    && rect.width > 0 && rect.height > 0
}

function visibleBounds(host: BrowserWindow, saved?: TermWindowBounds): TermWindowBounds {
  const area = screen.getDisplayMatching(saved ?? host.getBounds()).workArea
  const width = Math.min(area.width, Math.max(320, saved?.width ?? 900))
  const height = Math.min(area.height, Math.max(180, saved?.height ?? 600))
  const x = saved?.x ?? area.x + Math.floor((area.width - width) / 2)
  const y = saved?.y ?? area.y + Math.floor((area.height - height) / 2)
  return {
    width, height,
    x: Math.min(area.x + area.width - width, Math.max(area.x, x)),
    y: Math.min(area.y + area.height - height, Math.max(area.y, y)),
  }
}

// window.open needs a synchronous reply to return the live same-origin WindowProxy.
// Only the main window's exact top frame can mint a single-use target name.
export function installTermWindows(host: BrowserWindow, url: string, icon?: string) {
  const contents = host.webContents
  const children = new Set<BrowserWindow>()
  const hiddenWithHost = new Set<BrowserWindow>()
  let grant: { name: string; expires: number; bounds: TermWindowBounds } | undefined
  contents.ipc.on(termWindowChannel, (event, ...args: unknown[]) => {
    if (args.length > 1 || host.isDestroyed() || !host.isVisible()
      || event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame
      || event.senderFrame.url !== url || (args[0] !== undefined && !validBounds(args[0]))) {
      event.returnValue = null
      return
    }
    grant = { name: 'termrail-' + randomUUID(), expires: Date.now() + 5000, bounds: visibleBounds(host, args[0]) }
    event.returnValue = grant.name
  })
  contents.setWindowOpenHandler(request => {
    const ticket = grant
    grant = undefined
    if (!ticket || Date.now() > ticket.expires || ticket.name !== request.frameName || contents.getURL() !== url
      || request.url !== 'about:blank' || request.features !== '' || request.postBody) return { action: 'deny' }
    return {
      action: 'allow', overrideBrowserWindowOptions: {
        ...ticket.bounds, icon, frame: true, title: 'TermRail', autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false },
      },
    }
  })
  contents.on('did-create-window', child => {
    children.add(child)
    child.setMenu(null)
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    child.webContents.on('will-frame-navigate', event => event.preventDefault())
    child.webContents.on('will-attach-webview', event => event.preventDefault())
    child.once('closed', () => { children.delete(child); hiddenWithHost.delete(child) })
  })
  host.on('hide', () => {
    grant = undefined
    for (const child of children) {
      if (!child.isDestroyed() && child.isVisible()) { hiddenWithHost.add(child); child.hide() }
    }
  })
  host.on('show', () => {
    for (const child of hiddenWithHost) if (!child.isDestroyed()) child.showInactive()
    hiddenWithHost.clear()
  })
  const reset = () => {
    grant = undefined
    for (const child of children) if (!child.isDestroyed()) child.destroy()
  }
  contents.on('did-start-navigation', event => { if (event.isMainFrame && !event.isSameDocument) reset() })
  contents.on('render-process-gone', reset)
  host.once('closed', reset)
}
