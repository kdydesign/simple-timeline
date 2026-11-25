import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import type {DeviceCheck, DeviceHealth, DeviceMacro, RailDevice} from '../../shared/device-rail'
import {hostError} from '../../shared/termrail-endpoint'
import type {ProbeResult} from './monitor'
import {probeAxes, sameProbeTarget} from './probe-target'

type Axis = keyof DeviceHealth

export class DeviceInputError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeviceInputError('장비 설정을 확인하세요.')
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, limit: number, required = false): string {
  if (typeof value !== 'string' || value.includes('\0') || value.length > limit || (required && !value.trim())) {
    throw new DeviceInputError(`${label} 항목을 확인하세요. 최대 ${limit}자까지 입력할 수 있습니다.`)
  }
  return value
}

function port(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new DeviceInputError('포트는 1부터 65535 사이의 정수로 입력하세요.')
  }
  return value
}

function check(input: unknown): DeviceCheck {
  const config = object(input)
  if (config.kind === 'none') return {kind:'none'}
  if (config.kind === 'tcp') return {kind:'tcp', port:port(config.port)}
  if (config.kind === 'http') {
    const url = text(config.url, '주소', 8192, true).trim()
    const parsed = URL.parse(url)
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new DeviceInputError('제품 서비스에는 로그인 정보가 없는 HTTP(S) 주소를 입력하세요.')
    }
    return {kind:'http', url}
  }
  throw new DeviceInputError('제품 서비스 검사 방식을 확인하세요.')
}

function definition(input: unknown, creatingMacroIds: boolean): RailDevice {
  const value = object(input)
  const host = text(value.host, '호스트', 253, true).trim()
  const invalid = hostError(host)
  if (invalid) throw new DeviceInputError(invalid)
  if (typeof value.favorite !== 'boolean' || !Array.isArray(value.macros)) throw new DeviceInputError('장비 설정을 확인하세요.')
  if (value.alertsEnabled !== undefined && typeof value.alertsEnabled !== 'boolean') throw new DeviceInputError('장비 알림 설정을 확인하세요.')
  const ids = new Set<string>()
  const macros: DeviceMacro[] = value.macros.map(input => {
    const macro = object(input)
    let id = text(macro.id, '매크로 ID', 128, !creatingMacroIds)
    if (!id) id = randomUUID()
    if (ids.has(id)) throw new DeviceInputError('동일한 매크로가 중복되어 있습니다.')
    ids.add(id)
    return {id, name:text(macro.name, '매크로 이름', 256, true).trim(), commands:text(macro.commands, '명령', 65536, true)}
  })
  return {
    id:text(value.id, '장비 ID', 128), name:text(value.name, '장비 이름', 256, true).trim(),
    host, port:port(value.port), service:check(value.service), favorite:value.favorite, alertsEnabled:value.alertsEnabled ?? false,
    location:text(value.location, '위치', 512).trim(), description:text(value.description, '설명', 16384), macros,
  }
}

export class DeviceStore {
  private readonly db: DatabaseSync

  constructor(profile: string) {
    mkdirSync(profile, {recursive:true, mode:0o700})
    this.db = new DatabaseSync(join(profile, 'devicerail.sqlite'))
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000; BEGIN IMMEDIATE')
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version
      if (version === 0) {
        this.db.exec('CREATE TABLE devices (id TEXT PRIMARY KEY, definition TEXT NOT NULL) STRICT')
      }
      if (version === 0 || version === 1) {
        this.db.exec(`CREATE TABLE device_alerts (
          device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          axis TEXT NOT NULL CHECK (axis IN ('ssh','service')),
          failures INTEGER NOT NULL CHECK (failures IN (1,2)), claim_id TEXT,
          PRIMARY KEY (device_id, axis)
        ) STRICT;
        PRAGMA user_version = 2`)
      } else if (version !== 2) throw Error('지원하지 않는 DeviceRail 저장 형식입니다.')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  read(): RailDevice[] {
    return this.db.prepare('SELECT id, definition FROM devices ORDER BY rowid').all().map(row => {
      if (typeof row.definition !== 'string') throw Error('저장한 장비를 읽을 수 없습니다.')
      const device = definition(JSON.parse(row.definition), false)
      if (!device.id || device.id !== row.id) throw Error('저장한 장비 ID를 확인할 수 없습니다.')
      return device
    })
  }

  save(input: unknown): RailDevice {
    const device = definition(input, true)
    if (device.id) {
      this.transaction(() => {
        const old = this.db.prepare('SELECT definition FROM devices WHERE id = ?').get(device.id)
        if (typeof old?.definition !== 'string') throw new DeviceInputError('수정할 장비를 찾을 수 없습니다.')
        const previous = definition(JSON.parse(old.definition), false)
        this.db.prepare('UPDATE devices SET definition = ? WHERE id = ?').run(JSON.stringify(device), device.id)
        for (const axis of probeAxes) {
          if (!device.alertsEnabled || !sameProbeTarget(previous, device, axis)) this.clearIncident(device.id, axis)
        }
      })
    } else {
      device.id = randomUUID()
      this.db.prepare('INSERT INTO devices (id, definition) VALUES (?, ?)').run(device.id, JSON.stringify(device))
    }
    return device
  }

  recordObservations(deviceId: string, results: Partial<Record<Axis, ProbeResult>>, canNotify: boolean, claimId: string = randomUUID()): Axis[] {
    return this.transaction(() => {
      const device = this.db.prepare(`SELECT json_extract(definition, '$.service.kind') AS service
        FROM devices WHERE id = ? AND json_type(definition, '$.alertsEnabled') = 'true'`).get(deviceId)
      const claimed: Axis[] = []
      if (!device) return claimed
      for (const axis of probeAxes) {
        const result = results[axis]
        if (!result || (axis === 'service' && device.service === 'none')) continue
        if (result.ok) {
          this.clearIncident(deviceId, axis)
          continue
        }
        this.db.prepare(`INSERT INTO device_alerts (device_id, axis, failures) VALUES (?, ?, 1)
          ON CONFLICT (device_id, axis) DO UPDATE SET failures = 2 WHERE failures = 1`).run(deviceId, axis)
        if (canNotify) {
          const change = this.db.prepare(`UPDATE device_alerts SET claim_id = ? WHERE device_id = ? AND axis = ?
            AND failures = 2 AND claim_id IS NULL`).run(claimId, deviceId, axis)
          if (change.changes) claimed.push(axis)
        }
      }
      return claimed
    })
  }

  releaseAlertClaim(deviceId: string, claimId: string) {
    this.db.prepare('UPDATE device_alerts SET claim_id = NULL WHERE device_id = ? AND claim_id = ?').run(deviceId, claimId)
  }

  private clearIncident(deviceId: string, axis: Axis) {
    this.db.prepare('DELETE FROM device_alerts WHERE device_id = ? AND axis = ?').run(deviceId, axis)
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  remove(id: string) {
    if (!this.db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes) throw new DeviceInputError('삭제할 장비를 찾을 수 없습니다.')
  }

  close() {
    if (this.db.isOpen) this.db.close()
  }
}
