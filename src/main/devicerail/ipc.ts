import {dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent} from 'electron'
import {deviceRailChanged, deviceRailChannel} from '../../shared/device-rail'
import {isTrustedSender} from '../ipc-core'
import {DeviceMacroError} from './macros'
import {createDeviceService} from './service'
import {DeviceInputError} from './store'

function isId(value:unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('\0')
}

export function registerDeviceRailIpc(window:BrowserWindow, rendererUrl:string, profile:string, blocked:()=>boolean) {
  const approvals = new Map<string, AbortController>()
  let closing = false
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  let service: ReturnType<typeof createDeviceService> | undefined

  function changed() {
    if (closing || changeTimer) return
    changeTimer = setTimeout(() => {
      changeTimer = undefined
      if (window.isDestroyed() || window.webContents.isDestroyed()) return
      const sender = window.webContents
      if (isTrustedSender({sender,senderFrame:sender.mainFrame},window,rendererUrl)) {
        try { sender.send(deviceRailChanged) } catch { /* Navigation can destroy the frame during delivery. */ }
      }
    }, 100)
  }
  // A damaged private device database must leave the other WorkRail tools usable.
  try { service = createDeviceService(profile, changed) } catch { /* Surface the storage error on request. */ }

  function checkOpen(event:IpcMainInvokeEvent, writing:boolean) {
    if (closing || !isTrustedSender(event,window,rendererUrl)) throw new DeviceInputError('DeviceRail 접근이 허용되지 않았습니다.')
    if (writing && blocked()) throw new DeviceInputError('앱 종료 또는 업데이트가 진행 중입니다.')
  }
  function preview(deviceId:string, macroId:string) {
    const snapshot = service!.snapshot()
    const device = snapshot.devices.find(item => item.id === deviceId)
    const macro = device?.macros.find(item => item.id === macroId)
    if (!device || !macro) throw new DeviceInputError('장비 또는 매크로를 찾을 수 없습니다.')
    if (snapshot.macroState[deviceId]?.runs.some(run => run.finishedAt === undefined)) {
      throw new DeviceInputError('이 장비에서 이미 매크로를 실행하고 있습니다.')
    }
    const address = device.host.includes(':') ? `[${device.host}]:${device.port}` : `${device.host}:${device.port}`
    return {name:device.name, address, macro:macro.name, commands:macro.commands}
  }

  async function runMacro(event:IpcMainInvokeEvent, deviceId:string, macroId:string) {
    if (approvals.has(deviceId)) throw new DeviceInputError('이 장비의 실행 확인 창이 열려 있습니다.')
    const target = preview(deviceId,macroId)
    const prompt = new AbortController()
    approvals.set(deviceId,prompt)
    try {
      const {response} = await dialog.showMessageBox(window, {
        type:'question', title:'장비 매크로 실행', message:`${target.name}에서 ‘${target.macro}’ 매크로를 실행할까요?`,
        detail:`${target.address}\n\n${target.commands}`, buttons:['취소','실행'], defaultId:0, cancelId:0,
        noLink:true, signal:prompt.signal,
      })
      if (response !== 1 || prompt.signal.aborted) return
      checkOpen(event,true)
      const current = preview(deviceId,macroId)
      if (current.name !== target.name || current.address !== target.address || current.macro !== target.macro ||
          current.commands !== target.commands) throw new DeviceInputError('장비 또는 매크로가 변경되었습니다. 다시 확인하세요.')
      service!.runMacro(deviceId,macroId)
    } finally {
      approvals.delete(deviceId)
    }
  }

  ipcMain.handle(deviceRailChannel, async (event, method:unknown, ...args:unknown[]) => {
    try {
      checkOpen(event,method !== 'snapshot')
      if (!service) throw new DeviceInputError('장비 저장소를 열 수 없습니다. 사용자 데이터 폴더를 확인하세요.')
      const [deviceId] = args
      switch (method) {
        case 'snapshot': if (!args.length) return service.snapshot(); break
        case 'save': if (args.length === 1) return service.save(args[0]); break
        case 'refresh':
          if (!args.length) return await service.refresh()
          if (args.length === 1 && isId(deviceId)) return await service.refresh(deviceId)
          break
        case 'remove':
          if (args.length === 1 && isId(deviceId)) {
            service.remove(deviceId)
            approvals.get(deviceId)?.abort()
            return
          }
          break
        case 'disconnect':
          if (args.length === 1 && isId(deviceId)) {
            approvals.get(deviceId)?.abort()
            return service.disconnect(deviceId)
          }
          break
        case 'runMacro': {
          const macroId = args[1]
          if (args.length === 2 && isId(deviceId) && isId(macroId)) return await runMacro(event,deviceId,macroId)
          break
        }
        case 'trust': {
          const [,runId,fingerprint] = args
          if (args.length === 3 && isId(deviceId) && isId(runId) && typeof fingerprint === 'string' &&
              /^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) return service.trust(deviceId,runId,fingerprint)
          break
        }
        case 'login': {
          const [,runId,username,password] = args
          if (args.length === 4 && isId(deviceId) && isId(runId) && typeof username === 'string' &&
              username.length > 0 && username.length <= 256 && !/[\x00-\x1f\x7f]/u.test(username) &&
              typeof password === 'string' && password.length <= 4096) return service.login(deviceId,runId,username,password)
          break
        }
      }
      throw new DeviceInputError('잘못된 DeviceRail 요청입니다.')
    } catch (error) {
      if (error instanceof DeviceInputError || error instanceof DeviceMacroError) throw Error(error.message)
      throw Error('DeviceRail 작업을 완료할 수 없습니다.')
    }
  })

  function shutdown() {
    if (closing) return
    closing = true
    clearTimeout(changeTimer)
    for (const prompt of approvals.values()) prompt.abort()
    service?.close()
  }

  return {
    suspend: () => { if (!closing) service?.suspend() },
    resume: () => { if (!closing) service?.resume() },
    shutdown,
    dispose: () => { ipcMain.removeHandler(deviceRailChannel); shutdown() },
  }
}
