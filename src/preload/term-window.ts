import { contextBridge, ipcRenderer } from 'electron'
import { termWindowChannel, type TermWindowApi } from '../shared/term-window'

contextBridge.exposeInMainWorld('workrailTermWindow', {
  prepare: bounds => ipcRenderer.sendSync(termWindowChannel, bounds),
} satisfies TermWindowApi)
