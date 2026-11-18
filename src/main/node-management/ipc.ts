import { ipcMain, type BrowserWindow } from 'electron'
import { nodeManagementChanged, nodeManagementChannel, type NodeManagementState } from '../../shared/node-management'
import { isTrustedSender } from '../ipc-core'
import { dispatchNodeManagement } from './ipc-core'
import type { NodeManagementService } from './service'

export function registerNodeManagementIpc(window: BrowserWindow, url: string, service: NodeManagementService) {
  ipcMain.handle(nodeManagementChannel, (event, ...args: unknown[]) =>
    dispatchNodeManagement(service, args, isTrustedSender(event, window, url)),
  )
  return {
    changed(state: NodeManagementState) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) return
      const contents = window.webContents
      if (!isTrustedSender({ sender: contents, senderFrame: contents.mainFrame }, window, url)) return
      try {
        contents.send(nodeManagementChanged, state)
      } catch {
        // A removed frame may disappear between validation and delivery.
      }
    },
    dispose() {
      ipcMain.removeHandler(nodeManagementChannel)
    },
  }
}
