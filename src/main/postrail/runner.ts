import { randomUUID } from 'node:crypto'
import {PostRailConsole} from './console'
import {safeDraftMessage, type PrDraftProblem} from '../../shared/postrail-console'
import type { PrFile, PrLibrary, PrMethod } from '../../shared/postrail'
import { postRailBusy, validPostRailCount, type PrDetail, type PrRow, type PrRunState, type PrStart } from '../../shared/postrail-run'
import { PostRailRunError, prepareRun, setHeader, type PreparedRun } from './prepare'
import { PostRailResults } from './results'
import { login, LoginFailure, sendRequest, type PostRailFetch } from './transport'

export { PostRailRunError } from './prepare'

interface RunStore {
  read(): PrLibrary
  password(id:string): string
  reserveIndex(id:string): string
  openFile?(id:string,file:PrFile):()=>Promise<Blob>
}

const initialState: PrRunState = {
  phase:'idle', runId:'', requestId:'', requestName:'', environmentId:'', environmentName:'',
  total:'0', completed:'0', failed:'0', uncertain:'0', message:'', authenticatedEnvironmentIds:[],
}

export class PostRailRunner {
  private readonly console = new PostRailConsole(() => this.onChange())
  private current = { ...initialState }
  private results: PostRailResults | null = null
  private readonly tokens = new Map<string, Awaited<ReturnType<typeof login>>>()
  private active: Promise<void> | null = null
  private expiryTimer?: ReturnType<typeof setTimeout>
  private usingAuth = false
  private closing = false

  constructor(
    private readonly store: RunStore,
    private readonly fetchImpl: PostRailFetch,
    private readonly defaultTimeoutMs = 30000,
    private readonly onChange: () => void = () => {},
  ) {}

  private token(id:string) {
    const token = this.tokens.get(id)
    if (token && token.expiresAt !== null && token.expiresAt <= Date.now()) {
      this.tokens.delete(id)
      return undefined
    }
    return token
  }

  private scheduleExpiry() {
    clearTimeout(this.expiryTimer)
    if (this.closing) return
    let earliest = Infinity
    for (const token of this.tokens.values()) {
      if (token.expiresAt !== null) earliest = Math.min(earliest, token.expiresAt)
    }
    if (!Number.isFinite(earliest)) return
    const delay = Math.max(0, Math.min(2147483647, earliest - Date.now()))
    this.expiryTimer = setTimeout(() => {
      for (const id of this.tokens.keys()) this.token(id)
      this.scheduleExpiry()
      this.onChange()
    }, delay)
    this.expiryTimer.unref()
  }

  state(): PrRunState {
    const authenticatedEnvironmentIds = [...this.tokens.keys()].filter(id => this.token(id) !== undefined)
    return { ...this.current, authenticatedEnvironmentIds, consoleVersion:this.console.version, sendErrors:this.console.sendErrors() }
  }

  consoleSince(after: number) { return this.console.since(after) }

  private preflightError(requestId: string, environmentId: string, method: PrMethod, message: string, attemptId?: string) {
    if (attemptId && this.console.hasAttempt(attemptId)) return
    if (attemptId) this.console.recordAttempt(attemptId)
    let library: PrLibrary | undefined
    try { library = this.store.read() } catch { /* The failed preparation may itself be a library read error. */ }
    const requestName = library?.requests.find(request => request.id === requestId)?.name ?? '요청'
    const environmentName = library?.environments.find(env => env.id === environmentId)?.name ?? '환경 없음'
    this.console.write({requestId, environmentId, requestName, environmentName, method}, message, {error:true, preflight:true})
  }

  invalidDraft(requestId: string, environmentId: string, category: PrDraftProblem, method: PrMethod, diagnosis = '', attemptId?: string) {
    this.preflightError(requestId, environmentId, method, safeDraftMessage(category, diagnosis), attemptId)
  }

  rejectStart(input: PrStart, message: string): never {
    const request = input?.request
    if (!this.closing && typeof request?.id === 'string' && typeof input.environmentId === 'string' && ['GET','POST','DELETE'].includes(request.method)) {
      this.preflightError(request.id, input.environmentId, request.method, message, input.attemptId)
    }
    throw new PostRailRunError(message)
  }

