import { createHash } from 'node:crypto'
import { Client, type ClientChannel, type NextAuthHandler } from 'ssh2'
import { termRailSessionLimit, type TermRailEndpoint, type TermRailSshPhase, type TermRailSshRead } from '../../shared/termrail-ssh'
import { SshHostKeys } from './ssh-host-keys'
import { SshOutput } from './ssh-output'

const invalid = () => new Error('잘못된 터미널 요청입니다.')

class SshSession {
  private readonly client = new Client()
  private channel?: ClientChannel
  private readonly output = new SshOutput()
  private phase: TermRailSshPhase = 'connecting'
  private message?: string
  private fingerprint?: string
  private previousFingerprint?: string
  private verifiedFingerprint?: string
  private verifyKey?: (trusted: boolean) => void
  private authenticate?: NextAuthHandler
  private pendingWrite?: (error?: Error | null) => void
  private deadline?: ReturnType<typeof setTimeout>
  private cols = 80
  private rows = 24

  constructor(private readonly endpoint: TermRailEndpoint, private readonly keys: SshHostKeys) {}

  start() {
    this.armDeadline()
    this.client.on('error', () => this.finish('SSH 서버 연결에 실패했습니다. 주소와 연결 상태를 확인하세요.'))
    this.client.on('close', () => this.finish(this.phase === 'connected' ? undefined : 'SSH 연결이 종료되었습니다.'))
    this.client.on('change password', () => this.finish('서버에서 비밀번호 변경을 요구했습니다.'))
    this.client.once('ready', () => this.startShell())
    try {
      this.client.connect({
        ...this.endpoint,
        // ssh2 requires a config username. The auth handler supplies the actual user only after verification.
        username: '',
        readyTimeout: 0,
        keepaliveInterval: 30_000,
        keepaliveCountMax: 3,
        hostVerifier: (key: Buffer, verify: (trusted: boolean) => void) => {
          if (this.finished) return verify(false)
          const fingerprint = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
          try {
            if (this.verifiedFingerprint) {
              verify(fingerprint === this.verifiedFingerprint)
              return
            }
            const previous = this.keys.get()
            if (previous === fingerprint) {
              this.verifiedFingerprint = fingerprint
              verify(true)
              return
            }
            if (this.phase !== 'connecting') {
              this.finish('연결 중 서버 호스트 키가 바뀌었습니다.')
              return
            }
            this.clearDeadline()
            this.phase = 'host-key'
            this.previousFingerprint = previous
            this.fingerprint = fingerprint
            this.verifyKey = verify
          } catch {
            this.finish('저장된 호스트 키를 확인할 수 없습니다.')
          }
        },
        authHandler: (_methods, _partial, next) => {
          if (this.finished) return
          if (!this.verifiedFingerprint || this.phase !== 'connecting') {
            this.finish('SSH 인증에 실패했습니다. 아이디와 비밀번호를 확인하세요.')
            return
          }
          this.clearDeadline()
          this.phase = 'login'
          this.authenticate = next
        },
      })
    } catch {
      this.finish('SSH 서버에 연결할 수 없습니다.')
    }
  }

  private get finished() {
    return this.phase === 'closed' || this.phase === 'failed'
  }

  private clearDeadline() {
    clearTimeout(this.deadline)
    this.deadline = undefined
  }

  private armDeadline() {
    this.clearDeadline()
    this.deadline = setTimeout(() => this.finish('SSH 서버 응답 시간이 초과되었습니다.'), 30_000)
    this.deadline.unref()
  }

  trust(fingerprint: string) {
    if (this.phase !== 'host-key' || !this.verifyKey || fingerprint !== this.fingerprint) throw invalid()
    this.keys.approve(fingerprint, this.previousFingerprint)
    this.verifiedFingerprint = fingerprint
    const verify = this.verifyKey
    this.verifyKey = undefined
    this.phase = 'connecting'
    this.armDeadline()
    verify(true)
  }

  login(username: string, password: string) {
    if (this.phase !== 'login' || !this.authenticate || typeof username !== 'string' || !username.length ||
        username.length > 256 || /[\x00-\x1f\x7f]/.test(username) || typeof password !== 'string' || password.length > 4096)
      throw invalid()
    const next = this.authenticate
    this.authenticate = undefined
    this.phase = 'authenticating'
    this.armDeadline()
    // ssh2 copies the Buffer into its auth packet synchronously, retaining a reference in curAuth.
    const secret = Buffer.from(password)
    try {
      // @ts-expect-error ssh2 accepts Buffer for password auth; @types/ssh2 currently declares only string.
      next({ type: 'password', username, password: secret })
    } catch {
      this.finish('SSH 인증 요청에 실패했습니다.')
    } finally {
      secret.fill(0)
    }
  }

