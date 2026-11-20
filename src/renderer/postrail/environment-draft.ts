import type {PrEnv, PrEnvSave} from '../../shared/postrail'
import {environmentLoginErrors, type LoginErrors} from '../../shared/postrail-environment'

const blank: PrEnv = {id:'',name:'',variables:{},apiOrigin:'',loginUrl:'',loginHeaders:{},loginBody:'',
  tokenPath:'data.token',tokenHeader:'Authorization',tokenPrefix:'Bearer ',hasPassword:false}

export function environmentDraft(environment = blank) {
  return {
    key:environment.id || crypto.randomUUID(), environment, password:'',remember:false,clearPassword:false,
    headersText:JSON.stringify(environment.loginHeaders,null,2),
    rows:Object.entries(environment.variables).map(([name,value],id)=>({id,name,value})),
  }
}
export type EnvironmentDraft = ReturnType<typeof environmentDraft>

export function draftChanged(draft:EnvironmentDraft, original?:EnvironmentDraft) {
  if (original === draft) return false
  if (!original) return true
  return JSON.stringify(draft) !== JSON.stringify(original)
}

export function checkDraft(draft:EnvironmentDraft) {
  const errors:LoginErrors & {name?:string} = {}
  const rowErrors: Record<number,string> = {}
  const env = {...draft.environment,name:draft.environment.name.trim(),loginUrl:draft.environment.loginUrl.trim(),apiOrigin:draft.environment.apiOrigin.trim()}
  if (!env.name) errors.name = '환경 이름을 입력하세요.'
  const names = new Set<string>()
  env.variables = Object.fromEntries(draft.rows.map(row=>{
    const name = row.name.trim()
    if (!name) rowErrors[row.id] = '변수 이름을 입력하세요.'
    else if (['password','index'].includes(name)) rowErrors[row.id] = '예약된 변수 이름입니다.'
    else if (names.has(name)) rowErrors[row.id] = '같은 이름의 변수가 있습니다.'
    names.add(name)
    return [name,row.value]
  }))
  try {
    const headers:unknown = JSON.parse(draft.headersText.trim() || '{}')
    if (!headers || typeof headers !== 'object' || Array.isArray(headers) ||
        Object.values(headers).some(value=>typeof value !== 'string')) throw Error()
    env.loginHeaders = headers as Record<string,string>
  } catch {errors.loginHeaders = '로그인 헤더를 이름과 문자열 값으로 된 JSON 객체로 입력하세요.'}
  Object.assign(errors,environmentLoginErrors(env))
  const save:PrEnvSave = {environment:env}
  if (draft.clearPassword || draft.password) {
    save.password = draft.clearPassword ? '' : draft.password
    save.remember = !draft.clearPassword && draft.remember
  }
  return {errors,rowErrors,save}
}
