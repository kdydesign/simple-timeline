import {postRailHeaderNameError} from '../../shared/postrail-parameters'
import type {PrField, PrFile, PrPart, PrQuery, PrRequest, PrRequestOptions} from '../../shared/postrail'
import {validPostRailCount} from '../../shared/postrail-run'

export class PostRailRunError extends Error {}

function invalid():never {
  throw new PostRailRunError('요청의 파라미터와 본문 입력을 확인하세요.')
}
function field(row:PrField):PrField {
  if (!row || typeof row.name!=='string' || typeof row.value!=='string' || typeof row.enabled!=='boolean') invalid()
  return {name:row.name,value:row.value,enabled:row.enabled}
}
function rows<T>(value:T[], normalize:(value:T)=>T):T[] {
  if (!Array.isArray(value)) invalid()
  return value.map(normalize)
}
function file(value:PrFile|null):PrFile|null {
  if (value === null) return null
  if (!value || typeof value.id!=='string' || !value.id || typeof value.name!=='string' || !value.name || /[/\\\r\n]/.test(value.name)) invalid()
  return {id:value.id,name:value.name}
}

export function requestOptions(request:PrRequest) {
  const result:PrRequestOptions={}
  if (request.bodyMode!==undefined) {
    if (!['none','json','urlencoded','multipart','raw','binary'].includes(request.bodyMode)) invalid()
    result.bodyMode=request.bodyMode
  }
  if (request.headerRows!==undefined) {
    result.headerRows=rows(request.headerRows,field)
    const names=new Set<string>()
    result.headerRows.forEach((row,i)=>{
      if (!row.enabled) return
      const message = postRailHeaderNameError(row.name)
      if (message) throw new PostRailRunError('헤더 '+(i+1)+'행: '+message)
      if (/[\r\n]/.test(row.value) || names.has(row.name.toLowerCase())) {
        throw new PostRailRunError('헤더 '+(i+1)+'행의 이름 중복 또는 입력값을 확인하세요.')
      }
      names.add(row.name.toLowerCase())
    })
  }
  if (request.queryRows!==undefined) result.queryRows=rows(request.queryRows,(r:PrQuery)=>{
    const normalized:PrQuery=field(r)
    if (r.encodeVariables!==undefined) {
      if (typeof r.encodeVariables!=='boolean') invalid()
      normalized.encodeVariables=r.encodeVariables
    }
    if (r.raw!==undefined) {
      if (typeof r.raw!=='string' || /[&#]/.test(r.raw)) invalid()
      normalized.raw=r.raw
    }
    return normalized
  })
  if (request.pathValues!==undefined) {
    if (!request.pathValues || typeof request.pathValues!=='object' || Array.isArray(request.pathValues)) invalid()
    const entries=Object.entries(request.pathValues)
    if (entries.some(([key,val])=>!/^[-\w]+$/.test(key) || typeof val!=='string')) invalid()
    result.pathValues=Object.fromEntries(entries)
  }
  if (request.formRows!==undefined) result.formRows=rows(request.formRows,field)
  if (request.parts!==undefined) result.parts=rows(request.parts,(p:PrPart)=>{
    const row=field(p)
    if ((p.kind!=='text' && p.kind!=='file') || typeof p.mime!=='string') invalid()
    return {...row,kind:p.kind,mime:p.mime,...(p.file!==undefined ? {file:file(p.file)} : {})}
  })
  if (request.rawBody!==undefined) {
    if (typeof request.rawBody!=='string') invalid()
    result.rawBody=request.rawBody
  }
  if (request.binaryFile!==undefined) result.binaryFile=file(request.binaryFile)
  if (request.savedRepeatCount!=null && request.method==='POST' && !validPostRailCount(request.savedRepeatCount)) {
    throw new PostRailRunError('반복 횟수에 양의 정수를 입력하세요.')
  }
  if (request.savedRepeatCount!==undefined) result.savedRepeatCount=request.method==='POST' ? request.savedRepeatCount : null
  return result
}
