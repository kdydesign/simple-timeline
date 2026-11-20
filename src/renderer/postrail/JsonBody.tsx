import {memo, useRef, type ReactNode, type AriaAttributes} from 'react'

/** Highlight only the presentation layer. Both the editor and clipboard retain the original text. */
export const JsonText = memo(function JsonText({text, templates = false}: {text:string, templates?:boolean}) {
  if (text.length > 65536) return <>{text}</>
  const parts: ReactNode[] = []
  const tokens = /"(?:\\[^\n]|[^"\\\n])*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g
  let end = 0
  for (const match of text.matchAll(tokens)) {
    const token = match[0]
    parts.push(text.slice(end, match.index))
    end = match.index + token.length
    let kind: string
    let content: ReactNode = token
    if (token.startsWith('"')) {
      kind = token.endsWith('"') && /^\s*:/.test(text.slice(end)) ? 'key' : 'string'
      if (templates && kind === 'string' && token.includes('${')) {
        content = token.split(/(\$\{[^{}"\s]+\})/g).map((part, i) =>
          i % 2 ? <span className="pr-json-variable" key={i}>{part}</span> : part)
      }
    } else {
      kind = token === 'null' ? 'null' : /^(true|false)$/.test(token) ? 'boolean' : 'number'
    }
    parts.push(<span key={match.index} className={'pr-json-' + kind}>{content}</span>)
  }
  return <>{parts}{text.slice(end)}</>
})

export function BodyEditor({value, onChange, ...field}: {value:string, onChange:(value:string)=>void, id:string}
    & Pick<AriaAttributes,'aria-invalid'|'aria-describedby'>) {
  const ink = useRef<HTMLPreElement>(null)
  return <div className="pr-body-editor">
    <pre aria-hidden="true" ref={ink}><JsonText text={value} templates/></pre>
    <textarea {...field} aria-label="JSON 요청 본문" value={value} wrap="off" spellCheck={false}
      onChange={e=>onChange(e.target.value)} onScroll={e=>{
        if (ink.current) ink.current.style.transform = `translate(${-e.currentTarget.scrollLeft}px, ${-e.currentTarget.scrollTop}px)`
      }}/>
  </div>
}
