import { ipcMain, type BrowserWindow } from 'electron'
import { isTrustedSender } from './ipc-core'
import { windowChannel } from '../shared/window-api'
export function registerWindowIpc(window: BrowserWindow, allowedUrl: string, openHelp?:()=>void, openReleases?:()=>void): () => void {
  ipcMain.handle(windowChannel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event, window, allowedUrl) || args.length !== 1) return {ok:false}
    switch (args[0]) {
      case 'state': break
      case 'release-notes': if(!openReleases)return {ok:false};openReleases();break
      case 'help': if(!openHelp)return {ok:false};openHelp();break
      case 'minimize': window.minimize(); break
      case 'toggle-maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break
      // close(), not destroy(): preserve the existing save/dirty guard.
      case 'close': window.close(); break
      default: return {ok:false}
    }
    return {ok:true, maximized: !window.isDestroyed() && window.isMaximized()}
  })
  return () => ipcMain.removeHandler(windowChannel)
}
