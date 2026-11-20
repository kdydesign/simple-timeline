import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react'
import type {PrField,PrMethod,PrRequest} from '../../shared/postrail'
import {pathNames,queryFromUrl,urlWithQuery} from '../../shared/postrail-parameters'
import {postRailBusy,usesPostRailIndex,validPostRailCount} from '../../shared/postrail-run'
import {Select} from '../components/Select'
import {TemplateField} from './TemplateField'
import {ParameterTable} from './ParameterTable'
import {bodyError,emptyField,RequestBody} from './RequestBody'
import {activeHeaders,headerIssue,mergeEnabled,parseRawHeaders,rawHeaders} from './header-fields'
import {checkAddress,checkHeaderVariables,variableIssue} from './request-fields'
import type {PostRailController} from './usePostRail'
import {changedAddress} from './request-address'
import './request-editor.css'

type Tab='params'|'body'|'headers'|'auth'
type Field=Tab|'url'|'timeout'
type Draft=Partial<PrRequest> & {rawText?:string,timeoutText?:string}
const tabs:Record<Tab,string>={params:'파라미터',body:'본문',headers:'헤더',auth:'인증'}
const methods=[
  {value:'GET',label:'GET',textColor:'var(--workrail-status-green)'},
  {value:'POST',label:'POST',textColor:'#eac191'},
  {value:'DELETE',label:'DELETE',textColor:'var(--workrail-status-error)'},
]
const empty:PrRequest={id:'',name:'',method:'GET',url:'',useAuth:false,body:'',headers:{},groupId:null,timeoutMs:null,nextIndex:'1',favorite:false}
function timeoutText(request:PrRequest) {return request.timeoutMs===null ? '' : String(request.timeoutMs/1000)}
function equivalent(a:unknown,b:unknown) {
  return a===b || (a!=null && b!=null && typeof a==='object' && typeof b==='object' && JSON.stringify(a)===JSON.stringify(b))
}

