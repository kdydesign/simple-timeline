import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {PrMethod, PrRequest} from '../../shared/postrail'
import {postRailBusy, usesPostRailIndex, validPostRailCount} from '../../shared/postrail-run'
import type {PostRailController} from './usePostRail'
import {BodyEditor} from './JsonBody'
import {checkAddress, checkBody, checkHeaderVariables} from './request-fields'

type Input = Pick<PrRequest, 'method'|'url'|'body'|'useAuth'> & {headerText:string, timeoutText:string}
type Draft = Partial<Input>
type Tab = 'body'|'headers'|'auth'
type Field = 'url'|'body'|'headers'|'timeout'

function headerLines(headers:Record<string,string>) {
  return Object.entries(headers).map(([key,value]) => key + ': ' + value).join('\n')
}

function baseInput(request:PrRequest|null):Input {
  return {url:request?.url ?? '', body:request?.body ?? '', method:request?.method ?? 'GET',
    useAuth:request?.useAuth ?? false, headerText:headerLines(request?.headers ?? {}),
    timeoutText:request?.timeoutMs == null ? '' : String(request.timeoutMs/1000)}
}

function hasChanges(base:Input,draft:Draft|undefined) {
  return !!draft && (Object.keys(draft) as (keyof Draft)[]).some(k=>draft[k]!==base[k])
}

function parseHeaders(text:string) {
  const entries: [string,string][] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    const key = line.slice(0, separator).trim()
    if (separator < 1 || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key)) return {error:'헤더는 한 줄에 이름: 값 형식으로 입력하세요.'}
    if (seen.has(key.toLowerCase())) return {error:'같은 이름의 헤더가 두 번 있습니다.'}
    seen.add(key.toLowerCase())
    entries.push([key, line.slice(separator + 1).trim()])
  }
  return {headers:Object.fromEntries(entries)}
}

function RequestTabs({tab, onChange, method}: {tab:Tab, onChange:(tab:Tab)=>void, method?:PrMethod}) {
  const choices = [['body','JSON 본문'], ['headers','헤더'], ['auth','인증']] as const
  return <div className="pr-tabs" role="tablist" aria-label="요청 편집">
    {choices.map(([id, label])=><button key={id} role="tab" aria-selected={id===tab}
      disabled={!method || (method==='GET' && id==='body')} onClick={()=>onChange(id)}>{label}</button>)}
  </div>
}

