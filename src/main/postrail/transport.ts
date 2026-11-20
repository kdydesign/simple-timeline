import {diagnosticMask, redactor, transportSource} from './diagnostics'
import { PostRailRunError, type PreparedRun } from './prepare'
import type { PrDetail } from '../../shared/postrail-run'

export type PostRailFetch = (url:string, options:RequestInit) => Promise<Response>
type WireResult = { status:number, headers:Headers, body:string, bodyFailure?: 'timeout' | 'interrupted', bodyError?:string }

async function transfer(fetchImpl:PostRailFetch, url:string, options:RequestInit, timeoutMs:number): Promise<WireResult> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      ...options, signal:abort.signal, redirect:'manual', credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
    })
    const head = { status:response.status, headers:response.headers }
    try {
      return { ...head, body:await response.text() }
    } catch (error) {
      return { ...head, body:'', bodyFailure:abort.signal.aborted ? 'timeout' : 'interrupted', bodyError:transportSource(error) }
    }
  } catch (error) {
    if (abort.signal.aborted) throw new DeadlineError('응답 시간 초과', {cause:error})
    throw error
  } finally { clearTimeout(timer) }
}

class DeadlineError extends Error {}
interface Token {
  value:string
  expiresAt:number | null
}

function expiry(data: Record<string, unknown>, value:string): number | null {
  const candidates:number[] = []
  const relative = Number(data.expires_in)
  if (data.expires_in != null && Number.isFinite(relative)) candidates.push(Date.now() + relative * 1000)
  if (typeof data.expires_at === 'string' || typeof data.expires_at === 'number') {
    const secondsOrMs = Number(data.expires_at)
    candidates.push(Number.isFinite(secondsOrMs) ? secondsOrMs * (secondsOrMs < 1e12 ? 1000 : 1) : Date.parse(String(data.expires_at)))
  }
  // Reading exp only constrains cache lifetime. The configured API authenticates the token.
  if (value.split('.').length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString())
      if (typeof claims.exp === 'number') candidates.push(claims.exp * 1000)
    } catch { /* Opaque tokens do not have JWT claims. */ }
  }
  const known = candidates.filter(Number.isFinite)
  return known.length ? Math.min(...known) : null
}

export class LoginFailure extends PostRailRunError {
  constructor(message:string, readonly source:string) { super(message) }
}

export async function login(fetchImpl:PostRailFetch, run:PreparedRun, secrets:string[]): Promise<Token> {
  const login = run.login!
  let result: WireResult
  try {
    result = await transfer(fetchImpl, login.url, { method:'POST', headers:login.headers, body:login.body }, run.timeoutMs)
  } catch (error) {
    const message = error instanceof DeadlineError ? '실행 전 로그인 응답 시간이 초과되었습니다.' : '실행 전 로그인 서버에 연결할 수 없습니다.'
    throw new LoginFailure(message,diagnosticMask(run,secrets,undefined,true)(transportSource(error)))
  }
  if (result.status < 200 || result.status >= 300) {
    throw new LoginFailure('실행 전 로그인 실패 (HTTP ' + result.status + ')',diagnosticMask(run,secrets,result.headers,true)(result.bodyError || result.body))
  }
  try {
    if (result.bodyFailure) {
      const message = result.bodyFailure === 'timeout' ? '실행 전 로그인 응답 시간이 초과되었습니다.' : '로그인 응답 본문 수신이 중단되었습니다.'
      throw new LoginFailure(message,diagnosticMask(run,secrets,result.headers,true)(result.bodyError ?? ''))
    }
    const data = JSON.parse(result.body)
    let value: unknown = data
    for (const key of run.env.tokenPath.split('.')) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value,key)) throw Error()
      value = (value as Record<string, unknown>)[key]
    }
    if (typeof value !== 'string' || !value.trim()) throw Error()
    const expiresAt = expiry(data, value)
    if (expiresAt !== null && expiresAt <= Date.now()) throw new PostRailRunError('로그인 서버가 만료된 토큰을 반환했습니다.')
    return { value, expiresAt }
  } catch (error) {
    if (error instanceof PostRailRunError) throw error
    throw new PostRailRunError('실행 전 인증에 실패했습니다. 로그인 주소·인증서·토큰 JSON 경로를 확인하세요.')
  }
}

const confidential = /^(?:authorization|proxy-authorization|cookie2?|set-cookie2?|password|passwd|(?:access[_-]?|refresh[_-]?)?token|(?:x-)?api[_-]?key)$/i

function transportFailure(error: unknown, method:string): Pick<PrDetail, 'outcome' | 'message'> {
  if (error instanceof DeadlineError) return {outcome:'uncertain',message:'응답 시간 초과 · 결과 확인 필요'}
  const cause = error instanceof Error ? error.cause as { code?:unknown } | undefined : undefined
  const code = String(cause?.code ?? '') + ' ' + (error instanceof Error ? error.message : '')
  if (/CERT|TLS|SSL/i.test(code)) return {outcome:'error',message:'HTTPS 인증서 또는 TLS 연결을 확인하세요.'}
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ERR_(?:NAME_NOT_RESOLVED|CONNECTION_REFUSED|ADDRESS_UNREACHABLE)/i.test(code)) {
    return {outcome:'error',message:'서버 주소 또는 연결을 확인하세요.'}
  }
  return method === 'GET' ? {outcome:'error',message:'응답을 받지 못했습니다.'} : {outcome:'uncertain',message:'응답을 받지 못했습니다. 결과 확인 필요'}
}

export async function sendRequest(fetchImpl:PostRailFetch, run:PreparedRun, iteration:string, index:string | null, headers: Headers, secrets:string[]): Promise<{detail:PrDetail,source?:string}> {
  const started = performance.now()
  const base = { iteration, index, headers:{}, body:'', status:null }
  const body = await run.body(index ?? undefined)
  try {
    const response = await transfer(fetchImpl, run.url, { method:run.request.method, headers, body }, run.timeoutMs)
    const ok = response.status >= 200 && response.status < 300
    const clean = redactor(secrets)
    const maskedHeaders = Object.fromEntries([...response.headers].map(([name,value]) => [
      clean(name), confidential.test(name) || (run.request.useAuth && name === run.env.tokenHeader.toLowerCase()) ? '••••' : clean(value),
    ]))
    let outcome: PrDetail['outcome'] = ok ? 'success' : 'error'
    let message = 'HTTP ' + response.status
    if (response.bodyFailure) {
      message += response.bodyFailure === 'timeout' ? ' · 응답 본문 시간 초과' : ' · 응답 본문 수신 중단'
      if (ok) { outcome = 'uncertain'; message += ' · 결과 확인 필요' }
    }
    const maskedBody = clean(response.body)
    const detail = {...base, status:response.status, outcome, message,
      headers:maskedHeaders, body:maskedBody, durationMs:Math.round(performance.now()-started)}
    const rawSource = response.bodyError || (!ok && response.body)
    return {detail,source:rawSource ? diagnosticMask(run,secrets,response.headers)(rawSource) : undefined}
  } catch (error) {
    const detail = { ...base, ...transportFailure(error, run.request.method), durationMs:Math.round(performance.now()-started) }
    return {detail,source:diagnosticMask(run,secrets)(transportSource(error))}
  }
}
