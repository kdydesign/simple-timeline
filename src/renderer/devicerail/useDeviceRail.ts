import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceRailApi, DeviceSnapshot, RailDevice } from '../../shared/device-rail'

const empty: DeviceSnapshot = { devices: [], health: {}, macroState: {} }
export function deviceError(cause: unknown) {
  return cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : '장비 작업을 완료하지 못했습니다.'
}

export function useDeviceRail(enabled = true) {
  const api = enabled ? window.deviceRail : undefined
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(empty)
  const [selectedId, selectDevice] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)

  const reload = useCallback(async () => {
    if (!api) return
    const sequence = ++version.current
    try {
      const next = await api.snapshot()
      if (sequence === version.current) {
        setSnapshot(next)
        setReady(true)
        setError('')
      }
      return next
    } catch (cause) {
      if (sequence === version.current) setError(deviceError(cause))
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    const unsubscribe = api.onChange(() => { void reload() })
    void reload()
    return () => { unsubscribe(); ++version.current }
  }, [api, reload])

  async function perform(action: (bridge: DeviceRailApi) => Promise<void>) {
    if (!api) throw new Error('장비 도구를 사용할 수 없습니다.')
    await action(api)
    return reload()
  }
  async function save(device: RailDevice) {
    const previous = new Set(snapshot.devices.map(item => item.id))
    const next = await perform(bridge => bridge.save(device))
    if (!device.id) {
      const created = next?.devices.find(item => !previous.has(item.id) && item.name === device.name && item.host === device.host && item.port === device.port)
      if (created) selectDevice(created.id)
    }
  }
  const needsAttention = snapshot.devices.filter(device => {
    const health = snapshot.health[device.id]
    return health?.ssh.state === 'failed' || (device.service.kind !== 'none' && health?.service.state === 'failed')
  }).length
  const selected = snapshot.devices.find(item => item.id === selectedId) ?? snapshot.devices[0]
  return { snapshot, selected, selectDevice, needsAttention, ready, available: !!api, error, reload, perform, save }
}
export type DeviceRailController = ReturnType<typeof useDeviceRail>
