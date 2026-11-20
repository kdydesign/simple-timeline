import type {PrEnv} from './postrail'

type LoginField = 'apiOrigin' | 'loginUrl' | 'loginBody' | 'loginHeaders' | 'tokenPath' | 'tokenHeader' | 'tokenPrefix'
export type LoginErrors = Partial<Record<LoginField, string>>

export function environmentLoginErrors(env: Pick<PrEnv, LoginField | 'variables'>): LoginErrors {
  const errors: LoginErrors = {}
  const referenceError = (value: string, allowPassword: boolean) => {
    for (const [,name] of value.matchAll(/\$\{([^{}]*)\}/g)) {
      if (name === 'index' || (name === 'password' && !allowPassword)) return '이 위치에서는 예약 변수를 사용할 수 없습니다.'
      if (name !== 'password' && !Object.hasOwn(env.variables,name)) return '등록되지 않은 환경 변수가 있습니다.'
    }
  }
  for (const key of ['apiOrigin','loginUrl'] as const) {
    if (!env[key]) continue
    const error = referenceError(env[key], false)
    if (error) {errors[key] = error; continue}
    try {
      const url = new URL(env[key].replace(/\$\{([^{}]*)\}/g, (_,name:string) => env.variables[name]))
      if (!['http:','https:'].includes(url.protocol) || url.hash || url.username || url.password ||
          [...url.searchParams.keys()].some(name => /^(?:password|passwd|access[_-]?token|token|api[_-]?key|authorization)$/i.test(name))) {
        errors[key] = '계정 정보나 비밀값이 없는 HTTP 또는 HTTPS 주소를 입력하세요.'
      } else if (key === 'apiOrigin' && (url.pathname !== '/' || url.search)) {
        errors.apiOrigin = '경로와 쿼리를 제외한 토큰 수신 API 주소를 입력하세요.'
      }
    } catch {errors[key] = '올바른 HTTP 또는 HTTPS 주소를 입력하세요.'}
  }
  if (env.loginBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.loginBody, (_key, value:unknown) => {
        if (typeof value === 'string') errors.loginBody ??= referenceError(value, true)
        return value
      })
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error()
    } catch {errors.loginBody = '로그인 본문에 올바른 JSON 객체를 입력하세요.'}
    if (!errors.loginBody) delete errors.loginBody
  }
  const seen = new Set<string>()
  for (const [name, value] of Object.entries(env.loginHeaders)) {
    if (seen.has(name.toLowerCase())) {errors.loginHeaders = '같은 이름의 로그인 헤더가 있습니다.'; break}
    seen.add(name.toLowerCase())
    const error = referenceError(value, true)
    if (error) {errors.loginHeaders = error; break}
    if (!validPostRailHeaderName(name) || /[\r\n\0]/.test(value)) {
      errors.loginHeaders = '로그인 헤더 이름과 값을 확인하세요.'
      break
    }
  }
  if (env.tokenPath && env.tokenPath.split('.').some(key => !key.trim())) errors.tokenPath = '토큰 경로를 점으로 구분해 입력하세요.'
  if (env.tokenHeader && !validPostRailHeaderName(env.tokenHeader)) errors.tokenHeader = '사용할 수 없는 토큰 헤더 이름입니다.'
  if (/[\r\n\0]/.test(env.tokenPrefix)) errors.tokenPrefix = '토큰 접두어에 줄바꿈이나 제어 문자를 넣을 수 없습니다.'
  return errors
}

export function validPostRailHeaderName(name: string) {
  return /^[!#$%&'*+.^_`|~\w-]+$/.test(name) &&
    !/^(?:host|connection|content-length|transfer-encoding|keep-alive|upgrade|te|trailer|cookie2?|set-cookie|proxy-.*|sec-.*|forwarded|x-forwarded-.*)$/i.test(name)
}
