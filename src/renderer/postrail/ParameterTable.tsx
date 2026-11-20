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

export function ParameterTable<T extends PrField>({rows,onChange,label,newRow,partOptions,issue}:{
  rows:T[],onChange:(rows:T[])=>void,label:string,newRow:()=>T,
  partOptions?:{parts:PrPart[],pick:(i:number)=>void,invalidFileId?:string},
  issue?:{index:number,message:string}
}) {
  const multipart=!!partOptions
  function update(index:number,patch:Partial<PrPart>) {
    onChange(rows.map((row,i)=>{
      if (i!==index) return row
      const updated={...row,...patch}
      if (patch.name!==undefined || patch.value!==undefined) {
        if ('raw' in updated) delete updated.raw
        if ('encodeVariables' in updated) delete updated.encodeVariables
      }
      return updated
    }))
  }
  return <div className={'pr-param-table'+(multipart?' pr-part-table':'')} aria-label={label}>
    <div className="pr-param-row pr-param-head">
      <span>사용</span><span>이름</span>{multipart && <span>유형</span>}<span>값</span>{multipart && <span>MIME</span>}
      <button type="button" aria-label={label+' 추가'} onClick={()=>onChange([...rows,newRow()])}><Icon name="plus"/></button>
    </div>
    {rows.map((row,index)=>{
      const part=partOptions?.parts[index]
      const name=label+' '+(index+1)+'행 '
      const message=index===issue?.index ? issue.message : ''
      return <div key={index} className="pr-param-record">
        <div className="pr-param-row" data-enabled={row.enabled}>
          <input type="checkbox" aria-label={name+'사용'} checked={row.enabled} onChange={e=>update(index,{enabled:e.target.checked})}/>
          <TemplateField value={row.name} aria-label={name+'이름'} aria-invalid={!!message} onValueChange={name=>update(index,{name})}/>
          {part && <select value={part.kind} aria-label={name+'유형'} onChange={e=>update(index,{kind:e.target.value as PrPart['kind']})}>
            <option value="text">Text</option><option value="file">File</option></select>}
          {part?.kind==='file' && partOptions ? <FileButton file={part.file} id={message ? partOptions.invalidFileId : undefined} label={name+'파일 선택'} pick={()=>partOptions.pick(index)}/>
            : <TemplateField value={row.value} aria-label={name+'값'} onValueChange={value=>update(index,{value})}/>}
          {part && <TemplateField value={part.mime} aria-label={name+'MIME'} placeholder="자동" onValueChange={mime=>update(index,{mime})}/>}
          <button type="button" aria-label={name+'삭제'} onClick={()=>onChange(rows.filter((_,i)=>i!==index))}><Icon name="trash"/></button>
        </div>
        {message && <small className="pr-error">{message}</small>}
      </div>
    })}
  </div>
}
