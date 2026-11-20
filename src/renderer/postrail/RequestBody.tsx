import {useState} from 'react'
import type {PrBodyMode, PrEnv, PrField, PrRequest} from '../../shared/postrail'
import {BodyEditor} from './JsonBody'
import {FileButton, ParameterTable} from './ParameterTable'
import {TemplateField} from './TemplateField'
import {checkBody, variableIssue} from './request-fields'

const modes:Record<PrBodyMode,{label:string,mime:string}>={
  none:{label:'없음',mime:''},
  json:{label:'JSON',mime:'application/json'},
  urlencoded:{label:'x-www-form-urlencoded',mime:'application/x-www-form-urlencoded'},
  multipart:{label:'form-data',mime:'multipart/form-data'},
  raw:{label:'raw',mime:'text/plain; charset=utf-8'},
  binary:{label:'binary',mime:'application/octet-stream'},
}

export const emptyField=():PrField=>({enabled:true,name:'',value:''})

export function activeMode(request:PrRequest):PrBodyMode {
  if (request.method==='GET') return 'none'
  return request.method==='DELETE' ? 'json' : request.bodyMode ?? 'json'
}

export function bodyError(request:PrRequest,env:PrEnv|undefined,mime:string) {
  const mode=activeMode(request)
  if (mode==='none') return ''
  if (mode==='json') return checkBody(request.body,request.method,env)
  if (mode==='raw') return variableIssue(request.rawBody ?? '',env,'본문')
  if (mode==='binary') return request.binaryFile ? '' : 'binary: 파일을 다시 선택하세요.'
  if (mode==='multipart') {
    const expandedMime=mime.replace(/\$\{([^{}]*)\}/g,(token,key:string)=>env && Object.hasOwn(env.variables,key) ? env.variables[key] : token)
    if (expandedMime && expandedMime.trim().toLowerCase()!=='multipart/form-data') return 'multipart의 Content-Type은 자동값으로 복원하거나 raw로 전환하세요.'
    for (const [i,row] of (request.parts ?? []).entries()) {
      if (!row.enabled) continue
      if (row.kind==='file' && !row.file) return 'form-data '+(i+1)+'행: 파일을 다시 선택하세요.'
      const issue=variableIssue(row.name,env,'본문') || variableIssue(row.mime,env,'본문') || (row.kind==='text' && variableIssue(row.value,env,'본문'))
      if (issue) return 'form-data '+(i+1)+'행: '+issue
    }
    return ''
  }
  for (const [i,row] of (request.formRows ?? []).entries()) {
    if (!row.enabled) continue
    const issue=variableIssue(row.name,env,'본문') || variableIssue(row.value,env,'본문')
    if (issue) return (i+1)+'행: '+issue
  }
  return ''
}

type Props={
  request:PrRequest,change:(patch:Partial<PrRequest>)=>void,
  mime:string,explicitMime:boolean,changeMime:(value:string)=>void,headersInvalid:boolean,
  id:string,error:string,fileError:string
}

export function RequestBody({request,change,mime,explicitMime,changeMime,headersInvalid,id,error,fileError}:Props) {
  const mode=activeMode(request)
  const [pickerError,setPickerError]=useState('')
  const parts=request.parts ?? []
  const formRows=request.formRows ?? []
  async function chooseFile(index?:number) {
    setPickerError('')
    try {
      const retained = parts.flatMap((part,i)=>i!==index && part.file ? [part.file.id] : [])
      if (index!==undefined && request.binaryFile) retained.push(request.binaryFile.id)
      const file=await window.postRail?.chooseFile(request.id,retained)
      if (!file) return
      if (index===undefined) change({binaryFile:file})
      else change({parts:parts.map((part,i)=>i===index ? {...part,file} : part)})
    } catch {setPickerError('파일 선택 창을 열지 못했습니다. 다시 시도하세요.')}
  }
  const issue=error || fileError
  const rowError=/^form-data (\d+)행: (.*)$/.exec(issue)
  return <>
    <div className="pr-body-settings">
      {request.method==='POST' && <label>본문 방식 <select aria-label="본문 방식" value={mode}
        onChange={e=>change({bodyMode:e.target.value as PrBodyMode})}>
        {Object.entries(modes).map(([key,{label}])=><option key={key} value={key}>{label}</option>)}
      </select></label>}
      {mode!=='none' && <label>Content-Type <TemplateField value={mime} aria-label="Content-Type" disabled={headersInvalid}
        placeholder={modes[mode].mime+' (자동)'} onValueChange={changeMime}/></label>}
      {mode!=='none' && explicitMime && <button disabled={headersInvalid} onClick={()=>changeMime('')}>자동값 복원</button>}
    </div>
    {mode==='json' && <BodyEditor id={id} aria-invalid={!!error} aria-describedby={error?id+'-error':undefined}
      value={request.body} onChange={body=>change({body})}/>}
    {mode==='raw' && <TemplateField id={id} multiline className="pr-raw-editor" value={request.rawBody ?? ''}
      aria-label="raw 요청 본문" aria-invalid={!!error} onValueChange={rawBody=>change({rawBody})}/>}
    {mode==='urlencoded' && <ParameterTable label="폼" newRow={emptyField} rows={formRows} onChange={formRows=>change({formRows})}/>}
    {mode==='multipart' && <ParameterTable label="파트" rows={parts} newRow={()=>({...emptyField(),kind:'text' as const,mime:''})}
      onChange={parts=>change({parts})} partOptions={{parts,pick:i=>void chooseFile(i),invalidFileId:id}}
      issue={rowError ? {index:Number(rowError[1])-1,message:rowError[2]} : undefined}/>}
    {mode==='binary' && <FileButton id={id} label="binary 파일 선택" file={request.binaryFile} pick={()=>void chooseFile()}
      error={issue.startsWith('binary:')?issue:undefined}/>}
    {pickerError && <p role="alert" className="pr-error">{pickerError}</p>}
    {error && !rowError && !error.startsWith('binary:') && <p id={id+'-error'} className="pr-error">{error}</p>}
  </>
}