  private startShell() {
    if (this.phase !== 'authenticating') return this.finish('SSH 인증 상태를 확인할 수 없습니다.')
    const { cols, rows } = this
    this.client.shell({ term: 'xterm-256color', cols, rows }, (error, channel) => {
      if (this.finished) return channel?.destroy()
      if (error) return this.finish('서버에서 대화형 터미널을 열 수 없습니다.')
      this.clearDeadline()
      this.channel = channel
      this.phase = 'connected'
      if (cols !== this.cols || rows !== this.rows) channel.setWindow(this.rows, this.cols, 0, 0)
      channel.on('readable', () => this.drainOutput())
      channel.stderr.on('readable', () => this.drainOutput())
      channel.on('error', () => this.finish('터미널 연결이 끊겼습니다.'))
      channel.stderr.on('error', () => this.finish('터미널 연결이 끊겼습니다.'))
      channel.once('close', () => this.finish())
    })
  }

  private drainOutput() {
    if (!this.channel) return
    for (const stream of [this.channel, this.channel.stderr]) {
      while (stream.readableLength && this.output.allowance) {
        const chunk = stream.read(Math.min(stream.readableLength, this.output.allowance)) as Buffer | null
        if (!chunk) break
        this.output.append(chunk)
      }
      // Consume the EOF notification even when the last readable event carries no bytes.
      // ssh2 delivers channel close after the readable side has emitted end.
      if (!stream.readableLength && stream.readable) stream.read(0)
    }
  }

  read(cursor: number): TermRailSshRead {
    this.output.acknowledge(cursor)
    this.drainOutput()
    const page = this.output.read(cursor)
    return {
      ...this.endpoint, ...page, phase: this.phase, message: this.message,
      fingerprint: this.fingerprint, previousFingerprint: this.previousFingerprint,
      more: page.more || !!(this.channel?.readableLength || this.channel?.stderr.readableLength),
    }
  }

  resize(cols: number, rows: number) {
    if (![cols, rows].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) throw invalid()
    this.cols = cols
    this.rows = rows
    if (this.phase === 'connected') this.channel!.setWindow(rows, cols, 0, 0)
  }

  write(data: string | Uint8Array): Promise<void> {
    if (this.phase !== 'connected' || !this.channel || this.pendingWrite) throw invalid()
    if (typeof data !== 'string' && !(data instanceof Uint8Array)) throw invalid()
    if (Buffer.byteLength(data) > 64 * 1024) throw invalid()
    const channel = this.channel
    return new Promise((resolve, reject) => {
      const done = (error?: Error | null) => {
        if (this.pendingWrite !== done) return
        this.pendingWrite = undefined
        if (error) reject(new Error('터미널 입력을 전송할 수 없습니다.'))
        else resolve()
      }
      this.pendingWrite = done
      try {
        channel.write(data, done)
      } catch {
        done(invalid())
      }
    })
  }

  finish(message?: string) {
    if (this.finished) return
    this.clearDeadline()
    this.phase = message ? 'failed' : 'closed'
    this.message = message
    this.verifyKey = undefined
    this.authenticate = undefined
    this.pendingWrite?.(invalid())
    this.client.destroy()
  }
}

export function isSshSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
}

export class TermRailSshService {
  private readonly sessions = new Map<string, SshSession>()
  constructor(private readonly pinFile: string) {}

  open(id: string, endpoint: TermRailEndpoint) {
    if (!isSshSessionId(id) || this.sessions.has(id) || !endpoint || typeof endpoint.host !== 'string' ||
        !endpoint.host.length || endpoint.host.length > 253 || /[\s/\\@?#\x00-\x1f\x7f]/.test(endpoint.host) ||
        !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) throw invalid()
    if (this.sessions.size >= termRailSessionLimit) throw new Error(`터미널은 최대 ${termRailSessionLimit}개까지 열 수 있습니다.`)
    const target = { host: endpoint.host, port: endpoint.port }
    const session = new SshSession(target, new SshHostKeys(this.pinFile, target))
    this.sessions.set(id, session)
    session.start()
  }

  private get(id: string) {
    const session = this.sessions.get(id)
    if (!session) throw new Error('터미널 세션을 찾을 수 없습니다.')
    return session
  }

  read(id: string, cursor: number) { return this.get(id).read(cursor) }
  trust(id: string, fingerprint: string) { this.get(id).trust(fingerprint) }
  login(id: string, username: string, password: string) { this.get(id).login(username, password) }
  resize(id: string, cols: number, rows: number) { this.get(id).resize(cols, rows) }
  write(id: string, data: string | Uint8Array) { return this.get(id).write(data) }
  close(id: string) {
    this.sessions.get(id)?.finish()
    this.sessions.delete(id)
  }
  dispose() {
    for (const id of this.sessions.keys()) this.close(id)
  }
}
