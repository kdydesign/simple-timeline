import { contextBridge, ipcRenderer } from 'electron'
import type { NodeManagementState } from '../shared/node-management'

// Keep this sandbox preload self-contained: no project module loading at runtime.
const command = (method: string, ...args: unknown[]) => ipcRenderer.invoke('node-maintenance:command', method, ...args)
contextBridge.exposeInMainWorld('nodeMaintenance', {
  ready: () => command('ready'),
  getState: () => command('getState'),
  refreshCatalog: () => command('refreshCatalog'),
  removeStandalone: (confirmationId: string) => command('removeStandalone', { confirmed: true, confirmationId }),
  installManager: () => command('installManager'),
  install: (version: string) => command('install', version),
  use: (version: string) => command('use', version),
  openRecoveryLocation: () => command('openRecoveryLocation'),
  onChange(callback: (state: NodeManagementState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, state: NodeManagementState) => callback(state)
    ipcRenderer.on('node-maintenance:changed', listener)
    return () => ipcRenderer.removeListener('node-maintenance:changed', listener)
  },
})
