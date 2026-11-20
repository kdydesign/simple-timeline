import {useState} from 'react'
import type {PostRailController} from './usePostRail'
import {Sidebar} from './Sidebar'
import {EnvironmentManagerButton} from './EnvironmentDialog'
import {RequestEditor} from './RequestEditor'
import {ResponsePane, ResultsFooter} from './Results'
import './postrail-workspace.css'

export function PostRail({postrail, active, onDirtyChange}: {
  postrail:PostRailController,active:boolean,onDirtyChange?:(dirty:boolean)=>void
}) {
  const {library,run,error} = postrail
  const [requestId,setRequestId] = useState<string|null>(null)
  const [picked,setPicked] = useState<{runId:string,iteration:string}|null>(null)
  const request = library.requests.find(r=>r.id===requestId) ?? library.requests[0] ?? null
  const selected = run && picked?.runId===run.runId ? picked.iteration : run?.completed && run.completed!=='0' ? run.completed : ''
  return <section className="workrail-screen postrail-workspace" aria-label="PostRail" hidden={!active}>
    {error && <div role="alert" className="pr-workspace-alert">{error}
      <button onClick={()=>{postrail.clearError();void postrail.refresh()}}>다시 읽기</button></div>}
    <div className="pr-workarea">
      <Sidebar postrail={postrail} selectedId={request?.id ?? null} onSelect={setRequestId}/>
      <div className="pr-editor-column">
        <RequestEditor postrail={postrail} request={request} onDirtyChange={onDirtyChange}/>
        <ResponsePane key={run?.runId} postrail={postrail} active={active} selected={selected}/>
      </div>
    </div>
    <ResultsFooter postrail={postrail} selected={selected} active={active}
      onSelect={iteration=>run && setPicked({runId:run.runId,iteration})}
      environmentButton={<EnvironmentManagerButton postrail={postrail}/>}/>
  </section>
}
