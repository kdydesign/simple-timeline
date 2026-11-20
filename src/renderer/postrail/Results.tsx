import {ConsoleDrawer} from './ConsoleDrawer'
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {ChevronUp, Terminal} from 'lucide-react'
import {postRailBusy, validPostRailCount, type PrDetail, type PrRow} from '../../shared/postrail-run'
import type {PostRailController} from './usePostRail'
import {ResponseBody} from './ResponseBody'
import {formatPostRailStatus} from './status'

const outcomes = {success:'성공',error:'실패',uncertain:'결과 확인 필요',unsent:'미전송'}
type ReadDetail = {runId:string, iteration:string, detail:PrDetail|null, error:string}
export function ResponsePane({postrail, selected, active, bodyFocusKey}: {
  postrail:PostRailController, selected:string, active:boolean, bodyFocusKey?:number
}) {
  const [headerSelection, setHeaderSelection] = useState<string|null>(null)
  const bodyTab = useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    if (!bodyFocusKey) return
    setHeaderSelection(null)
    bodyTab.current?.focus()
  },[bodyFocusKey])
  const [read, setRead] = useState<ReadDetail|null>(null)
  const {run, detail} = postrail
  const runId = run?.runId ?? ''
  useEffect(()=>{
    if (!active || !runId || !selected) return
    let current = true
    detail(selected,runId).then(result=>{
      if (current) setRead({runId,iteration:selected,detail:result,error:result?'':'회차 응답을 읽을 수 없습니다.'})
    }).catch(()=>{
      if (current) setRead({runId,iteration:selected,detail:null,error:'회차 응답을 읽을 수 없습니다.'})
    })
    return ()=>{current=false}
  },[active,runId,selected,detail])

  const result = read?.runId===runId && read.iteration===selected ? read : null
  const response = result?.detail
  const mediaType = response && Object.entries(response.headers).find(([key])=>key.toLowerCase()==='content-type')?.[1].split(';')[0].trim()
  const json = mediaType && /(?:\/|\+)json$/i.test(mediaType)
  const responseId = runId + '/' + selected
  const headers = headerSelection===responseId
  const http = response?.status ? 'HTTP ' + response.status : ''
  const message = response?.message || http || (response && outcomes[response.outcome])
  const status = response ? [
    http && !message?.includes(http) ? http : '', message,
    !response.body && response.status && (!response.message || response.message === http) ? '응답 본문 없음' : '',
    selected+'회차', response.outcome!=='unsent' ? response.durationMs+'ms' : '',
  ].filter(Boolean).join(' · ') : result?.error || (selected ? '응답 읽는 중…' : run?.message || '표시할 응답이 없습니다.')
  return <section className="workrail-surface pr-pane" aria-label="응답">
    <div className="pr-bar"><h2>응답</h2>
      <div className="pr-tabs" role="tablist" aria-label="응답 표시">
        <button ref={bodyTab} role="tab" aria-selected={!headers} onClick={()=>setHeaderSelection(null)}>본문</button>
        <button role="tab" aria-selected={headers} onClick={()=>setHeaderSelection(responseId)}>헤더</button>
      </div>
      {!!runId && <small>{run?.environmentName} / {run?.requestName}</small>}
      <span className="pr-detail-status" data-outcome={response?.outcome}>{status}</span>
    </div>
    <ResponseBody key={responseId + (response ? '/received' : '/pending')} received={response?.body ?? ''}
      jsonType={!!json} hidden={headers}/>
    {headers && <div className="pr-content"><pre aria-label="응답 헤더">{
      Object.entries(response?.headers ?? {}).map(([key,value])=>key+': '+value).join('\n') || '응답 헤더 없음'
    }</pre></div>}
  </section>
}

