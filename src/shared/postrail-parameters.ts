import type {PrQuery} from './postrail'

function splitAddress(url:string) {
  const hash = url.indexOf('#')
  const fragment = hash < 0 ? '' : url.slice(hash)
  const address = hash < 0 ? url : url.slice(0,hash)
  const query = address.indexOf('?')
  return {base:query < 0 ? address : address.slice(0,query), query:query < 0 ? '' : address.slice(query+1), fragment}
}

function decodeComponent(text:string) {
  // URLSearchParams also handles malformed escapes in imported URLs.
  return new URLSearchParams('v='+text).get('v')!
}

function queryRow(raw:string):PrQuery {
  const eq=raw.indexOf('=')
  const name=decodeComponent(eq < 0 ? raw : raw.slice(0,eq))
  const value=eq < 0 ? '' : decodeComponent(raw.slice(eq+1))
  return {enabled:true,raw,name,value}
}

export function queryFromUrl(url:string):PrQuery[] {
  const {query}=splitAddress(url)
  return query ? query.split('&').map(queryRow) : []
}

function displayComponent(text:string) {
  return text.split(/(\$\{[^{}]*\})/g).map((part,i)=>i%2 ? part : encodeURIComponent(part)).join('')
}

export function urlWithQuery(url:string, rows:PrQuery[], expand?:(value:string)=>string):string {
  const {base,fragment}=splitAddress(url)
  const encode=(text:string)=>expand ? encodeURIComponent(expand(text)) : displayComponent(text)
  const query=rows.filter(r=>r.enabled).map(r=>{
    if (r.raw!==undefined) {
      const original=queryRow(r.raw)
      if (original.name===r.name && original.value===r.value) {
        if (!expand) return r.raw
        if (r.encodeVariables) {
          return r.raw.replace(/\$\{[^{}]*\}/g, placeholder=>encodeURIComponent(expand(placeholder)))
        }
        return expand(r.raw)
      }
    }
    return encode(r.name)+'='+encode(r.value)
  })
  const address=expand ? expand(base) : base
  const suffix=expand ? expand(fragment) : fragment
  return address+(query.length ? '?'+query.join('&') : '')+suffix
}

export function mapPathNames(url:string, replace:(name:string)=>string):string {
  const {base}=splitAddress(url)
  // Skip the scheme and authority (including IPv6 and ports), or a leading environment origin.
  const prefix = /^(?:[a-z][\w+.-]*:\/\/[^/]*|[^/]*)/i.exec(base)![0]
  const path=base.slice(prefix.length).replace(/\/:([\w-]+)(?=\/|$)/g,(_segment,name:string)=>'/'+replace(name))
  return prefix+path+url.slice(base.length)
}

export function pathNames(url:string):string[] {
  const names=new Set<string>()
  mapPathNames(url,name=>{names.add(name);return ':'+name})
  return [...names]
}

// Keep routing, hop-by-hop headers and ambient credentials under transport control.
const restrictedHeader = /^(?:host|connection|content-length|transfer-encoding|keep-alive|upgrade|te|trailer|cookie2?|set-cookie|proxy-.*|sec-.*|forwarded|x-forwarded-.*)$/i

export function postRailHeaderNameError(name:string):string {
  if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name)) return 'HTTP 헤더 이름을 확인하세요.'
  return restrictedHeader.test(name) ? '사용할 수 없는 HTTP 헤더 이름입니다.' : ''
}
