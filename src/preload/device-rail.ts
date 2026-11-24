import {contextBridge, ipcRenderer} from 'electron'
import {deviceRailChanged, deviceRailChannel, type DeviceRailApi} from '../shared/device-rail'

const deviceRail: DeviceRailApi = {
  snapshot: () => ipcRenderer.invoke(deviceRailChannel,'snapshot'),
  save: device => ipcRenderer.invoke(deviceRailChannel,'save',device),
  remove: id => ipcRenderer.invoke(deviceRailChannel,'remove',id),
  refresh: id => id === undefined ? ipcRenderer.invoke(deviceRailChannel,'refresh') : ipcRenderer.invoke(deviceRailChannel,'refresh',id),
  runMacro: (id,macroId) => ipcRenderer.invoke(deviceRailChannel,'runMacro',id,macroId),
  trust: (id,runId,fingerprint) => ipcRenderer.invoke(deviceRailChannel,'trust',id,runId,fingerprint),
  login: (id,runId,username,password) => ipcRenderer.invoke(deviceRailChannel,'login',id,runId,username,password),
  disconnect: id => ipcRenderer.invoke(deviceRailChannel,'disconnect',id),
  onChange(listener) {
    const changed = () => listener()
    ipcRenderer.on(deviceRailChanged,changed)
    return () => { ipcRenderer.off(deviceRailChanged,changed) }
  },
}
contextBridge.exposeInMainWorld('deviceRail',deviceRail)
