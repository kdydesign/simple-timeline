import {useRef, useState} from 'react'
import {Copy} from 'lucide-react'
import {JsonText} from './JsonBody'
import {formatResponseJson} from './response-format'
import {useResponseSearch} from './response-search'
import './response.css'

async function copyBody(text:string) {
  // The app denies programmatic clipboard permissions. Supply plain text during
  // the native copy gesture without disturbing selection in the editor.
  const putText = (event:ClipboardEvent)=>{
    if (!event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData('text/plain',text)
  }
  document.addEventListener('copy',putText)
  try {
    if (document.execCommand?.('copy')) return
  } finally { document.removeEventListener('copy',putText) }
  await navigator.clipboard.writeText(text)
}

export function ResponseBody({received, jsonType, hidden}: {received:string, jsonType:boolean, hidden:boolean}) {
  const [initial] = useState(()=>received ? formatResponseJson(received) : {text:'',error:''})
  const [draft,setDraft] = useState(initial.text)
  const [original,setOriginal] = useState(false)
  const [query,setQuery] = useState('')
  const [index,setIndex] = useState(0)
  const [feedback,setFeedback] = useState('')
  const mirror = useRef<HTMLPreElement>(null)
  const shown = original ? received : draft
  const hits = useResponseSearch(shown,hidden?'':query,index,mirror)
  const formatted = ()=>{
    const result = formatResponseJson(draft)
    setFeedback(result.error)
    if (!result.error) {setDraft(result.text);setIndex(0)}
  }
  return <div className="pr-response-body" hidden={hidden}>
    <div className="pr-response-tools" role="group" aria-label="응답 본문 도구">
      <button disabled={!received || original} onClick={formatted}>포맷 정렬</button>
      <button disabled={!received} onClick={()=>{setOriginal(!original);setFeedback('');setIndex(0)}}>
        {original?'편집본':'원문'}
      </button>
      <button disabled={!received} aria-label="응답 본문 복사" title="응답 본문 복사" onClick={async()=>{
        try { await copyBody(shown); setFeedback('복사됨') }
        catch { setFeedback('클립보드를 사용할 수 없습니다.') }
      }}><Copy size={13} aria-hidden="true"/></button>
      <span role="status">{feedback}</span>
      <input type="search" placeholder="본문 검색" aria-label="응답 본문 검색" disabled={!received}
        value={query} onChange={event=>{setQuery(event.target.value);setIndex(0)}} onKeyDown={event=>{
          if (event.key!=='Enter' || event.nativeEvent.isComposing || !hits) return
          event.preventDefault()
          setIndex((index+(event.shiftKey?-1:1)+hits)%hits)
        }}/>
      {query && <span role="status">{hits ? (index+1)+'/'+hits : '0건'}</span>}
    </div>
    <div className="pr-response-viewport">
      {received && <div className="pr-response-canvas">
        <pre aria-hidden="true" ref={mirror}>{jsonType || !initial.error ? <JsonText text={shown}/> : shown}</pre>
        <textarea aria-label={original?'응답 본문 원문':'응답 본문 편집'} readOnly={original} value={shown}
          wrap="off" spellCheck={false} onChange={event=>{setDraft(event.target.value);setFeedback('');setIndex(0)}}/>
      </div>}
    </div>
  </div>
}
