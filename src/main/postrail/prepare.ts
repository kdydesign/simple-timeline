import type { PrEnv, PrLibrary, PrRequest } from '../../shared/postrail'
import { usesPostRailIndex, validPostRailCount, type PrStart } from '../../shared/postrail-run'

export class PostRailRunError extends Error {}

function invalid(message: string): never {
  throw new PostRailRunError(message)
}

type Variables = Record<string,string>
function substitute(template: string, variables: Variables, index?: string): string {
  if (typeof template !== 'string') invalid('문자열 입력을 확인하세요.')
  return template.replace(/\$\{([^{}]*)\}/g, (_placeholder, name: string) => {
    if (name === 'index' && index !== undefined) return index
    if (!Object.hasOwn(variables, name)) invalid('등록되지 않았거나 이 위치에서 사용할 수 없는 변수입니다.')
    return variables[name]
  })
}

function target(template: string, variables: Variables): URL {
  const address = substitute(template, variables)
  let url: URL
  try { url = new URL(address) } catch { return invalid('요청 또는 로그인 URL을 확인하세요.') }
  if (!['https:', 'http:'].includes(url.protocol)) invalid('HTTP 또는 HTTPS 주소를 입력하세요.')
  if (url.username || url.password || url.hash) invalid('URL에 계정 정보나 조각 식별자를 넣을 수 없습니다.')
  for (const name of url.searchParams.keys()) {
    if (/^(?:password|passwd|access[_-]?token|token|api[_-]?key|authorization)$/i.test(name)) invalid('비밀값은 URL에 넣을 수 없습니다.')
  }
  return url
}

// Routing, hop-by-hop and ambient browser credentials must remain under transport control.
const restrictedHeader = /^(?:host|connection|content-length|transfer-encoding|keep-alive|upgrade|te|trailer|cookie2?|set-cookie|proxy-.*|sec-.*|forwarded|x-forwarded-.*)$/i

function checkHeaderName(name: string) {
  if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || restrictedHeader.test(name)) invalid('사용할 수 없는 HTTP 헤더 이름입니다.')
}

export function setHeader(headers: Headers, name: string, value: string) {
  checkHeaderName(name)
  if (headers.has(name)) invalid('동일한 이름의 요청 헤더가 이미 있습니다.')
  try { headers.set(name, value) } catch { invalid('HTTP 헤더 값을 확인하세요.') }
}

function prepareHeaders(definition: Variables, variables: Variables) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) invalid('HTTP 헤더 목록을 확인하세요.')
  const headers = new Headers()
  for (const [name, value] of Object.entries(definition)) setHeader(headers, name, substitute(value, variables))
  return headers
}

// Node 24 supports source-aware JSON parsing and raw JSON numeric literals.
// The shared ES2022 TypeScript library predates these two runtime APIs.
const sourceJson = JSON as unknown as {
  parse(text:string, reviver:(key:string, value:unknown, context:{source:string}) => unknown):unknown
  rawJSON(source:string):object
}

function jsonTemplate(text: string, variables: Variables, indexed = false): (index?: string) => string | undefined {
  if (typeof text !== 'string') invalid('JSON 본문을 확인하세요.')
  if (!text.trim()) return () => undefined
  if (!text.trimStart().startsWith('{')) invalid('본문은 JSON 객체여야 합니다.')
  let object: unknown
  try {
    object = sourceJson.parse(text, (_key, value, context) =>
      typeof value === 'number' ? sourceJson.rawJSON(context.source) : value)
  } catch { invalid('본문에 올바른 JSON 객체를 입력하세요.') }
  const render = (index?: string) => {
    return JSON.stringify(object, (_key, value: unknown) => typeof value === 'string' ? substitute(value, variables, index) : value)
  }
  const initial = render(indexed ? '1' : undefined)
  return indexed ? render : () => initial
}

function withJsonHeader(headers: Headers, body: string | undefined) {
  if (body !== undefined && !headers.has('content-type')) headers.set('Content-Type', 'application/json')
}

export function prepareRun(input: PrStart, library: PrLibrary, defaultTimeoutMs: number, getPassword: (id:string) => string, loggedIn: boolean) {
  const request: PrRequest = structuredClone(input.request)
  const env: PrEnv | undefined = library.environments.find(item => item.id === input.environmentId)
  if (!env) invalid('대상 환경을 선택하세요.')
  if (!request || !['GET','POST','DELETE'].includes(request.method) || typeof request.useAuth !== 'boolean' ||
      typeof request.name !== 'string' || typeof request.body !== 'string') invalid('요청 입력을 확인하세요.')
  if (!validPostRailCount(input.count) || (request.method !== 'POST' && input.count !== '1')) invalid('반복 횟수는 POST에만 사용할 수 있는 양의 정수입니다.')
  const timeoutMs = request.timeoutMs === null ? defaultTimeoutMs : request.timeoutMs
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) invalid('응답 대기 시간을 확인하세요.')
  const indexed = usesPostRailIndex(request)
  if ((indexed || input.count !== '1') && !library.requests.some(saved => saved.id === request.id)) invalid('인덱스 또는 반복을 사용하려면 요청을 먼저 저장하세요.')
  const variables = { ...env.variables }
  delete variables.password
  delete variables.index
  const url = target(request.url, variables)
  const requireApi = () => {
    const api = target(env.apiOrigin, variables)
    if (api.pathname !== '/' || api.search || api.origin !== url.origin) invalid('요청 주소가 환경에 지정한 토큰 수신 API 주소와 일치하지 않습니다.')
  }
  let password = ''
  const protectedValue = () => {
    if (!password) {
      try { password = getPassword(env.id) } catch { invalid('보호된 비밀번호를 열 수 없습니다. 환경에서 다시 입력하세요.') }
      if (!password) invalid('환경에서 비밀번호를 입력하세요.')
    }
    return password
  }
  const mainValues = { ...variables }
  Object.defineProperty(mainValues, 'password', { get() { requireApi(); return protectedValue() } })
  const headers = prepareHeaders(request.headers, mainValues)
  const body = jsonTemplate(request.method === 'GET' ? '' : request.body, mainValues, indexed)
  withJsonHeader(headers, body(indexed ? '1' : undefined))
  const httpUrls = new Set<string>()
  if (url.protocol === 'http:') httpUrls.add(url.href)
  let login: {url:string, headers:Headers, body:string | undefined} | undefined
  if (request.useAuth) {
    requireApi()
    checkHeaderName(env.tokenHeader)
    if (headers.has(env.tokenHeader)) invalid('인증 헤더와 같은 이름의 요청 헤더를 제거하세요.')
    if (!env.tokenPath.trim() || env.tokenPath.split('.').some(key => !key)) invalid('토큰 JSON 경로를 확인하세요.')
    if (!loggedIn) {
      const loginUrl = target(env.loginUrl, variables)
      if (loginUrl.protocol === 'http:') httpUrls.add(loginUrl.href)
      const loginValues = {...variables}
      Object.defineProperty(loginValues, 'password', { get:protectedValue })
      const loginHeaders = prepareHeaders(env.loginHeaders, loginValues)
      const loginBody = jsonTemplate(env.loginBody, loginValues)()
      withJsonHeader(loginHeaders, loginBody)
      login = { url:loginUrl.href, headers:loginHeaders, body:loginBody }
    }
  }
  return { request, env, timeoutMs, indexed, url:url.href, headers, body, login, httpUrls:[...httpUrls], password, total:BigInt(input.count) }
}

export type PreparedRun = ReturnType<typeof prepareRun>
