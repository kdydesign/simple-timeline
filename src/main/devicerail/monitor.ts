import type {DeviceHealth, DeviceObservation, RailDevice} from '../../shared/device-rail'
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
const axes: Axis[] = ['ssh', 'service']

function probeAxis(device: RailDevice, axis: Axis, signal: AbortSignal): Promise<ProbeResult> {
  if (axis === 'ssh') return probeSsh(device.host, device.port, signal)
  if (device.service.kind === 'tcp') return probeTcp(device.host, device.service.port, signal)
  if (device.service.kind === 'http') return probeHttp(device.service.url, signal)
  throw Error('제품 서비스 검사가 설정되지 않았습니다.')
}

function initial(unconfigured = false): DeviceObservation {
  return {state:unconfigured ? 'unconfigured' : 'unknown', checking:false, checkedAt:null, lastSuccessAt:null, message:''}
}

function sameService(left: RailDevice, right: RailDevice) {
  if (left.host !== right.host) return false
  const a = left.service, b = right.service
  switch (a.kind) {
    case 'none': return b.kind === 'none'
    case 'http': return b.kind === 'http' && a.url === b.url
    case 'tcp': return b.kind === 'tcp' && a.port === b.port
  }
}

export class DeviceMonitor {
  private readonly entries = new Map<string, {device:RailDevice; health:DeviceHealth}>()
  private readonly jobs = new Map<DeviceObservation, {controller:AbortController; done:Promise<void>; finish:()=>void}>()
  private readonly waiting = new Map<DeviceObservation, ()=>void>()
  private active = 0
  private suspended = false

  constructor(private readonly changed: ()=>void, private readonly probe = probeAxis) {}

  set(device: RailDevice) {
    const old = this.entries.get(device.id)
    const keepSsh = old && old.device.host === device.host && old.device.port === device.port
    const keepService = old && sameService(old.device, device)
    const health = {
      ssh:keepSsh ? old.health.ssh : initial(),
      service:keepService ? old.health.service : initial(device.service.kind === 'none'),
    }
    this.entries.set(device.id, {device, health})
    for (const axis of axes) {
      if (old?.health[axis] === health[axis]) continue
      if (old) this.cancel(old.health[axis])
      void this.enqueue(device, axis, health[axis])
    }
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
      if (entry) for (const axis of axes) pending.push(this.enqueue(entry.device, axis, entry.health[axis]))
    }
    await Promise.all(pending)
  }

  private enqueue(device: RailDevice, axis: Axis, observation: DeviceObservation): Promise<void> {
    if (this.suspended || observation.state === 'unconfigured') return Promise.resolve()
    const existing = this.jobs.get(observation)
    if (existing) return existing.done

    const controller = new AbortController()
    let finish!: ()=>void
    const done = new Promise<void>(resolve => {finish = resolve})
    this.jobs.set(observation, {controller, done, finish})
    observation.checking = true
    this.waiting.set(observation, () => {
      this.active++
      void this.observe(device, axis, observation, controller).finally(() => {
        this.active--
        if (this.jobs.get(observation)?.controller === controller) this.jobs.delete(observation)
        finish()
        this.pump()
      })
    })
    this.changed()
    this.pump()
    return done
  }

  private pump() {
    while (this.active < 8 && this.waiting.size) {
      const [observation, start] = this.waiting.entries().next().value!
      this.waiting.delete(observation)
      start()
    }
  }

  private async observe(device: RailDevice, axis: Axis, observation: DeviceObservation, controller: AbortController) {
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
    for (const axis of axes) this.cancel(entry.health[axis])
  }

  close() {
    for (const id of this.entries.keys()) this.remove(id)
  }
}
