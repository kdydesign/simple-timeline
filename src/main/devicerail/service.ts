import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import type {ReminderSender} from '../reminders/engine'
import type {DeviceHealth, DeviceSnapshot, RailDevice} from '../../shared/device-rail'
import {DeviceMacros} from './macros'
import {DeviceMonitor, type ProbeResult} from './monitor'
import {DeviceInputError, DeviceStore} from './store'

const refreshIntervalMs = 30_000

export interface DeviceNotifications {
  muted: () => boolean
  send: ReminderSender
  open: () => void
}

export function createDeviceService(profile: string, onChange: ()=>void, notifications?: DeviceNotifications) {
  const store = new DeviceStore(profile)
  let devices: Map<string, RailDevice>
  try {
    devices = new Map(store.read().map(device => [device.id, device]))
  } catch (error) {
    store.close()
    throw error
  }

  let closed = false
  let changePending = false
  function changed() {
    if (closed || changePending) return
    changePending = true
    queueMicrotask(() => {
      changePending = false
      if (!closed) onChange()
    })
  }
  const macros = new DeviceMacros(join(profile, 'termrail-known-hosts.json'), changed)
  function completed(device: RailDevice, results: Partial<Record<keyof DeviceHealth, ProbeResult>>) {
    if (!notifications || !device.alertsEnabled) return
    const claimId = randomUUID()
    const release = () => {
      if (closed) return
      try { store.releaseAlertClaim(device.id, claimId) }
      catch { console.warn('DeviceRail 알림 발송 실패를 저장하지 못했습니다.') }
    }
    let canNotify = false
    try { canNotify = !closed && !notifications.muted() }
    catch { /* A missing mute preference must not enable OS notifications. */ }
    try {
      const claimed = store.recordObservations(device.id, results, canNotify, claimId)
      if (!claimed.length) return
      const body = claimed.map(axis => (axis === 'ssh' ? 'SSH' : '제품 서비스') + ' · ' + results[axis]!.detail).join('\n')
      const message = {title:device.name + ' · 장비 이상', body}
      // An indeterminate delivery remains claimed: Windows may already have shown it.
      void notifications.send(message, notifications.open, release).then(outcome => {
        if (outcome === 'failed') release()
      }).catch(() => console.warn('DeviceRail 알림 전송 결과를 확인하지 못했습니다.'))
    } catch { console.warn('DeviceRail 알림 처리에 실패했습니다.') }
  }
  const monitor = new DeviceMonitor(changed, undefined, completed)
  for (const device of devices.values()) monitor.set(device)

  function startTimer() {
    return setInterval(() => {void monitor.refresh()}, refreshIntervalMs)
  }
  let timer = startTimer()

  function ensureOpen() {
    if (closed) throw new DeviceInputError('장비 감시가 종료되었습니다.')
  }

  function registered(id: string) {
    ensureOpen()
    const device = devices.get(id)
    if (!device) throw new DeviceInputError('등록된 장비를 찾을 수 없습니다.')
    return device
  }

  return {
    snapshot(): DeviceSnapshot {
      ensureOpen()
      const saved = Array.from(devices.values())
      return {
        devices:saved,
        health:Object.fromEntries(saved.map(({id}) => [id, monitor.health(id)])),
        macroState:Object.fromEntries(saved.map(({id}) => [id, macros.state(id)])),
      }
    },
    save(value: unknown) {
      ensureOpen()
      const device = store.save(value)
      const previous = devices.get(device.id)
      devices.set(device.id, device)
      if (previous && (previous.host !== device.host || previous.port !== device.port)) {
        macros.remove(device.id)
      } else if (previous) {
        const updated = new Map(device.macros.map(macro => [macro.id, macro.commands]))
        for (const macro of previous.macros) {
          if (updated.get(macro.id) !== macro.commands) macros.forgetMacro(device.id, macro.id)
        }
      }
      monitor.set(device)
      changed()
    },
    remove(id: string) {
      registered(id)
      store.remove(id)
      devices.delete(id)
      monitor.remove(id)
      macros.remove(id)
      changed()
    },
    refresh(id?: string) {
      ensureOpen()
      if (id !== undefined) registered(id)
      return monitor.refresh(id)
    },
    suspend() {
      if (closed) return
      clearInterval(timer)
      monitor.suspend()
    },
    resume() {
      if (closed) return
      clearInterval(timer)
      timer = startTimer()
      void monitor.resume()
    },
    runMacro(id: string, macroId: string) {
      const device = registered(id)
      const macro = device.macros.find(item => item.id === macroId)
      if (!macro) throw new DeviceInputError('등록된 매크로를 찾을 수 없습니다.')
      macros.start(device, macro)
    },
    trust(id: string, runId: string, fingerprint: string) {
      registered(id)
      macros.trust(id, runId, fingerprint)
    },
    login(id: string, runId: string, username: string, password: string) {
      registered(id)
      macros.login(id, runId, username, password)
    },
    disconnect(id: string) {
      registered(id)
      macros.disconnect(id)
    },
    close() {
      if (closed) return
      closed = true
      clearInterval(timer)
      monitor.close()
      macros.dispose()
      store.close()
      devices.clear()
    },
  }
}
export type DeviceService = ReturnType<typeof createDeviceService>