export function RequestEditor({postrail, request, onDirtyChange}: {
  postrail:PostRailController, request:PrRequest|null, onDirtyChange?:(dirty:boolean)=>void
}) {
  const {library,run} = postrail
  const [drafts, setDrafts] = useState<Record<string,Draft>>({})
  const [tabChoice, setTab] = useState<{id:string,tab:Tab}|null>(null)
  const [repeat, setRepeat] = useState<{id:string,count:string}|null>(null)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const [focusField,setFocusField] = useState<Field|null>(null)
  useLayoutEffect(()=>{
    if (focusField) {
      document.getElementById(id+focusField)?.focus()
      setFocusField(null)
    }
  },[focusField,id])
  const priorRequests = useRef(library.requests)
  useEffect(()=>{
    const prior = priorRequests.current
    priorRequests.current = library.requests
    setDrafts(previous=>{
      const next = {...previous}
      let changed = false
      for (const [id,draft] of Object.entries(previous)) {
        const saved = library.requests.find(r=>r.id===id)
        if (!saved) {
          delete next[id]
          changed = true
        } else if (draft.url!==undefined && prior.find(r=>r.id===id)?.url!==saved.url) {
          // The metadata popup can commit a new URL while other editor fields are dirty.
          next[id] = {...draft}
          delete next[id].url
          changed = true
        }
      }
      return changed ? next : previous
    })
  },[library.requests])

  const base = baseInput(request)
  const draft = request ? drafts[request.id] : undefined
  const input = {...base, ...draft}
  const dirty = hasChanges(base,draft)
  useEffect(()=>{
    if (onDirtyChange) onDirtyChange(library.requests.some(r=>drafts[r.id] && hasChanges(baseInput(r),drafts[r.id])))
  },[drafts,library.requests,onDirtyChange])
  useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange])
  function edit<K extends keyof Input>(key:K,value:Input[K]) {
    if (!request) return
    setDrafts(previous=>{
      const next = {...previous[request.id], [key]:value}
      if (value===base[key]) delete next[key]
      return {...previous,[request.id]:next}
    })
  }
  const environment = library.environments.find(e=>e.id===library.environmentId)
  const parsed = useMemo(()=>parseHeaders(input.headerText),[input.headerText])
  const seconds = input.timeoutText.trim()
  const timeoutMs = seconds ? Math.round(Number(seconds)*1000) : null
  const invalidTimeout = timeoutMs !== null && (!/^\d+(?:\.\d{1,3})?$/.test(seconds) || timeoutMs < 1 || timeoutMs > 2147483647)
  const address = useMemo(()=>checkAddress(input.url,environment),[input.url,environment])
  const bodyIssue = useMemo(()=>checkBody(input.body,input.method,environment),[input.body,input.method,environment])
  const errors = {
    url:address.error,
    headers:parsed.error || checkHeaderVariables(parsed.headers ?? {},environment,input.useAuth),
    body:bodyIssue,
    timeout:invalidTimeout ? '응답 대기 시간을 양수로 입력하세요(최대 2147483.647초).' : '',
  }
  function fieldProps(field:Field) {
    return {id:id+field, 'aria-invalid':!!request && !!errors[field],
      'aria-describedby':request && errors[field] ? id+field+'-error' : undefined}
  }
  function fieldError(field:Field) {
    return request && errors[field] ? <p id={id+field+'-error'} className="pr-error">{errors[field]}</p> : null
  }
  const snapshot = request ? {...request, url:input.url, method:input.method, useAuth:input.useAuth,
    body:input.body, headers:parsed.headers ?? {}, timeoutMs} : null
  const repeating = !!request && input.method==='POST' && repeat?.id===request.id
  const rawCount = repeating ? repeat.count.trim() : '1'
  const count = validPostRailCount(rawCount) ? BigInt(rawCount) : 0n
  const indexed = useMemo(()=>usesPostRailIndex({method:input.method,body:input.body}),[input.method,input.body])
  let range = ''
  if (!count) range = '횟수는 양의 정수로 입력하세요.'
  else if (snapshot && indexed) {
    range = '인덱스 ' + snapshot.nextIndex + (count>1n ? ' – ' + (BigInt(snapshot.nextIndex)+count-1n) : '')
  } else if (repeating && count>1n) range = '같은 요청을 반복합니다.'
  const wantedTab = tabChoice?.id===request?.id ? tabChoice?.tab : undefined
  const tab = !wantedTab || (input.method==='GET' && wantedTab==='body') ? (input.method==='GET'?'headers':'body') : wantedTab
  const busy = postRailBusy(run?.phase ?? 'idle')
  async function save() {
    if (!request || !snapshot || parsed.error || invalidTimeout || saving) return
    setSaving(true)
    try {
      const result = await postrail.mutate({type:'request.save',request:snapshot})
      if (result) setDrafts(previous=>{
        if (previous[request.id] !== draft) return previous
        const next = {...previous}
        delete next[request.id]
        return next
      })
    } finally { setSaving(false) }
  }
  async function send() {
    if (!snapshot || !environment || !count || busy || postrail.submitting) return
    const field = (Object.keys(errors) as Field[]).find(field=>errors[field])
    if (field) {
      if (field!=='url') setTab({id:snapshot.id,tab:field==='timeout'?'auth':field})
      setFocusField(field)
      return
    }
    await postrail.start(snapshot,environment.id,String(count))
  }

  return <>
    <div className="workrail-surface pr-compose">
      <div className="pr-request-name">
        {request && <span>{library.groups.find(g=>g.id===request.groupId)?.name ?? '미분류'} /</span>}
        <h1>{request?.name ?? '저장한 요청 없음'}</h1>
        {dirty && <button className="pr-link" disabled={saving || !!parsed.error || invalidTimeout || !input.url.trim()} onClick={()=>void save()}>{saving?'저장 중…':'변경 저장'}</button>}
      </div>
      <div className="pr-endpoint">
        <div className="pr-address">
          <select aria-label="HTTP 메서드" value={input.method} disabled={!request} data-method={input.method} onChange={e=>{
            const method = e.target.value as PrMethod
            edit('method',method)
            setRepeat(null)
            if (request) setTab({id:request.id,tab:method==='GET'?'headers':'body'})
          }}><option>GET</option><option>POST</option><option>DELETE</option></select>
          <input {...fieldProps('url')} aria-label="요청 URL" value={input.url} disabled={!request || saving} spellCheck={false} onChange={e=>edit('url',e.target.value)}/>
        </div>
        {busy ? <button className="workrail-control" disabled={run?.phase==='stopping'} onClick={()=>void postrail.stop()}>
          {run?.phase==='stopping'?'중지 중…':'중지'}</button>
          : <button className="workrail-control workrail-primary pr-send" onClick={()=>void send()}
              disabled={!snapshot || !environment || !count || postrail.submitting || !postrail.available}>
              {repeating && count ? count+'회 보내기':'보내기'}</button>}
      </div>
      {fieldError('url')}
      <div className="pr-options">
        {!environment && postrail.available && <span>오른쪽 아래 환경 관리에서 전송할 환경을 추가하세요.</span>}
        {request && input.method==='POST' && <label><input type="checkbox" checked={repeating}
          onChange={e=>setRepeat(e.target.checked?{id:request.id,count:'1'}:null)}/>반복 보내기</label>}
        {repeating && <label>횟수 <input inputMode="numeric" value={repeat.count} aria-invalid={!count} aria-describedby={!count?id+'count-error':undefined}
          onChange={e=>setRepeat({id:request.id,count:e.target.value})}/></label>}
        {range && <span id={!count?id+'count-error':undefined}>{range}</span>}
        {busy && <span>{run?.completed} / {run?.total}회 완료</span>}
        {address.plaintext && <span className="pr-http">HTTP 평문 연결</span>}
      </div>
    </div>
    <section className="workrail-surface pr-pane" aria-label="요청">
      <div className="pr-bar"><h2>요청</h2><RequestTabs tab={tab} method={request?input.method:undefined}
          onChange={tab=>request && setTab({id:request.id,tab})}/>
        {environment && <small>{environment.name} · {run?.authenticatedEnvironmentIds.includes(environment.id)?'인증됨':environment.loginUrl?'로그인 필요':'로그인 미설정'}</small>}
      </div>
      <div className="pr-content">
        {!request ? <p>왼쪽 ＋에서 요청을 추가하세요.</p>
          : tab==='body' ? <BodyEditor {...fieldProps('body')} key={request.id} value={input.body} onChange={v=>edit('body',v)}/>
          : tab==='headers' ? <textarea {...fieldProps('headers')} className="pr-header-input" wrap="off" spellCheck={false} value={input.headerText}
              aria-label="요청 헤더" placeholder="Accept: application/json" onChange={e=>edit('headerText',e.target.value)}/>
          : <div className="pr-auth">
            <label><input type="checkbox" checked={input.useAuth} onChange={e=>edit('useAuth',e.target.checked)}/>환경 로그인 사용</label>
            <p>선택한 환경의 로그인 설정으로 토큰을 발급받아 API 요청에 사용합니다.</p>
            <label>응답 대기 시간(초)<input {...fieldProps('timeout')} inputMode="decimal" placeholder="공통 기본값" value={input.timeoutText}
              onChange={e=>edit('timeoutText',e.target.value)}/></label>
          </div>}
        {fieldError(tab==='auth'?'timeout':tab)}
      </div>
    </section>
  </>
}
