import {multipartQuoted} from './body'
import type {PreparedRun} from './prepare'

const mask = '••••'
const maxScan = 128 * 1024
const omitted = '… 안전하게 검사할 수 있는 크기를 넘어 오류 원문을 생략했습니다.'
const sensitiveName = /password|passwd|passphrase|authorization|cookie|credential|secret|token|(?:api|private)[-_ ]?key|session[-_ ]?id|^(?:pw|pwd|auth)$/i

export function redactor(secrets: string[]) {
  const terms = new Set<string>()
  for (const secret of secrets.filter(Boolean)) {
    terms.add(secret)
    terms.add(multipartQuoted(secret))
    terms.add(JSON.stringify(secret).slice(1,-1))
    terms.add(encodeURIComponent(Buffer.from(secret, 'utf8').toString('utf8')))
    terms.add(new URLSearchParams([['',secret]]).toString().slice(1))
  }
  const sorted = [...terms].sort((a,b) => b.length - a.length)
  return (value:string) => {
    for (const term of sorted) value = value.replaceAll(term,mask)
    return value
  }
}

function maskXml(text:string) {
  const tags = /<(\/?)([a-z_][\w.:-]*)(?:\s[^<>]*)?\s*(\/?)>/gi
  let output = '', from = 0, hidden = '', depth = 0
  for (const match of text.matchAll(tags)) {
    const [,closing,name,selfClosing] = match
    if (hidden) {
      if (name !== hidden || selfClosing) continue
      depth += closing ? -1 : 1
      if (!depth) { hidden = ''; from = match.index }
    } else if (!closing && !selfClosing && sensitiveName.test(name)) {
      output += text.slice(from, match.index+match[0].length) + mask
      hidden = name
      depth = 1
    }
  }
  return output + (hidden ? '' : text.slice(from))
}

function maskPlain(text:string) {
  return maskXml(text)
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/gi,mask)
    .replace(/\b(?:https?|file):\/\/[^\s"'<>]+/gi,url=>/[@?#]|^file:/i.test(url) ? mask : url)
    .replace(/\b(?:Bearer|Basic)\s+[\w.~+/=-]+/gi,mask)
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,mask)
    .replace(/((?<![\w.-])(?:[\w.-]{0,64}(?:password|passwd|passphrase|authorization|cookie|credential|secret|token|api[-_]?key|private[-_]?key|session[-_]?id)[\w.-]{0,64}|pw)\s*[:=]\s*)[^\r\n]*/gi,(_all,label:string)=>label+mask)
    .replace(/(["'])(?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))[^\r\n"'<>]*\1/g,(_all,quote:string)=>quote+mask+quote)
    .replace(/(^|[\s("'=:])(?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))[^\s'"<>)]*(?:[ \t]+[^\s'"<>)]*[\\/][^\s'"<>)]*)*/g,(_all,prefix:string)=>prefix+mask)
    .replace(/\?[^\s'"<>]*=[^\s'"<>]*/g,mask)
}

// Skip the complete value, including nested objects and arrays, so a confidential
// property cannot leak later members. An incomplete value consumes the remainder.
function valueEnd(text:string, start:number) {
  let depth = 0, quoted = false
  for (let i=start; i<text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '\\') i++
      else if (char === '"') {
        quoted = false
        if (!depth) return i+1
      }
    } else if (char === '"') quoted = true
    else if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') {
      if (!depth) return i
      if (--depth === 0) return i+1
    } else if (!depth && /[,\s]/.test(char)) return i
  }
  return text.length
}

function maskFields(text:string, sensitive:(name:string)=>boolean, clean:(value:string)=>string) {
  // Copy unchanged tokens verbatim. Re-serializing JSON would lose formatting,
  // duplicate keys, escaped characters and the original spelling of numbers.
  const strings = /"(?:\\[\s\S]|[^"\\])*"/g
  const colon = /[\t\n\r ]*:[\t\n\r ]*/y
  let output = '', from = 0, token:RegExpExecArray|null
  while ((token = strings.exec(text))) {
    let decoded:string
    try { decoded = JSON.parse(token[0]) } catch { continue }
    colon.lastIndex = strings.lastIndex
    const separator = colon.exec(text)
    if (separator && sensitive(decoded)) {
      output += text.slice(from, colon.lastIndex) + JSON.stringify(mask)
      from = strings.lastIndex = valueEnd(text,colon.lastIndex)
    } else {
      const safe = maskPlain(clean(decoded))
      if (safe !== decoded) {
        output += text.slice(from,token.index) + JSON.stringify(safe)
        from = strings.lastIndex
      }
    }
  }
  return maskPlain(clean(output+text.slice(from)))
}

function collectLoginValues(body:string, values:string[], sensitive:(name:string)=>boolean) {
  // A literal login password is as sensitive as an expanded protected variable.
  let object:unknown
  try { object = JSON.parse(body) } catch { return }
  const queue: {value:unknown,hidden:boolean}[] = [{value:object,hidden:false}]
  while (queue.length) {
    const {value,hidden} = queue.pop()!
    if (value && typeof value === 'object') {
      for (const [name,child] of Object.entries(value)) queue.push({value:child,hidden:hidden || sensitive(name)})
    } else if (hidden && (typeof value === 'string' || typeof value === 'number')) values.push(String(value))
  }
}

export function diagnosticMask(run:PreparedRun, secrets:string[], responseHeaders?:Headers, loginFailure=false) {
  const names = new Set([run.env.tokenHeader.toLowerCase()])
  if (loginFailure) names.add(run.env.tokenPath.split('.').at(-1)?.toLowerCase() ?? '')
  const values = [...secrets]
  for (const key of Object.keys(run.env.loginHeaders)) {
    if (/^(?:content-type|accept(?:-.*)?|user-agent|cache-control)$/i.test(key)) continue
    names.add(key.toLowerCase())
    const value = run.login?.headers.get(key) ?? run.env.loginHeaders[key]
    if (value) values.push(value, value.replace(/^\S+\s+/,''))
  }
  const sensitive = (name:string) => sensitiveName.test(name) || names.has(name.toLowerCase())
  const loginBody = run.login?.body ?? run.env.loginBody
  if (loginBody.length > maxScan) return () => omitted
  if (loginBody) collectLoginValues(loginBody,values,sensitive)
  if (responseHeaders) {
    for (const [name,value] of responseHeaders) {
      if (!sensitive(name)) continue
      values.push(value)
      if (/cookie/i.test(name)) for (const part of value.matchAll(/(?:^|[,;]\s*)[^=;,]+=([^;,]+)/g)) values.push(part[1])
    }
  }
  return (value:string) => {
    if (!value) return ''
    // Truncating before inspection can disclose half of a long or multiline secret.
    // Fail closed for oversized inputs; the console caps the fully masked output again.
    if (value.length > maxScan || values.length > 256 || values.some(secret => secret.length > maxScan)) return omitted
    return maskFields(value,sensitive,redactor(values))
  }
}

export function transportSource(error:unknown) {
  if (typeof error === 'string') return error
  if (!(error instanceof Error)) return ''
  const detail = error.cause && typeof error.cause === 'object' ? error.cause : error
  const code = 'code' in detail ? detail.code : undefined
  const message = 'message' in detail && typeof detail.message === 'string' ? detail.message : error.message
  return [typeof code === 'number' || typeof code === 'string' ? String(code) : '',message].filter(Boolean).join(' · ')
}
