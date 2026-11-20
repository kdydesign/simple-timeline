import {useId,useState} from 'react'
import type {PrField, PrFile, PrPart} from '../../shared/postrail'
import {Icon} from '../components/Icon'
import {TemplateField} from './TemplateField'

export function FileButton({file,pick,label,error,id}:{
  file?:PrFile|null,pick:()=>void,label:string,error?:string,id?:string
}) {
  return <div className="pr-file-cell">
    <button type="button" id={id} onClick={pick} aria-label={label} aria-invalid={!!error}
      title={file?.name}>{file?.name || '파일 선택'}</button>
    {error && <small className="pr-error">{error}</small>}
  </div>
}

export function ParameterTable<T extends PrField>({rows,onChange,label,newRow,partOptions,issue,entryRow=false}:{
  rows:T[],onChange:(rows:T[])=>void,label:string,newRow:()=>T,
  partOptions?:{parts:PrPart[],pick:(i:number)=>void,invalidFileId?:string},
  issue?:{index:number,message:string},entryRow?:boolean
}) {
  const multipart=!!partOptions
  const entryId=useId()
  type Slot={row:T,source:number}
  const [editing,setEditing]=useState<{published:T[], blanks:{index:number,row:T}[]}|null>(null)
  const slots:Slot[]=rows.map((row,source)=>({row,source}))
  // Keep a cleared cell in place while publishing only the remaining request data.
  // A metadata refresh can recreate the same rows; use the current props for all real cells.
  if (editing && (editing.published===rows || (editing.published.length===rows.length && rows.every((row,i)=>
    row.name===editing.published[i].name && row.value===editing.published[i].value && row.enabled===editing.published[i].enabled)))) {
    for (const blank of editing.blanks) slots.splice(blank.index,0,{row:blank.row,source:-1})
  }
  const displayed=entryRow && slots.at(-1)?.source!==-1 ? [...slots,{row:newRow(),source:-1}] : slots

  function publish(next:Slot[]) {
    const published:T[]=[]
    const blanks:{index:number,row:T}[]=[]
    next.forEach(({row,source},index)=>{
      if (source<0) blanks.push({index,row})
      else published.push(row)
    })
    setEditing(blanks.length ? {published,blanks} : null)
    onChange(published)
  }
  function update(index:number,patch:Partial<PrPart>) {
    const updated={...displayed[index].row,...patch}
    const editingText=patch.name!==undefined || patch.value!==undefined
    if (editingText) {
      if ('raw' in updated) delete updated.raw
      if ('encodeVariables' in updated) delete updated.encodeVariables
    }
    const next=[...slots]
    const blank=entryRow && editingText && !updated.name && !updated.value
    next[index]={row:updated,source:blank ? -1 : index}
    publish(next)
  }
  function addRow() {
    if (entryRow) document.getElementById(entryId)?.focus()
    else onChange([...rows,newRow()])
  }
  return <div className={'pr-param-table'+(multipart?' pr-part-table':'')} aria-label={label}>
    <div className="pr-param-row pr-param-head">
      <span>사용</span><span>이름</span>{multipart && <span>유형</span>}<span>값</span>{multipart && <span>MIME</span>}
      <button type="button" aria-label={label+' 추가'} onClick={addRow}><Icon name="plus"/></button>
    </div>
    {displayed.map(({row,source},index)=>{
      const isEntry=entryRow && index===displayed.length-1 && source<0
      const part=partOptions?.parts[index]
      const name=label+' '+(index+1)+'행 '
      const message=source===issue?.index ? issue.message : ''
      return <div key={index} className="pr-param-record">
        <div className="pr-param-row" data-enabled={row.enabled}>
          <input type="checkbox" aria-label={name+'사용'} checked={row.enabled} disabled={source<0} onChange={e=>update(index,{enabled:e.target.checked})}/>
          <TemplateField id={isEntry ? entryId : undefined} value={row.name} aria-label={name+'이름'} aria-invalid={!!message} onValueChange={name=>update(index,{name})}/>
          {part && <select value={part.kind} aria-label={name+'유형'} onChange={e=>update(index,{kind:e.target.value as PrPart['kind']})}>
            <option value="text">Text</option><option value="file">File</option></select>}
          {part?.kind==='file' && partOptions ? <FileButton file={part.file} id={message ? partOptions.invalidFileId : undefined} label={name+'파일 선택'} pick={()=>partOptions.pick(index)}/>
            : <TemplateField value={row.value} aria-label={name+'값'} onValueChange={value=>update(index,{value})}/>}
          {part && <TemplateField value={part.mime} aria-label={name+'MIME'} placeholder="자동" onValueChange={mime=>update(index,{mime})}/>}
          <button type="button" aria-label={name+'삭제'} disabled={isEntry} onClick={()=>publish(slots.filter((_,i)=>i!==index))}><Icon name="trash"/></button>
        </div>
        {message && <small className="pr-error">{message}</small>}
      </div>
    })}
  </div>
}
