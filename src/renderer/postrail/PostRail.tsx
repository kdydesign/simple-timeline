import {useEffect, useState, type CSSProperties} from 'react'
import type {PostRailController} from './usePostRail'
import type {PostRailResultTarget} from '../workrail/PostRailWidget'
import {Sidebar} from './Sidebar'
import {EnvironmentManagerButton} from './EnvironmentDialog'
import {RequestEditor} from './RequestEditor'
import {ResponsePane, ResultsFooter} from './Results'
import './postrail-workspace.css'

export function PostRail({postrail, active, onDirtyChange, resultTarget, onResultOpened}: {
  postrail:PostRailController;active:boolean;onDirtyChange?:(dirty:boolean)=>void
  resultTarget?:PostRailResultTarget|null;onResultOpened?:()=>void
}) {
  const {library,run,error} = postrail
  const [requestId,setRequestId] = useState<string|null>(null)
  const [picked,setPicked] = useState<{runId:string,iteration:string}|null>(null)
  const [environmentOpen,setEnvironmentOpen] = useState(false)
  const [consoleKey,setConsoleKey] = useState(0)
  const [bodyFocusKey,setBodyFocusKey] = useState(0)
  const [unavailable,setUnavailable] = useState(false)
  const [pointerFocus,setPointerFocus] = useState(false)
  const [ratio,setRatio] = useState(30)
  useEffect(()=>{
    if (!active || !resultTarget) return
    const matches = run?.runId === resultTarget.runId
    setUnavailable(!matches)
    if (matches) {
      setRequestId(resultTarget.requestId)
      setPicked(resultTarget)
      setBodyFocusKey(key=>key+1)
    }
    onResultOpened?.()
  },[active,resultTarget,run?.runId,onResultOpened])
  const resize = (value:number)=>setRatio(Math.max(10,Math.min(90,Math.round(value))))
  const request = library.requests.find(r=>r.id===requestId) ?? library.requests[0] ?? null
  const selected = run && picked?.runId===run.runId ? picked.iteration : run?.completed && run.completed!=='0' ? run.completed : ''
  return <section className="workrail-screen postrail-workspace" aria-label="PostRail" hidden={!active}
    data-pointer-focus={pointerFocus} onPointerDownCapture={()=>setPointerFocus(true)}
    onKeyDownCapture={e=>{if(e.key==='Tab')setPointerFocus(false)}}>
    {error && <div role="alert" className="pr-workspace-alert">{error}
      <button onClick={()=>{postrail.clearError();void postrail.refresh()}}>다시 읽기</button></div>}
    <div className="pr-workarea">
      <Sidebar postrail={postrail} selectedId={request?.id ?? null} onSelect={setRequestId}/>
      <div className="pr-editor-column" style={{'--pr-request-share':ratio,'--pr-response-share':100-ratio} as CSSProperties}>
        <RequestEditor postrail={postrail} request={request} onDirtyChange={onDirtyChange}
          onOpenEnvironment={()=>setEnvironmentOpen(true)} onOpenConsole={()=>setConsoleKey(key=>key+1)}/>
        <div className="pr-resizer" role="separator" aria-orientation="horizontal" aria-label="요청과 응답 영역 크기"
          aria-valuemin={10} aria-valuemax={90} aria-valuenow={ratio} tabIndex={0}
          onDoubleClick={()=>setRatio(30)} onKeyDown={event=>{
            if(event.key==='ArrowUp'||event.key==='ArrowDown'){
              event.preventDefault();resize(ratio+(event.key==='ArrowUp'?-5:5))
            }
          }}
          onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={event=>{
            const grip=event.currentTarget
            if(!grip.hasPointerCapture(event.pointerId)) return
            const upper=grip.previousElementSibling?.getBoundingClientRect(), lower=grip.nextElementSibling?.getBoundingClientRect()
            if(upper && lower && upper.height+lower.height>0) resize(100*(event.clientY-upper.top-grip.offsetHeight/2)/(upper.height+lower.height))
          }}/>
        {unavailable ? <section className="pr-pane" role="alert">이 실행의 결과가 교체되어 열 수 없습니다.
          <button onClick={()=>setUnavailable(false)}>현재 실행 보기</button></section> :
        <ResponsePane bodyFocusKey={bodyFocusKey} key={run?.runId} postrail={postrail} active={active} selected={selected}/>}
      </div>
    </div>
    <ResultsFooter openConsole={consoleKey} requestId={request?.id} postrail={postrail} selected={selected} active={active}
      onSelect={iteration=>run && setPicked({runId:run.runId,iteration})}
      environmentButton={<EnvironmentManagerButton postrail={postrail} open={environmentOpen} onOpenChange={setEnvironmentOpen}/>}/>
  </section>
}
