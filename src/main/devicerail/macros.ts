import {createHash, randomUUID} from 'node:crypto'
import {StringDecoder} from 'node:string_decoder'
import {Client, type NextAuthHandler} from 'ssh2'
import type {DeviceMacro, DeviceMacroRun, DeviceMacroState, RailDevice} from '../../shared/device-rail'
import type {TermRailEndpoint} from '../../shared/termrail-ssh'
import {SshHostKeys} from '../termrail/ssh-host-keys'
import {macroScript} from './macro-script'

export class DeviceMacroError extends Error {}
const stale = () => new DeviceMacroError('이 매크로 실행은 더 이상 해당 입력을 기다리지 않습니다.')
const unknownResult = '연결 종료 · 결과 확인 필요'

class MacroConnection {
  private readonly client = new Client()
  private closed = false
  private fingerprint?: string
  private approve?: (ok:boolean) => void
  private authenticate?: NextAuthHandler
  private deadline?: NodeJS.Timeout
  private outputUpdate?: NodeJS.Timeout
  private pending?: {run:DeviceMacroRun; commands:string; signal?:string}
  account?: string

  constructor(
    readonly endpoint: TermRailEndpoint,
    private readonly keys: SshHostKeys,
    private readonly changed: () => void,
    private readonly removed: () => void,
  ) {}

  get active() {return this.pending?.run}

  reusable(device:RailDevice) {
    if (device.host !== this.endpoint.host || device.port !== this.endpoint.port || !this.account) return false
    try {return this.keys.get() === this.fingerprint}
    catch {return false}
  }

  start(run:DeviceMacroRun, commands:string) {
    this.pending = {run,commands}
    if (this.account) return this.execute()
    this.arm(30_000, 'SSH 연결 시간이 초과되었습니다.')
    this.client.on('error', () => this.close('SSH 연결 또는 인증에 실패했습니다.'))
    this.client.once('close', () => this.close('SSH 연결이 종료되었습니다.'))
    this.client.on('change password', () => this.close('서버에서 비밀번호 변경을 요구했습니다.'))
    this.client.once('ready', () => {
      if (this.closed || !run.account || !this.fingerprint) return this.close('SSH 인증에 실패했습니다.')
      this.account = run.account
      this.execute()
    })
    try {
      this.client.connect({
        ...this.endpoint, username:'', readyTimeout:0, keepaliveInterval:30_000, keepaliveCountMax:3,
        hostVerifier:(key:Buffer, verify:(ok:boolean)=>void) => {
          if (this.closed) return verify(false)
          const presented = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
          if (this.fingerprint) return verify(presented === this.fingerprint)
          try {
            const previous = this.keys.get()
            run.fingerprint = presented
            if (previous === presented) {
              this.fingerprint = presented
              return verify(true)
            }
            run.previousFingerprint = previous
            run.phase = 'host-key'
            this.approve = verify
            this.arm(120_000, '호스트 키 확인 시간이 초과되었습니다.')
            this.changed()
          } catch {this.close('저장된 호스트 키를 확인할 수 없습니다.')}
        },
        authHandler:(_methods, _partial, next) => {
          if (this.closed) return
          if (!this.fingerprint || run.account || this.authenticate) return this.close('SSH 인증에 실패했습니다.')
          this.authenticate = next
          run.phase = 'login'
          this.arm(120_000, '로그인 입력 시간이 초과되었습니다.')
          this.changed()
        },
      })
    } catch {this.close('SSH 서버에 연결할 수 없습니다.')}
  }

  trust(id:string, fingerprint:string) {
    const run = this.active
    if (!run || run.id !== id || run.phase !== 'host-key' || !this.approve || run.fingerprint !== fingerprint) throw stale()
    try {this.keys.approve(fingerprint, run.previousFingerprint)}
    catch {
      this.close('호스트 키를 저장할 수 없습니다. 다시 연결해 확인하세요.')
      throw new DeviceMacroError('호스트 키를 저장할 수 없습니다. 다시 연결해 확인하세요.')
    }
    const verify = this.approve
    this.approve = undefined
    this.fingerprint = fingerprint
    run.phase = 'connecting'
    this.arm(30_000, 'SSH 인증 응답 시간이 초과되었습니다.')
    verify(true)
    this.changed()
  }

  login(id:string, username:string, password:string) {
    const run = this.active
    if (!run || run.id !== id || run.phase !== 'login' || !this.authenticate || !this.fingerprint) throw stale()
    if (typeof username !== 'string' || !username.length || username.length > 256 || /[\x00-\x1f\x7f]/.test(username)
      || typeof password !== 'string' || password.length > 4096) throw new DeviceMacroError('SSH 로그인 입력을 확인하세요.')
    try {
      if (this.keys.get() !== this.fingerprint) return this.close('호스트 키가 바뀌었습니다. 다시 연결해 확인하세요.')
    } catch {return this.close('저장된 호스트 키를 확인할 수 없습니다.')}
    const next = this.authenticate
    this.authenticate = undefined
    run.account = username
    run.phase = 'connecting'
    this.arm(30_000, 'SSH 인증 응답 시간이 초과되었습니다.')
    const secret = Buffer.from(password)
    try {
      // ssh2 encodes password bytes synchronously, but its declaration only accepts string.
      // @ts-expect-error ssh2 supports a Buffer password.
      next({type:'password',username,password:secret})
    } catch {this.close('SSH 인증 요청에 실패했습니다.')}
    finally {secret.fill(0)}
    this.changed()
  }

