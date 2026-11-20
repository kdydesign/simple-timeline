import { ArrowRightLeft, ChevronRight, LoaderCircle, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PrEnv, PrRequest } from '../../shared/postrail'
import { postRailBusy, validPostRailCount } from '../../shared/postrail-run'
import { formatPostRailStatus } from '../postrail/status'
import type { PostRailController } from '../postrail/usePostRail'
import './postrail-widget.css'

export type HomePostRail = Pick<PostRailController, 'library' | 'run' | 'error' | 'start' | 'available' | 'submitting'>

export interface PostRailResultTarget {runId:string;requestId:string;iteration:string}
type WidgetController = HomePostRail & Partial<Pick<PostRailController,'sendError'|'submittingRequestId'>>

function FavoriteRow({request, environment, disabled, loading, completedRunId, start}: {
  request:PrRequest; environment:PrEnv|undefined; disabled:boolean; loading:boolean; completedRunId?:string; start:HomePostRail['start']
}) {
  const [repeat,setRepeat] = useState(false)
  const [count,setCount] = useState(request.savedRepeatCount || '1')
  useEffect(()=>{
    if(completedRunId){setRepeat(false);setCount(request.savedRepeatCount || '1')}
  },[completedRunId,request.savedRepeatCount])
  const repeatable = request.method === 'POST' && validPostRailCount(request.savedRepeatCount ?? '')
  const invalid = repeat && !validPostRailCount(count)
  const action = loading ? '실행 중' : repeat ? '반복 실행' : '실행'
  return <li>
    <b className="postrail-home-method" data-method={request.method}>{request.method}</b>
    <span className="postrail-home-name">{request.name}</span>
    <button type="button" className="workrail-control" disabled={disabled || invalid} aria-busy={loading}
      aria-label={request.name+' '+(!repeat && !loading?'즉시 실행':action)}
      onClick={()=>environment && void start(request,environment.id,repeat ? count : '1')}>
      {loading ? <LoaderCircle className="postrail-home-spin" aria-hidden="true" size={12}/> : <Play aria-hidden="true" size={12}/>}
      {action}
    </button>
    {repeatable && <div className="postrail-home-repeat">
      <label><input type="checkbox" aria-label={request.name+' 반복 보내기'} checked={repeat} disabled={disabled}
        onChange={event=>setRepeat(event.target.checked)}/>반복 보내기</label>
      <input aria-label={request.name+' 반복 횟수'} inputMode="numeric" value={count} aria-invalid={invalid}
        disabled={disabled || !repeat} onChange={event=>setCount(event.target.value)}/><span>회</span>
      {invalid && <small role="alert">횟수는 양의 정수로 입력하세요.</small>}
    </div>}
  </li>
}

export function PostRailWidget({postrail,onOpen,onResult}: {
  postrail:WidgetController; onOpen?:()=>void; onResult?:(target:PostRailResultTarget)=>void
}) {
  const { library, run, available, submitting, error, start } = postrail
  const environment = library.environments.find(env => env.id === library.environmentId)
  const favorites = useMemo(() => {
    const rank = new Map(library.groups.map((group, index) => [group.id, index]))
    const groupRank = (id: string | null) => id === null ? rank.size : rank.get(id) ?? rank.size
    // Stable sort retains the saved order within each group, including ungrouped requests.
    return library.requests.filter(request => request.favorite).sort((a, b) => groupRank(a.groupId) - groupRank(b.groupId))
  }, [library])
  const busy = !!run && postRailBusy(run.phase)
  const disabled = !available || !environment || submitting || busy
  const visible = favorites.slice(0, 5)
  const finished = !!run?.runId && !busy
  const [attempt,setAttempt] = useState<string|null>(null)
  const send = (request:PrRequest, environmentId:string, count:string) => {
    setAttempt(request.id)
    return start(request, environmentId, count)
  }
  const failure = environment && attempt && postrail.sendError?.(attempt,environment.id)
  const authenticated = environment && run?.authenticatedEnvironmentIds.includes(environment.id)
  return <section className="workrail-surface workrail-widget postrail-home-widget" aria-labelledby="postrail-home-heading">
    <header className="workrail-widget-heading">
      <h3 id="postrail-home-heading">PostRail 즐겨찾기</h3><ArrowRightLeft size={17} aria-hidden="true" />
    </header>
    {environment && <div className="postrail-home-environment">
      <strong>{environment.name}</strong><span>{!run ? '인증 상태 확인 중' : authenticated ? '인증됨' : environment.loginUrl.trim() ? '로그인 필요' : '로그인 미설정'}</span>
    </div>}
    {!available && !error && <p className="workrail-muted">저장한 요청을 아직 확인할 수 없습니다.</p>}
    {available && !environment && <p className="workrail-muted">PostRail에서 대상 환경을 선택하세요.</p>}
    {favorites.length > 0 && <ul className="postrail-home-list" aria-labelledby="postrail-home-heading">
      {visible.map(request=><FavoriteRow
        key={JSON.stringify([request.id,environment?.id,request.savedRepeatCount])}
        completedRunId={finished && run.requestId===request.id ? run.runId : undefined}
        request={request} environment={environment} disabled={disabled} start={send}
        loading={!!(submitting && postrail.submittingRequestId===request.id || busy && run?.requestId===request.id)}/>)}
    </ul>}
    {available && !favorites.length && <p className="workrail-muted">PostRail에서 저장한 요청 옆의 ☆를 누르면 여기에 표시됩니다.</p>}
    {run && run.phase !== 'idle' && <div className="postrail-home-result">
      <div role="status" aria-label="최근 실행" className="postrail-home-summary">
        <div className="postrail-home-result-title">
          <span className="postrail-home-badge">{finished ? '결과' : '진행'}</span>
          <strong>{run.requestName}</strong>
        </div>
        <span className="postrail-home-result-environment">{run.environmentName}</span>
        <span>{formatPostRailStatus(run)}</span>
        {run.message && <span>{run.message}</span>}
      </div>
      {finished && onResult && <button type="button" className="postrail-home-inspect"
        onClick={()=>onResult({runId:run.runId,requestId:run.requestId,iteration:run.completed==='0'?'':run.completed})}>
        결과 보기<ChevronRight size={12} aria-hidden="true"/>
      </button>}
    </div>}
    {(failure || error) && <p className="workrail-note" role="alert">{(failure && failure.message) || error}</p>}
    <div className="workrail-widget-meta">
      <span>{available && '즐겨찾기 ' + favorites.length + '개'}</span>
      {onOpen && <button type="button" className="workrail-link" onClick={onOpen}>PostRail 열기</button>}
    </div>
  </section>
}