export function RequestEditor({postrail,request,onDirtyChange,onOpenEnvironment,onOpenConsole}:{
  postrail:PostRailController,request:PrRequest|null,onDirtyChange?:(dirty:boolean)=>void,onOpenEnvironment?:()=>void,onOpenConsole?:()=>void
}) {
  const {library,run}=postrail
  const [drafts,setDrafts]=useState<Record<string,Draft>>({})
  const [views,setViews]=useState<Record<string,{tab?:Tab,raw?:boolean,path?:boolean}>>({})
  const [saving,setSaving]=useState(false)
  const [focusField,setFocusField]=useState<Field|null>(null)
  const id=useId()
  const content=useRef<HTMLDivElement>(null)
  const fileCheck=useRef<{requestId:string,environmentId:string}|null>(null)
  useLayoutEffect(()=>{
    if (!focusField) return
    const target=document.getElementById(id+focusField) ?? content.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? content.current?.querySelector<HTMLElement>('button,input')
    target?.focus()
    setFocusField(null)
  },[focusField,id])
  const base=request ?? empty
  const draft=drafts[base.id]
  const view=views[base.id] ?? {}
  function viewAs(patch:typeof view) {
    setViews(prev=>({...prev,[base.id]:{...prev[base.id],...patch}}))
  }
  function edit(patch:Draft) {
    if (!request) return
    setDrafts(previous=>{
      const next={...previous[request.id],...patch}
      const defaults:Draft={...request,timeoutText:timeoutText(request),savedRepeatCount:request.savedRepeatCount ?? null}
      for (const key of Object.keys(patch) as (keyof Draft)[]) {
        if (equivalent(next[key],defaults[key]) || next[key]===undefined) delete next[key]
      }
      return {...previous,[request.id]:next}
    })
  }
  const priorRequests=useRef(library.requests)
  useEffect(()=>{
    const prior=priorRequests.current
    priorRequests.current=library.requests
    setDrafts(previous=>{
      const next={...previous}
      let changed=false
      for (const [id,draft] of Object.entries(previous)) {
        const saved=library.requests.find(r=>r.id===id)
        if (!saved) {delete next[id];changed=true}
        else if (prior.find(r=>r.id===id)?.url!==saved.url) {
          next[id]={...draft}
          delete next[id].url
          delete next[id].queryRows
          delete next[id].pathValues
          changed=true
        }
      }
      return changed ? next : previous
    })
  },[library.requests])
  const dirty=!!draft && Object.keys(draft).length>0
  useEffect(()=>{
    onDirtyChange?.(library.requests.some(r=>drafts[r.id] && Object.keys(drafts[r.id]).length>0))
  },[drafts,library.requests,onDirtyChange])
  useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange])

  const rawText=draft?.rawText
  const input=useMemo(()=>{
    const {rawText:_raw,timeoutText:_seconds,...changes}=draft ?? {}
    return {...base,...changes}
  },[base,draft])
  const environment=library.environments.find(e=>e.id===library.environmentId)
  const rows=useMemo(()=>input.headerRows ?? Object.entries(input.headers).map(([name,value])=>({enabled:true,name,value})),[input.headerRows,input.headers])
  const raw=useMemo(()=>rawText ?? rawHeaders(rows),[rawText,rows])
  const parsed=useMemo(()=>rawText===undefined ? null : parseRawHeaders(rawText),[rawText])
  const headerRows=useMemo(()=>parsed && !parsed.error ? mergeEnabled(rows,parsed.rows) : rows,[rows,parsed])
  const headers=useMemo(()=>activeHeaders(headerRows),[headerRows])
  const tableIssue=headerIssue(headerRows)
  const mimeRow=headerRows.findIndex(row=>row.enabled && row.name.toLowerCase()==='content-type')
  const mime=headerRows[mimeRow]?.value ?? ''
  const seconds=draft?.timeoutText ?? timeoutText(base)
  const timeoutMs=seconds.trim() ? Math.round(Number(seconds)*1000) : null
  const invalidTimeout=timeoutMs!==null && (!/^\d+(?:\.\d{1,3})?$/.test(seconds.trim()) || timeoutMs<1 || timeoutMs>2147483647)
  const snapshot:PrRequest={...input,headers,timeoutMs,...(input.headerRows || parsed ? {headerRows} : {})}
  const repeating=input.method==='POST' && input.savedRepeatCount!=null
  const rawCount=repeating ? input.savedRepeatCount! : '1'
  const count=validPostRailCount(rawCount) ? BigInt(rawCount) : 0n
  const indexed=useMemo(()=>usesPostRailIndex(input),[input])
  let range=''
  if (!count) range='횟수는 양의 정수로 입력하세요.'
  else if (indexed) range='인덱스 '+input.nextIndex+(count>1n ? ' – '+(BigInt(input.nextIndex)+count-1n) : '')
  else if (repeating && count>1n) range='같은 요청을 반복합니다.'

  const tab=view.tab && !(view.tab==='body' && input.method==='GET') ? view.tab : input.method==='GET'?'headers':'body'
  const queryRows=useMemo(()=>input.queryRows ?? queryFromUrl(input.url),[input.queryRows,input.url])
  const paths=useMemo(()=>pathNames(input.url),[input.url])
  const pathIssue=(name:string)=>{
    if (!input.pathValues) return ''
    const value=Object.hasOwn(input.pathValues,name) ? input.pathValues[name] : ''
    return !value ? '경로 값 '+name+'을 입력하세요.' : variableIssue(value,environment,'URL')
  }
  const badPath=paths.find(name=>pathIssue(name))
  const address=useMemo(()=>checkAddress(input.url,environment,input.queryRows),[input.url,environment,input.queryRows])
  const bodyIssue=useMemo(()=>bodyError(input,environment,mime),[input,environment,mime])
  const missingLogin=environment ? [
    !environment.loginUrl && '로그인 URL',!environment.apiOrigin && '토큰 수신 API 주소',!environment.tokenPath && '토큰 JSON 경로',
    !environment.tokenHeader && '토큰 헤더', !environment.hasPassword && [environment.loginBody,...Object.values(environment.loginHeaders)]
      .some(v=>v.includes('${password}')) && '보호 비밀번호',
  ].filter(Boolean).join(', ') : '실행 환경'
  const errors:Record<Field,string>={
    url:address.error,
    headers:parsed?.error || (tableIssue ? (tableIssue.index+1)+'행 · '+tableIssue.message : '') || checkHeaderVariables(headers,environment,input.useAuth),
    params:badPath ? pathIssue(badPath) : '',
    body:bodyIssue,
    auth:input.useAuth && missingLogin ? '환경 로그인에 필요한 항목 · '+missingLogin : '',
    timeout:invalidTimeout?'응답 대기 시간을 양수로 입력하세요(최대 2147483.647초).':'',
  }
  const sendError=request && postrail.sendError(request.id,library.environmentId)
  useEffect(()=>{
    if (!fileCheck.current || fileCheck.current.requestId!==base.id || fileCheck.current.environmentId!==library.environmentId) return
    if (sendError && /^(?:binary|form-data \d+행): 파일을 다시 선택하세요\.$/.test(sendError.message)) {
      fileCheck.current=null
      setViews(previous=>({...previous,[base.id]:{...previous[base.id],tab:'body'}}))
      setFocusField('body')
    }
  },[sendError,base.id,library.environmentId])
  const busy=postRailBusy(run?.phase ?? 'idle')
  function fieldProps(field:Field) {
    return {id:id+field,'aria-invalid':!!request && !!errors[field],'aria-describedby':request && errors[field] ? id+field+'-error' : undefined}
  }
  function fieldError(field:Field) {
    return request && errors[field] ? <p id={id+field+'-error'} className="pr-error">{errors[field]}</p> : null
  }
  function changeRows(headerRows:PrField[]) {edit({headerRows,rawText:undefined})}
  function changeMime(value:string) {
    if (mimeRow<0) changeRows([...headerRows,{enabled:true,name:'Content-Type',value}])
    else changeRows(value ? headerRows.map((row,i)=>i===mimeRow ? {...row,value} : row) : headerRows.filter((_,i)=>i!==mimeRow))
  }
  const saveBlocked=!!(parsed?.error || tableIssue) || invalidTimeout || !input.url.trim() || !count
  async function save() {
    if (!request || saveBlocked || saving) return
    setSaving(true)
    try {
      if (await postrail.mutate({type:'request.content',request:snapshot,baseUrl:request.url})) setDrafts(previous=>{
        if (previous[request.id]!==draft) return previous
        const next={...previous}
        delete next[request.id]
        return next
      })
    } finally {setSaving(false)}
  }
  async function send() {
    if (!request || !environment || !count || busy || postrail.submitting) return
    const field=(Object.keys(errors) as Field[]).find(field=>errors[field])
    if (field) {
      if (field!=='url') viewAs({tab:field==='timeout'?'auth':field,...(field==='params'?{path:true}:{})})
      setFocusField(field)
      await postrail.invalidDraft(snapshot,environment.id,field,errors[field])
      return
    }
    fileCheck.current={requestId:snapshot.id,environmentId:environment.id}
    if (await postrail.start(snapshot,environment.id,String(count))) fileCheck.current=null
  }

  return <>
    <div className="workrail-surface pr-compose">
      <div className="pr-request-name">
        {request && <span>{library.groups.find(g=>g.id===request.groupId)?.name ?? '미분류'} /</span>}
        <h1>{request?.name ?? '저장한 요청 없음'}</h1>
        {request && <button className="pr-auth-badge" onClick={()=>viewAs({tab:'auth'})}>{input.useAuth?'환경 로그인 사용':'인증 없음'}</button>}
        {dirty && <button className="pr-link" disabled={saving || saveBlocked} onClick={()=>void save()}>{saving?'저장 중…':'변경 저장'}</button>}
      </div>
      <div className="pr-endpoint">
        <div className="pr-address">
          <div className="pr-method"><Select escapeClipping label="HTTP 메서드" value={input.method} disabled={!request} options={methods} onChange={value=>{
            const method=value as PrMethod
            edit({method,...(method!=='POST' && input.savedRepeatCount!=null ? {savedRepeatCount:null} : {})})
            viewAs({tab:method==='GET'?'headers':'body'})
          }}/></div>
          {sendError && <span className="pr-send-diagnostic">
            <button aria-label="전송 오류 · console 열기" aria-describedby={id+'send-error'} onClick={onOpenConsole}>!</button>
            <span id={id+'send-error'} role="tooltip">{sendError.message}</span>
          </span>}
          <TemplateField {...fieldProps('url')} aria-label="요청 URL" value={input.url} disabled={!request || saving} onValueChange={url=>edit(changedAddress(input,url))}/>
        </div>
        {busy ? <button className="workrail-control" disabled={run?.phase==='stopping'} onClick={()=>void postrail.stop()}>
          {run?.phase==='stopping'?'중지 중…':'중지'}</button> :
          <button className="workrail-control workrail-primary pr-send" onClick={()=>void send()}
            disabled={!request || !environment || !count || postrail.submitting || !postrail.available}>{repeating && count ? count+'회 보내기':'보내기'}</button>}
      </div>
      {fieldError('url')}
      <div className="pr-options">
        {!environment && postrail.available && <span>오른쪽 아래 환경 관리에서 전송할 환경을 추가하세요.</span>}
        {request && input.method==='POST' && <label><input type="checkbox" checked={repeating}
          onChange={e=>edit({savedRepeatCount:e.target.checked?'1':null})}/>반복 보내기</label>}
        {repeating && <label>횟수 <input inputMode="numeric" value={rawCount} aria-invalid={!count}
          aria-describedby={!count?id+'count-error':undefined} onChange={e=>edit({savedRepeatCount:e.target.value})}/></label>}
        {range && <span id={!count?id+'count-error':undefined}>{range}</span>}
        {busy && <span>{run?.completed} / {run?.total}회 완료</span>}
        {address.plaintext && <span className="pr-http">HTTP 평문 연결</span>}
      </div>
    </div>
    <section className="workrail-surface pr-pane pr-request-pane" aria-label="요청">
      <div className="pr-bar"><h2>요청</h2>
        <div className="pr-tabs" role="tablist" aria-label="요청 편집">
          {(Object.keys(tabs) as Tab[]).map(key=><button key={key} role="tab" aria-selected={tab===key}
            disabled={!request || (input.method==='GET' && key==='body')} onClick={()=>viewAs({tab:key})}>{tabs[key]}</button>)}
        </div>
        {environment && <small>{environment.name} · {run?.authenticatedEnvironmentIds.includes(environment.id)?'인증됨':environment.loginUrl?'로그인 필요':'로그인 미설정'}</small>}
      </div>
      <div className="pr-content" ref={content}>
        {!request ? <p>왼쪽 ＋에서 요청을 추가하세요.</p>
        : tab==='body' ? <RequestBody key={request.id} request={input} change={edit} mime={mime} changeMime={changeMime}
            headersInvalid={!!parsed?.error} explicitMime={mimeRow>=0} id={id+'body'} error={errors.body} fileError={sendError?.message ?? ''}/>
        : tab==='headers' ? <>
          <div className="pr-modes">
            <button aria-pressed={!view.raw} disabled={!!parsed?.error} onClick={()=>{if (parsed) changeRows(headerRows);viewAs({raw:false})}}>Key / Value</button>
            <button aria-pressed={!!view.raw} onClick={()=>{if (tableIssue && rawText===undefined) edit({rawText:raw});viewAs({raw:true})}}>raw</button>
          </div>
          {view.raw ? <TemplateField {...fieldProps('headers')} className="pr-raw-editor" multiline value={raw} aria-label="raw 요청 헤더"
            placeholder="Accept: application/json" onValueChange={rawText=>edit({rawText:rawText===rawHeaders(rows)?undefined:rawText})}/> :
            <ParameterTable rows={headerRows} label="헤더" newRow={emptyField} onChange={changeRows} issue={tableIssue}/>}
          {(!tableIssue || view.raw) && fieldError('headers')}
        </> : tab==='params' ? <>
          <div className="pr-modes">
            <button aria-pressed={!view.path} onClick={()=>viewAs({path:false})}>쿼리</button>
            <button aria-pressed={!!view.path} onClick={()=>viewAs({path:true})}>경로</button>
          </div>
          {view.path ? (paths.length ? paths.map(name=><label className="pr-path-field" key={name}>:{name}
            <TemplateField aria-label={name+' 경로 값'} id={name===badPath?id+'params':undefined} aria-invalid={!!pathIssue(name)}
              value={input.pathValues && Object.hasOwn(input.pathValues,name) ? input.pathValues[name] : ''} onValueChange={value=>edit({pathValues:{...input.pathValues,[name]:value}})}/>
            {pathIssue(name) && <small className="pr-error">{pathIssue(name)}</small>}</label>) : <p>URL의 경로에 :id처럼 이름을 입력하세요.</p>):
            <ParameterTable label="쿼리" rows={queryRows} newRow={emptyField} onChange={queryRows=>edit({queryRows,url:urlWithQuery(input.url,queryRows)})}/>}
        </> : <div className="pr-auth">
          <div role="group" aria-label="이 요청의 인증" className="pr-modes"><span>이 요청의 인증</span>
            <button aria-pressed={!input.useAuth} onClick={()=>edit({useAuth:false})}>인증 없음</button>
            <button aria-pressed={input.useAuth} onClick={()=>edit({useAuth:true})}>환경 로그인 사용</button>
          </div>
          {!input.useAuth ? <p>환경 토큰을 보내지 않습니다. 직접 입력한 요청 헤더는 전송됩니다.</p> :
            errors.auth ? <div>{fieldError('auth')}<button id={id+'auth'} onClick={onOpenEnvironment}>환경 관리 열기</button></div> :
            <p>{run?.authenticatedEnvironmentIds.includes(environment!.id)?'이 환경에 발급된 토큰을 재사용합니다.':'첫 전송 전에 이 환경의 로그인 요청으로 토큰을 발급받습니다.'}</p>}
          <label>응답 대기 시간(초)<input {...fieldProps('timeout')} inputMode="decimal" placeholder="공통 기본값" value={seconds}
            onChange={e=>edit({timeoutText:e.target.value})}/></label>
          {fieldError('timeout')}
        </div>}
      </div>
    </section>
  </>
}