  private checked<T>(input: PrStart, action: () => T): T {
    try { return action() } catch (error) {
      this.rejectStart(input, error instanceof PostRailRunError ? error.message : '요청을 준비할 수 없습니다.')
    }
  }

  private prepare(input:PrStart) {
    if (this.closing) throw new PostRailRunError('PostRail을 종료하는 중입니다.')
    if (postRailBusy(this.current.phase)) throw new PostRailRunError('현재 실행이 끝난 뒤 다시 보내세요.')
    if (!input || typeof input !== 'object') throw new PostRailRunError('요청 입력을 확인하세요.')
    return prepareRun(input, this.store.read(), this.defaultTimeoutMs, id => this.store.password(id), !!this.token(input.environmentId), this.store.openFile?.bind(this.store))
  }

  preview(input:PrStart): string[] {
    return this.checked(input, () => this.prepare(input).httpUrls)
  }

  start(input: PrStart): PrRunState {
    return this.checked(input, () => this.startPrepared(input))
  }

  private startPrepared(input: PrStart): PrRunState {
    const run = this.prepare(input)
    if (run.httpUrls.length && input.allowPlaintext !== true) throw new PostRailRunError('전송 전 실제 HTTP 평문 주소를 확인하세요.')
    if (input.approvedHttpUrls !== undefined && (!Array.isArray(input.approvedHttpUrls) ||
      run.httpUrls.some(url => !input.approvedHttpUrls!.includes(url)))) throw new PostRailRunError('HTTP 대상이 변경되었습니다. 평문 주소를 다시 확인하세요.')
    const results = new PostRailResults()
    this.results?.close()
    this.results = results
    this.current = {
      ...initialState, runId:randomUUID(), phase:run.login ? 'authenticating' : 'running', requestId:run.request.id,
      requestName:run.request.name, environmentId:run.env.id, environmentName:run.env.name, total:input.count,
    }
    // A lost IPC reply after dispatch must not be reported as a second, unsent attempt.
    if (input.attemptId) this.console.recordAttempt(input.attemptId)
    this.usingAuth = run.request.useAuth
    this.active = this.execute(run, results)
    this.onChange()
    return this.state()
  }

  invalidateEnvironment(id:string) {
    this.tokens.delete(id)
    this.scheduleExpiry()
    if (this.usingAuth && this.current.environmentId === id && postRailBusy(this.current.phase)) {
      this.current.phase = 'stopping'
      this.current.message = '환경 인증이 변경되어 현재 회차 후 중지합니다.'
    }
    this.onChange()
  }