  private execute() {
    const pending = this.pending
    if (!pending || this.closed) return
    const {run,commands} = pending
    run.account = this.account
    run.fingerprint = this.fingerprint
    this.arm(30_000, '원격 셸을 여는 시간이 초과되었습니다.')
    try {
      // Reserve the channel before sending any commands. Each exec gets a fresh non-interactive shell.
      this.client.exec('sh -se', (error, channel) => {
        if (this.pending !== pending || this.closed) return channel?.destroy()
        if (error) return this.finish('failed', '원격 셸을 열 수 없습니다.')
        run.phase = 'running'
        this.arm(300_000, '실행 제한 시간 초과 · 결과 확인 필요')
        for (const stream of ['stdout','stderr'] as const) {
          const readable = stream === 'stdout' ? channel : channel.stderr
          const decoder = new StringDecoder('utf8')
          let remaining = 32 * 1024
          readable.on('data', (chunk:Buffer) => {
            if (this.pending !== pending) return
            const size = Math.min(remaining, chunk.length)
            const firstTruncation = !run.truncated && chunk.length > size
            if (chunk.length > size) run.truncated = true
            if (size) {
              remaining -= size
              run[stream] += decoder.write(chunk.subarray(0, size))
            }
            if ((size || firstTruncation) && !this.outputUpdate) {
              this.outputUpdate = setTimeout(() => {this.outputUpdate = undefined; this.changed()}, 150)
              this.outputUpdate.unref()
            }
          })
          readable.once('end', () => {run[stream] += decoder.end()})
          readable.on('error', () => {if (this.pending === pending) this.close(unknownResult)})
        }
        channel.once('exit', (code:number|null, signal?:string) => {
          if (this.pending !== pending) return
          if (typeof code === 'number') run.exitCode = code
          else if (signal) pending.signal = signal.slice(0, 32)
        })
        channel.once('close', () => {
          if (this.pending === pending && !this.finishWithExitStatus()) this.close(unknownResult)
        })
        channel.end(macroScript(commands))
        this.changed()
      })
    } catch {this.close('원격 셸을 열 수 없습니다.')}
  }

  private finishWithExitStatus() {
    const code = this.active?.exitCode
    if (typeof code === 'number') this.finish(code === 0 ? 'succeeded' : 'failed', '종료 코드 ' + code)
    else if (this.pending?.signal) this.finish('failed', '종료 신호 ' + this.pending.signal)
    else return false
    return true
  }

  private arm(ms:number, message:string) {
    clearTimeout(this.deadline)
    this.deadline = setTimeout(() => this.close(message), ms)
    this.deadline.unref()
  }

  private finish(phase:DeviceMacroRun['phase'], message:string) {
    const run = this.active
    if (run) Object.assign(run, {phase,message,finishedAt:Date.now()})
    this.pending = undefined
    clearTimeout(this.outputUpdate)
    this.outputUpdate = undefined
    clearTimeout(this.deadline)
    this.changed()
  }

  close(message = '사용자가 연결을 해제했습니다.', cancelled = false) {
    if (this.closed) return
    this.closed = true
    this.removed()
    this.approve = undefined
    this.authenticate = undefined
    this.account = undefined
    this.client.destroy()
    if (this.finishWithExitStatus()) return
    if (this.active?.phase === 'running')
      this.finish('uncertain', message.includes('시간 초과') ? message : unknownResult)
    else this.finish(cancelled ? 'cancelled' : 'failed', message)
  }
}

export class DeviceMacros {
  private readonly connections = new Map<string, MacroConnection>()
  private readonly results = new Map<string, Map<string, DeviceMacroRun>>()
  private disposed = false

  constructor(private readonly pinFile:string, private readonly changed:()=>void = () => {}) {}

  state(deviceId:string):DeviceMacroState {
    return {account:this.connections.get(deviceId)?.account, runs:Array.from(this.results.get(deviceId)?.values() ?? [], run => ({...run}))}
  }

  start(device:RailDevice, macro:DeviceMacro) {
    if (this.disposed) throw new DeviceMacroError('앱이 종료 중입니다.')
    let connection = this.connections.get(device.id)
    if (connection?.active) throw new DeviceMacroError('이 장비에서 이미 매크로를 실행하고 있습니다.')
    if (!connection?.reusable(device)) {
      connection?.close()
      const endpoint = {host:device.host, port:device.port}
      connection = new MacroConnection(endpoint, new SshHostKeys(this.pinFile,endpoint), this.changed,
        () => this.connections.delete(device.id))
      this.connections.set(device.id,connection)
    }
    const run:DeviceMacroRun = {
      id:randomUUID(), deviceId:device.id, deviceName:device.name, host:device.host, port:device.port,
      macroId:macro.id, macroName:macro.name, startedAt:Date.now(), phase:'connecting', stdout:'',stderr:'',truncated:false,
    }
    const results = this.results.get(device.id) ?? new Map<string,DeviceMacroRun>()
    results.set(macro.id,run)
    this.results.set(device.id,results)
    connection.start(run,macro.commands)
    this.changed()
    return run.id
  }

  trust(deviceId:string, runId:string, fingerprint:string) {
    const connection = this.connections.get(deviceId)
    if (!connection) throw stale()
    connection.trust(runId,fingerprint)
  }

  login(deviceId:string, runId:string, username:string, password:string) {
    const connection = this.connections.get(deviceId)
    if (!connection) throw stale()
    connection.login(runId,username,password)
  }

  disconnect(deviceId:string) {
    this.connections.get(deviceId)?.close('사용자가 연결을 해제했습니다.', true)
  }

  forgetMacro(deviceId:string, macroId:string) {
    if (this.connections.get(deviceId)?.active?.macroId === macroId) this.disconnect(deviceId)
    this.results.get(deviceId)?.delete(macroId)
  }

  remove(deviceId:string) {
    this.results.delete(deviceId)
    this.disconnect(deviceId)
  }

  dispose() {
    this.disposed = true
    for (const id of this.connections.keys()) this.disconnect(id)
    this.results.clear()
  }
}
