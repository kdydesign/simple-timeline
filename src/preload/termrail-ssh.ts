import { contextBridge, ipcRenderer } from 'electron'
import { termRailSshChannel, type TermRailSshApi } from '../shared/termrail-ssh'

const ssh: TermRailSshApi = {
  open: (id, endpoint) => ipcRenderer.invoke(termRailSshChannel, 'open', id, endpoint),
  close: id => ipcRenderer.invoke(termRailSshChannel, 'close', id),
  read: (id, cursor) => ipcRenderer.invoke(termRailSshChannel, 'read', id, cursor),
  trust: (id, fingerprint) => ipcRenderer.invoke(termRailSshChannel, 'trust', id, fingerprint),
  login: (id, username, password) => ipcRenderer.invoke(termRailSshChannel, 'login', id, username, password),
  write: (id, data) => ipcRenderer.invoke(termRailSshChannel, 'write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke(termRailSshChannel, 'resize', id, cols, rows),
}
contextBridge.exposeInMainWorld('termRailSsh', ssh)
