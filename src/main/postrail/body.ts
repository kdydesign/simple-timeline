import {randomUUID} from 'node:crypto'
import type {PrFile, PrRequest} from '../../shared/postrail'
import {PostRailRunError} from './request-options'

export type OpenFile = (id:string,file:PrFile)=>()=>Promise<Blob>

function chooseFile(requestId:string, ref:PrFile|null|undefined, field:string, open?:OpenFile) {
  const message=field+': 파일을 다시 선택하세요.'
  try {
    if (!ref || !open) throw Error()
    const load=open(requestId,ref)
    return async ()=>{
      try {return await load()} catch {throw new PostRailRunError(message)}
    }
  } catch {throw new PostRailRunError(message)}
}

function defaultType(headers:Headers,type:string) {
  if (!headers.has('content-type')) headers.set('content-type',type)
}

export function multipartQuoted(value:string) {
  return value.replace(/\r/g,'%0D').replace(/\n/g,'%0A').replace(/"/g,'%22').replace(/\\/g,'%5C')
}

export function extendedBody(request:PrRequest, headers:Headers, expand:(template:string)=>string, open?:OpenFile) {
  switch (request.bodyMode) {
    case 'raw': {
      defaultType(headers,'text/plain; charset=utf-8')
      const raw=expand(request.rawBody ?? '')
      return ()=>raw
    }
    case 'urlencoded': {
      defaultType(headers,'application/x-www-form-urlencoded')
      const form=new URLSearchParams()
      for (const row of request.formRows ?? []) {
        if (row.enabled) form.append(expand(row.name),expand(row.value))
      }
      const body=form.toString()
      return ()=>body
    }
    case 'binary': {
      defaultType(headers,'application/octet-stream')
      return chooseFile(request.id,request.binaryFile,'binary',open)
    }
    case 'multipart': {
      if (headers.has('content-type') && headers.get('content-type')!.trim().toLowerCase()!=='multipart/form-data') {
        throw new PostRailRunError('form-data의 Content-Type과 boundary는 자동으로 생성합니다. 자동값으로 복원하거나 raw를 선택하세요.')
      }
      const boundary='----PostRail'+randomUUID()
      headers.set('content-type','multipart/form-data; boundary='+boundary)
      const parts=(request.parts ?? []).flatMap((part,i)=>{
        if (!part.enabled) return []
        const field='form-data '+(i+1)+'행'
        const mime=expand(part.mime)
        if (mime && (!/^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+(?:[ \t]*;[ -~]+)?$/.test(mime) || /[\r\n]/.test(mime))) {
          throw new PostRailRunError(field+': MIME 형식을 확인하세요.')
        }
        let head='--'+boundary+'\r\nContent-Disposition: form-data; name="'+multipartQuoted(expand(part.name))+'"'
        const load=part.kind==='file' ? chooseFile(request.id,part.file,field,open) : null
        if (load) head+='; filename="'+multipartQuoted(part.file!.name)+'"'
        if (mime || load) head+='\r\nContent-Type: '+(mime || 'application/octet-stream')
        const text=load ? '' : expand(part.value)
        return [{head:head+'\r\n\r\n',load,text}]
      })
      return async ()=>{
        const chunks:BlobPart[]=[]
        for (const p of parts) chunks.push(p.head,p.load ? await p.load() : p.text,'\r\n')
        chunks.push('--'+boundary+'--\r\n')
        return new Blob(chunks)
      }
    }
    default: return ()=>undefined
  }
}
