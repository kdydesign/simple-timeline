import {contextBridge, ipcRenderer} from 'electron'
import {postRailChannel, postRailChanged, type PostRailApi, type PostRailChange} from '../shared/postrail-api'

const postRail: PostRailApi = {
  consoleSince: after => ipcRenderer.invoke(postRailChannel, 'console', after),
  invalidDraft: (requestId, envId, category, method, diagnosis, attemptId) => ipcRenderer.invoke(postRailChannel, 'invalidDraft', requestId, envId, category, method, diagnosis, attemptId),
  read: () => ipcRenderer.invoke(postRailChannel, 'read'),
  chooseFile:(id,retainedIds=[])=>ipcRenderer.invoke(postRailChannel,'chooseFile',id,retainedIds),
  capability: () => ipcRenderer.invoke(postRailChannel, 'capability'),
  state: () => ipcRenderer.invoke(postRailChannel, 'state'),
  mutate: command => ipcRenderer.invoke(postRailChannel, 'mutate', command),
  logout: id => ipcRenderer.invoke(postRailChannel, 'logout', id),
  start: input => ipcRenderer.invoke(postRailChannel, 'start', input),
  stop: () => ipcRenderer.invoke(postRailChannel, 'stop'),
  page: (offset,id) => ipcRenderer.invoke(postRailChannel, 'page', offset, id),
  detail: (iteration,id) => ipcRenderer.invoke(postRailChannel, 'detail', iteration, id),
  onChange(callback) {
    const listener = (_event: Electron.IpcRendererEvent, kind: PostRailChange) => callback(kind)
    ipcRenderer.on(postRailChanged, listener)
    return () => {ipcRenderer.off(postRailChanged, listener)}
  },
}
contextBridge.exposeInMainWorld('postRail', postRail)
