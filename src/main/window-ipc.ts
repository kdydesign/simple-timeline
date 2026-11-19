import { ipcMain, type BrowserWindow } from 'electron'
import { isTrustedSender } from './ipc-core'
import { windowChannel } from '../shared/window-api'
import { isHelpSection, type HelpSection } from '../shared/help'
export function registerWindowIpc(window: BrowserWindow, allowedUrl: string, openHelp?:(section?:HelpSection)=>void, openReleases?:()=>void, runtimeVersion?:string): () => void {
  ipcMain.handle(windowChannel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event, window, allowedUrl)) return {ok:false}
    const [command,section] = args
    if (command==='help') {
      if (!openHelp || args.length!==1 && (args.length!==2 || !isHelpSection(section))) return {ok:false}
      openHelp(isHelpSection(section)?section:undefined)
    } else if (args.length!==1) return {ok:false}
    switch (command) {
      case 'state': return {ok:true, maximized:window.isMaximized(), ...(runtimeVersion?{runtimeVersion}:{})}
      case 'release-notes': if(!openReleases)return {ok:false};openReleases();break
      case 'help': break
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
