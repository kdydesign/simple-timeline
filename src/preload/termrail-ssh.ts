import { contextBridge, ipcRenderer } from 'electron'
import { termRailSshChannel, type TermRailSshApi } from '../shared/termrail-ssh'

const ssh: TermRailSshApi = {
  pickStartup: editorId => ipcRenderer.invoke(termRailSshChannel, 'pickStartup', editorId),
  bindStartup: (editorId, endpoint) => ipcRenderer.invoke(termRailSshChannel, 'bindStartup', editorId, endpoint),
  finishStartup: (editorId, savedId) => ipcRenderer.invoke(termRailSshChannel, 'finishStartup', editorId, savedId),
  recoverStartup: savedIds => ipcRenderer.invoke(termRailSshChannel, 'recoverStartup', savedIds),
  discardStartup: id => ipcRenderer.invoke(termRailSshChannel, 'discardStartup', id),
  open: (id, endpoint) => ipcRenderer.invoke(termRailSshChannel, 'open', id, endpoint),
  startProfile: (id, startupId) => ipcRenderer.invoke(termRailSshChannel, 'startProfile', id, startupId),
  close: id => ipcRenderer.invoke(termRailSshChannel, 'close', id),
  read: (id, cursor) => ipcRenderer.invoke(termRailSshChannel, 'read', id, cursor),
  trust: (id, fingerprint) => ipcRenderer.invoke(termRailSshChannel, 'trust', id, fingerprint),
  login: (id, username, password) => ipcRenderer.invoke(termRailSshChannel, 'login', id, username, password),
  write: (id, data) => ipcRenderer.invoke(termRailSshChannel, 'write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke(termRailSshChannel, 'resize', id, cols, rows),
}
contextBridge.exposeInMainWorld('termRailSsh', ssh)
