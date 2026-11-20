import {urlWithQuery} from '../../shared/postrail-parameters'
import type {PrEnv, PrMethod, PrQuery} from '../../shared/postrail'

export function variableIssue(text:string, env:PrEnv|undefined, field:'URL'|'헤더'|'본문', allowIndex=false) {
  for (const match of text.matchAll(/\$\{([^{}]*)\}/g)) {
    const name = match[1]
    if (name==='index') {
      if (!allowIndex) return 'index는 POST 본문의 문자열 값에서만 사용할 수 있습니다.'
    } else if (name==='password') {
      if (field==='URL') return 'URL에는 보호 변수 password를 사용할 수 없습니다.'
      if (env && !env.hasPassword) return '환경 관리에서 비밀번호를 입력하세요.'
    } else if (env && !Object.hasOwn(env.variables,name)) {
      return '환경 관리에서 '+field+'에 사용한 변수 ‘'+(name || '빈 이름')+'’를 등록하세요.'
    }
  }
  return ''
}

export function checkAddress(text:string, env:PrEnv|undefined, rows?:PrQuery[]) {
  const issue = variableIssue(text,env,'URL')
  if (issue) return {error:issue,plaintext:false}
  if (!env && text.includes('${')) return {error:'',plaintext:false}
  const expand=(value:string)=>env ? value.replace(/\$\{([^{}]*)\}/g,(_raw,key:string)=>env.variables[key]) : value
  const expanded=rows ? urlWithQuery(text,rows,expand) : expand(text)
  let url: URL
  try { url = new URL(expanded) }
  catch { return {error:'올바른 HTTP 또는 HTTPS URL을 입력하세요.',plaintext:false} }
  if (!['http:','https:'].includes(url.protocol)) return {error:'HTTP 또는 HTTPS URL을 입력하세요.',plaintext:false}
  if (url.username || url.password || url.hash) return {error:'URL에서 계정 정보와 조각 식별자를 제거하세요.',plaintext:false}
  return {error:'',plaintext:url.protocol==='http:'}
}

export function checkHeaderVariables(headers:Record<string,string>, env:PrEnv|undefined, useAuth:boolean) {
  for (const [key,value] of Object.entries(headers)) {
    if (useAuth && key.toLowerCase()===env?.tokenHeader.toLowerCase()) return '환경 인증에 사용할 헤더 이름과 겹칩니다.'
    const issue = variableIssue(value,env,'헤더')
    if (issue) return issue
  }
  return ''
}

export function checkBody(text:string, method:PrMethod, env:PrEnv|undefined) {
  if (method==='GET' || !text.trim()) return ''
  let issue = ''
  try {
    const object:unknown = JSON.parse(text,(_key,value:unknown)=>{
      if (typeof value==='string' && !issue) issue=variableIssue(value,env,'본문',method==='POST')
      return value
    })
    if (object===null || typeof object!=='object' || Array.isArray(object)) return '본문에 JSON 객체를 입력하세요.'
    return issue
  } catch { return '올바른 JSON 객체를 입력하세요.' }
}
