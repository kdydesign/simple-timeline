import type {DeviceHealth, DeviceObservation, RailDevice} from '../../shared/device-rail'
import {probeAxes as axes, sameProbeTarget} from './probe-target'
import {get as getHttp} from 'node:http'
import {get as getHttps} from 'node:https'
import {createConnection} from 'node:net'

export interface ProbeResult {
  ok: boolean
  detail: string
}

function failed(error: Error, signal: AbortSignal): ProbeResult {
  const code = (error as NodeJS.ErrnoException).code ?? ''
  let detail = '연결에 실패했습니다.'
  if (signal.aborted || code === 'ETIMEDOUT') detail = '응답 대기 시간이 초과되었습니다.'
  else if (code === 'ECONNREFUSED') detail = '연결이 거부되었습니다.'
  else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') detail = '호스트 이름을 확인할 수 없습니다.'
  else if (/CERT|TLS|SSL|SELF_SIGNED|VERIFY_LEAF|ISSUER/.test(code)) detail = 'TLS 연결 또는 인증서 검증에 실패했습니다.'
  else if (code === 'ECONNRESET') detail = '원격 장비에서 연결을 닫았습니다.'
  return {ok:false, detail}
}

function socketProbe(host: string, port: number, signal: AbortSignal, ssh: boolean): Promise<ProbeResult> {
  return new Promise(resolve => {
    const socket = createConnection({host, port, signal})
    const finish = (result: ProbeResult) => {
      socket.destroy()
      resolve(result)
    }
    socket.on('error', error => finish(failed(error, signal)))
    if (!ssh) {
      socket.once('connect', () => finish({ok:true, detail:'TCP 연결 성공'}))
      return
    }

    // An SSH server can emit informational lines before its identification.
    // Stop reading as soon as that identification arrives, before authentication.
    const invalid = {ok:false, detail:'SSH 프로토콜 응답을 확인하지 못했습니다.'}
    let pending = ''
    let consumed = 0
    socket.on('data', chunk => {
      pending += chunk.toString('latin1')
      let newline: number
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '')
        consumed += newline + 1
        if (consumed > 8192 || line.startsWith('HTTP/')) return finish(invalid)
        if (line.startsWith('SSH-')) {
          const valid = newline + 1 <= 255 && /^SSH-(?:2\.0|1\.99)-[!-~]+(?: [ -~]*)?$/.test(line)
          return finish(valid ? {ok:true, detail:'SSH 프로토콜 응답 확인'} : invalid)
        }
        pending = pending.slice(newline + 1)
      }
      if (consumed + pending.length >= 8192) finish(invalid)
    })
    socket.once('end', () => finish(invalid))
  })
}

export function probeSsh(host: string, port: number, signal: AbortSignal) {
  return socketProbe(host, port, signal, true)
}

export function probeTcp(host: string, port: number, signal: AbortSignal) {
  return socketProbe(host, port, signal, false)
}

export function probeHttp(url: string, signal: AbortSignal): Promise<ProbeResult> {
  const get = new URL(url).protocol === 'https:' ? getHttps : getHttp
  return new Promise(resolve => {
    const request = get(url, {signal, agent:false, rejectUnauthorized:true}, response => {
      const code = response.statusCode ?? 0
      const auth = code === 401 ? ' · 인증 필요' : code === 403 ? ' · 권한 없음' : ''
      resolve({ok:code >= 200 && code < 300, detail:`HTTP ${code}${auth}`})
      response.destroy()
    })
    request.on('error', error => resolve(failed(error, signal)))
    request.on('upgrade', (response, socket) => {
      socket.destroy()
      resolve({ok:false, detail:`HTTP ${response.statusCode}`})
    })
  })
}

type Axis = keyof DeviceHealth

function probeAxis(device: RailDevice, axis: Axis, signal: AbortSignal): Promise<ProbeResult> {
  if (axis === 'ssh') return probeSsh(device.host, device.port, signal)
  if (device.service.kind === 'tcp') return probeTcp(device.host, device.service.port, signal)
  if (device.service.kind === 'http') return probeHttp(device.service.url, signal)
  throw Error('제품 서비스 검사가 설정되지 않았습니다.')
}

function initial(unconfigured = false): DeviceObservation {
  return {state:unconfigured ? 'unconfigured' : 'unknown', checking:false, checkedAt:null, lastSuccessAt:null, message:''}
}

type ProbeResults = Partial<Record<Axis, ProbeResult>>
interface AxisCheck {done: Promise<void>; result?: ProbeResult}
type RoundChecks = Partial<Record<Axis, AxisCheck>>
interface MonitorEntry {
  device: RailDevice
  health: DeviceHealth
  round?: {checks: RoundChecks; done: Promise<void>}
}

export class DeviceMonitor {
  private readonly entries = new Map<string, MonitorEntry>()
  private readonly jobs = new Map<DeviceObservation, {controller:AbortController; finish:()=>void}>()
  private readonly waiting = new Map<DeviceObservation, ()=>void>()
  private active = 0
  private suspended = false

  constructor(private readonly changed: ()=>void, private readonly probe = probeAxis,
    private readonly completed?: (device:RailDevice, results:ProbeResults)=>void) {}