const pageSize = 100n
function pageStart(iteration:string) {
  return validPostRailCount(iteration) ? (BigInt(iteration)-1n)/pageSize*pageSize : 0n
}
function LogDrawer({postrail, selected, onSelect, active}: {postrail:PostRailController,selected:string,
  onSelect:(iteration:string)=>void,active:boolean}) {
  const {run,page} = postrail
  const [offset, setOffset] = useState(()=>pageStart(selected))
  const [input, setInput] = useState(selected)
  const [validation, setValidation] = useState('')
  const [read, setRead] = useState<{offset:bigint,rows:PrRow[],error:string}|null>(null)
  const runId = run?.runId ?? ''
  const available = run ? BigInt(postRailBusy(run.phase) ? run.completed : run.total) : 0n
  const end = offset+pageSize<available ? offset+pageSize : available
  useEffect(()=>{
    if (!active || !runId || end<=offset) return
    let current = true
    page(String(offset),runId).then(rows=>{
      if (current) setRead({offset,rows,error:rows.length?'':'회차별 결과를 읽을 수 없습니다.'})
    }).catch(()=>{
      if (current) setRead({offset,rows:[],error:'회차별 결과를 읽을 수 없습니다.'})
    })
    return ()=>{current=false}
  },[active,page,runId,offset,end])

  const entries = read?.offset===offset ? read : null
  const log = useMemo(()=>entries?.rows.map(row=>[
    row.iteration+'회',outcomes[row.outcome],row.status ? 'HTTP '+row.status : '',
    row.index!==null ? '인덱스 '+row.index : '',
    row.message.replace(/[\r\n\u2028\u2029]+/g,' '),
  ].filter(Boolean).join('　')).join('\n') ?? '',[entries])
  return <section aria-label="회차별 결과" className="pr-drawer" id="postrail-log">
    <div className="pr-drawer-tools">
      <h2>회차별 결과</h2><span>{available ? String(offset+1n)+'–'+end+' / '+available : '0회'}</span>
      <button disabled={offset===0n} onClick={()=>setOffset(offset-pageSize)}>이전</button>
      <button disabled={end>=available} onClick={()=>setOffset(offset+pageSize)}>다음</button>
      <form onSubmit={event=>{
        event.preventDefault()
        const raw = input.trim()
        if (!validPostRailCount(raw) || BigInt(raw)>available) {
          setValidation(available?'1~'+available+' 사이의 회차를 입력하세요.':'표시할 회차가 없습니다.')
          return
        }
        onSelect(raw)
        setOffset(pageStart(raw))
        setValidation('')
      }}>
        <label>회차 <input inputMode="numeric" value={input} onChange={e=>{setInput(e.target.value);setValidation('')}}/></label>
        <button disabled={!available}>응답 보기</button>
      </form>
      {(validation || entries?.error) && <span className="pr-error" role="alert">{validation || entries?.error}</span>}
    </div>
    <textarea aria-label="회차별 결과 로그" readOnly wrap="off" spellCheck={false}
      value={log} placeholder={available?'결과 읽는 중…':'표시할 회차가 없습니다.'}/>
  </section>
}

export function ResultsFooter({postrail, selected, onSelect, active, environmentButton, openConsole, requestId}: {
  postrail:PostRailController, selected:string, onSelect:(iteration:string)=>void, active:boolean, environmentButton:ReactNode, openConsole?:number, requestId?:string
}) {
  const {run} = postrail
  const [open,setOpen] = useState<'results'|'console'|null>(null)
  const resultsToggle = useRef<HTMLButtonElement>(null)
  const consoleToggle = useRef<HTMLButtonElement>(null)
  const preflight = requestId && postrail.sendError(requestId, postrail.library.environmentId)?.preflight &&
    !(run && postRailBusy(run.phase))
  const summary = preflight ? '전송 전 오류 · 미전송' : formatPostRailStatus(run) + (run?.message ? ' · '+run.message : '')
  useEffect(()=>{
    if (openConsole) setOpen('console')
  },[openConsole])
  useEffect(()=>{
    if (!open || !active) return
    function escape(event:KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open],[role="dialog"]:not([hidden]),[role="menu"]')) return
      event.preventDefault()
      setOpen(null)
      const trigger = open === 'console' ? consoleToggle : resultsToggle
      trigger.current?.focus()
    }
    document.addEventListener('keydown',escape)
    return ()=>document.removeEventListener('keydown',escape)
  },[open,active])
  return <footer className="pr-footer">
    {open === 'console' && <ConsoleDrawer postrail={postrail} active={active}/>}
    {open === 'results' && <LogDrawer key={run?.runId} postrail={postrail} selected={selected} onSelect={onSelect} active={active}/>}
    <div className="planrail-status pr-status">
      <i aria-hidden="true" data-warning={!!preflight || !!run && (run.failed!=='0' || run.uncertain!=='0' || run.phase==='failed')}/>
      <span className="pr-summary" title={summary}>{summary}</span>
      <button aria-expanded={open==='console'} aria-controls="postrail-console" ref={consoleToggle} onClick={()=>setOpen(open==='console' ? null : 'console')}>
        <Terminal size={15} aria-hidden="true"/>console</button>
      <button aria-expanded={open==='results'} aria-controls="postrail-log" ref={resultsToggle} onClick={()=>setOpen(open==='results' ? null : 'results')}>
        <ChevronUp size={16} aria-hidden="true"/>회차별 결과</button>
      {environmentButton}
    </div>
  </footer>
}
