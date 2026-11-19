import { ipcMain, type BrowserWindow } from 'electron'
import { nodeManagementChanged, nodeManagementChannel, type NodeManagementState,type NodeManagementResult } from '../../shared/node-management'
import { isTrustedSender } from '../ipc-core'
import { dispatchNodeManagement, type NodeCommandService } from './ipc-core'

export function registerNodeManagementIpc(window: BrowserWindow, url: string, service: NodeCommandService,route?:{dispatch(args:unknown[],trusted:boolean):Promise<NodeManagementResult>;decorate(state:NodeManagementState):NodeManagementState}) {
  ipcMain.handle(nodeManagementChannel, (event, ...args: unknown[]) =>
    route?route.dispatch(args,isTrustedSender(event,window,url)):dispatchNodeManagement(service, args, isTrustedSender(event, window, url)),
  )
  return {
    changed(state: NodeManagementState) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) return
      const contents = window.webContents
      if (!isTrustedSender({ sender: contents, senderFrame: contents.mainFrame }, window, url)) return
      try {
        contents.send(nodeManagementChanged, route?route.decorate(state):state)
      } catch {
        // A removed frame may disappear between validation and delivery.
      }
    },
    dispose() {
      ipcMain.removeHandler(nodeManagementChannel)
    },
  }
}