  set(device: RailDevice) {
    let entry = this.entries.get(device.id)
    if (!entry) {
      entry = {device, health:{ssh:initial(), service:initial(device.service.kind === 'none')}}
      this.entries.set(device.id, entry)
      void this.check(entry, axes)
      return
    }

    const previous = entry.device
    entry.device = device
    const replaced = axes.filter(axis => !sameProbeTarget(previous, device, axis))
    const toggled = Boolean(previous.alertsEnabled) !== Boolean(device.alertsEnabled)
    if (!replaced.length && !toggled) return

    const checks = {...entry.round?.checks}
    for (const axis of axes) {
      if (replaced.includes(axis)) {
        this.cancel(entry.health[axis])
        entry.health[axis] = initial(axis === 'service' && device.service.kind === 'none')
        delete checks[axis]
      } else if (toggled && checks[axis]) {
        // Let an in-flight probe update the UI, but exclude its result after a settings change.
        checks[axis] = {done:checks[axis].done}
      }
    }
    void this.check(entry, replaced, checks)
  }

  health(id: string): DeviceHealth {
    const entry = this.entries.get(id)
    if (!entry) throw Error('장비를 찾을 수 없습니다.')
    return {ssh:{...entry.health.ssh}, service:{...entry.health.service}}
  }

  async refresh(id?: string) {
    const selected = id === undefined ? this.entries.values() : [this.entries.get(id)]
    const pending: Promise<void>[] = []
    for (const entry of selected) {
      if (entry) pending.push(this.check(entry, axes))
    }
    await Promise.all(pending)
  }

  private check(entry: MonitorEntry, requested: readonly Axis[], checks: RoundChecks = {...entry.round?.checks}) {
    if (this.suspended) return Promise.resolve()
    for (const axis of requested) {
      if (!checks[axis] && entry.health[axis].state !== 'unconfigured') {
        checks[axis] = this.enqueue(entry.device, axis, entry.health[axis])
      }
    }
    const previous = entry.round
    if (previous && axes.every(axis => previous.checks[axis] === checks[axis])) return previous.done
    if (!checks.ssh && !checks.service) {
      entry.round = undefined
      return Promise.resolve()
    }

    // Keep even a finished check in this round until its peer settles. Refreshes
    // can join the round and endpoint edits can replace just the affected check.
    const done = Promise.all([checks.ssh?.done, checks.service?.done]).then(() => this.complete(entry, checks))
    entry.round = {checks, done}
    return done
  }

  private complete(entry: MonitorEntry, checks: RoundChecks) {
    if (entry.round?.checks !== checks) return
    entry.round = undefined
    const results: ProbeResults = {}
    for (const axis of axes) {
      const result = checks[axis]?.result
      if (result) results[axis] = result
    }
    if (results.ssh || results.service) this.completed?.(entry.device, results)
  }

  private enqueue(device: RailDevice, axis: Axis, observation: DeviceObservation) {
    const controller = new AbortController()
    let finish!: ()=>void
    const check: AxisCheck = {done:new Promise<void>(resolve => {finish = resolve})}
    this.jobs.set(observation, {controller, finish})
    observation.checking = true
    this.waiting.set(observation, async () => {
      this.active++
      try {
        await this.observe(device, axis, observation, controller, check)
      } finally {
        this.active--
        if (this.jobs.get(observation)?.controller === controller) this.jobs.delete(observation)
        finish()
        this.pump()
      }
    })
    this.changed()
    this.pump()
    return check
  }

  private pump() {
    while (this.active < 8 && this.waiting.size) {
      const [observation, start] = this.waiting.entries().next().value!
      this.waiting.delete(observation)
      start()
    }
  }

  private async observe(device: RailDevice, axis: Axis, observation: DeviceObservation, controller: AbortController, check: AxisCheck) {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
    let result: ProbeResult
    try {
      result = await this.probe(device, axis, signal)
    } catch {
      result = {ok:false, detail:'상태를 확인할 수 없습니다.'}
    }
    if (controller.signal.aborted) return
    const now = Date.now()
    observation.state = result.ok ? 'ok' : 'failed'
    observation.checkedAt = now
    if (result.ok) observation.lastSuccessAt = now
    observation.message = result.detail
    observation.checking = false
    check.result = result
    this.changed()
  }

  private cancel(observation: DeviceObservation) {
    const job = this.jobs.get(observation)
    if (!job) return
    this.jobs.delete(observation)
    this.waiting.delete(observation)
    observation.checking = false
    job.controller.abort()
    job.finish()
  }

  suspend() {
    this.suspended = true
    for (const entry of this.entries.values()) {
      if (entry.round) this.complete(entry, entry.round.checks)
    }
    if (!this.jobs.size) return
    for (const observation of this.jobs.keys()) this.cancel(observation)
    this.changed()
  }

  resume() {
    // Some platforms deliver resume without a preceding suspend event.
    this.suspend()
    this.suspended = false
    return this.refresh()
  }

  remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    entry.round = undefined
    for (const axis of axes) this.cancel(entry.health[axis])
  }

  close() {
    this.suspend()
    this.entries.clear()
  }
}