  private async execute(run:PreparedRun, results:PostRailResults) {
    const context = {requestId:run.request.id, requestName:run.request.name, method:run.request.method,
      environmentId:run.env.id, environmentName:run.env.name}
    let authenticating = !!run.login
    try {
      const headers = new Headers(run.headers)
      const secrets = [run.password]
      // If a server echoes a manually supplied credential in another field,
      // protect both the header and its value in the stored response.
      for (const [name,value] of headers) {
        if (/authorization|api[-_]?key|token|password/i.test(name)) secrets.push(value, value.replace(/^\S+\s+/, ''))
      }
      if (run.request.useAuth) {
        if (run.login) this.console.write(context, '로그인 시작')
        const token = run.login ? await login(this.fetchImpl, run, secrets) : this.token(run.env.id)
        if (this.current.phase === 'stopping') return
        if (!token) throw new PostRailRunError('인증이 만료되었습니다. 다시 보내세요.')
        setHeader(headers, run.env.tokenHeader, run.env.tokenPrefix + token.value)
        if (run.login) {
          this.tokens.set(run.env.id,token)
          this.scheduleExpiry()
        }
        this.console.write(context, run.login ? '토큰 발급' : '토큰 재사용')
        authenticating = false
        secrets.push(token.value)
      }
      this.current.phase = 'running'
      for (let number = 1n; number <= run.total; number++) {
        if (this.stopping()) break
        if (run.request.useAuth && !this.token(run.env.id)) {
          this.current.phase = 'stopping'
          this.current.message = '인증이 만료되어 중지했습니다. 다음 실행에서 다시 로그인합니다.'
          this.console.write(context, this.current.message, {error:true})
          break
        }
        let index: string | null = null
        if (run.indexed) {
          try { index = this.store.reserveIndex(run.request.id) }
          catch { throw new PostRailRunError('다음 인덱스를 저장할 수 없어 발송을 중지했습니다.') }
        }
        this.console.write(context, '요청 전송', {iteration:String(number)})
        const {detail,source} = await sendRequest(this.fetchImpl, run, String(number), index, headers, secrets)
        this.current.completed = String(number)
        if (detail.outcome === 'error') this.current.failed = String(BigInt(this.current.failed)+1n)
        if (detail.outcome === 'uncertain') this.current.uncertain = String(BigInt(this.current.uncertain)+1n)
        if (detail.status === 401 && run.request.useAuth) {
          this.tokens.delete(run.env.id)
          this.scheduleExpiry()
          this.current.phase = 'stopping'
          this.current.message = '인증이 거부되어 중지했습니다. 다음 실행에서 다시 로그인합니다.'
        }
        const error = detail.outcome !== 'success'
        let message = detail.status !== null ? '응답 ' + detail.message : detail.message
        if (detail.status === 401) {
          message = (run.request.useAuth ? '환경 토큰을 붙인 본 요청 ' : '환경 인증 없이 전송한 본 요청 ') + detail.message
          if (run.request.useAuth) message += ' · 캐시 폐기'
        }
        this.console.write(context, message, {iteration:detail.iteration, durationMs:detail.durationMs, error, source})
        try { results.put(detail) }
        catch { throw new PostRailRunError('회차 결과를 임시 저장할 수 없어 이후 발송을 중지했습니다.') }
        this.onChange()
      }
    } catch (error) {
      this.current.phase = 'failed'
      this.current.message = error instanceof PostRailRunError ? error.message : '요청을 실행할 수 없습니다.'
      if (authenticating) this.current.message += ' · 본 요청 미전송'
      this.console.write(context, this.current.message, {error:true, source:error instanceof LoginFailure ? error.source : undefined})
    } finally {
      if (this.current.phase !== 'failed') this.current.phase = this.stopping() ? 'stopped' : 'completed'
      if (this.current.phase === 'completed' && this.current.failed === '0' && this.current.uncertain === '0') {
        this.console.succeeded(context)
      }
      this.usingAuth = false
      this.onChange()
    }
  }

  private stopping() { return this.current.phase === 'stopping' }

  stop(): PrRunState {
    if (postRailBusy(this.current.phase)) this.current.phase = 'stopping'
    this.onChange()
    return this.state()
  }

  private unsent(iteration:string): PrDetail {
    return { iteration, index:null, outcome:'unsent', status:null, durationMs:0, message:'미전송', body:'', headers:{} }
  }

  page(offset:string): PrRow[] {
    if (typeof offset !== 'string' || !/^(0|[1-9]\d*)$/.test(offset)) throw new PostRailRunError('회차 범위를 확인하세요.')
    const completed = BigInt(this.current.completed)
    const count = postRailBusy(this.current.phase) ? completed : BigInt(this.current.total)
    const first = BigInt(offset) + 1n
    const rows:PrRow[] = []
    for (let n = first; n <= count && n < first + 100n; n++) {
      if (n > completed) {
        const { body, headers, ...row } = this.unsent(String(n))
        rows.push(row)
      } else {
        const row = this.results?.summary(String(n))
        if (row) rows.push(row)
      }
    }
    return rows
  }

  detail(iteration:string): PrDetail | null {
    if (!validPostRailCount(iteration)) throw new PostRailRunError('양의 정수 회차를 입력하세요.')
    const n = BigInt(iteration)
    if (n > BigInt(this.current.total)) return null
    if (n > BigInt(this.current.completed)) return postRailBusy(this.current.phase) ? null : this.unsent(iteration)
    return this.results?.detail(iteration) ?? null
  }

  async shutdown() {
    this.closing = true
    clearTimeout(this.expiryTimer)
    this.stop()
    await this.active
    this.tokens.clear()
    this.console.close()
    this.results?.close()
    this.results = null
  }
}
