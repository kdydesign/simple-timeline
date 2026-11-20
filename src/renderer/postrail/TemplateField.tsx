import {useLayoutEffect, useRef, type AriaAttributes} from 'react'
import './template-field.css'

type Props = AriaAttributes & {
  value: string
  onValueChange:(value:string)=>void
  multiline?:boolean
  rows?:number
  id?:string
  disabled?:boolean
  placeholder?:string
  className?:string
  required?:boolean
  pattern?:string
  autoFocus?:boolean
}

/** Keep selection, clipboard and IME in the native control; the overlay only paints text. */
export function TemplateField({value,onValueChange,multiline,rows,className='',...props}:Props) {
  const ink = useRef<HTMLSpanElement>(null)
  const field = useRef<HTMLInputElement|HTMLTextAreaElement|null>(null)
  function sync() {
    if (ink.current && field.current) {
      ink.current.scrollLeft = field.current.scrollLeft
      ink.current.scrollTop = field.current.scrollTop
    }
  }
  useLayoutEffect(sync,[value])
  const painted = value.includes('${') && value.length <= 65536
  const shared = {...props, value, spellCheck:false, onScroll:sync,
    ref:(element:HTMLInputElement|HTMLTextAreaElement|null)=>{field.current=element},
    onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onValueChange(e.target.value)}
  return <span className={'pr-template '+(multiline?'pr-template-area ':'')+className} data-painted={painted}>
    {multiline ? <textarea {...shared} rows={rows ?? 3} wrap="off"/> : <input {...shared}/>}
    {painted && <span ref={ink} aria-hidden="true" className="pr-template-ink">{value.split(/(\$\{[^{}\n]*\})/g).map((part,i)=>
      i%2 ? <span key={i} className="pr-json-variable">{part}</span> : part)}{'\u200b'}</span>}
  </span>
}
