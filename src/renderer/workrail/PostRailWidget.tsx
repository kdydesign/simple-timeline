import { ArrowRightLeft, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PrEnv, PrRequest } from '../../shared/postrail'
import { postRailBusy, usesPostRailIndex, validPostRailCount } from '../../shared/postrail-run'
import { formatPostRailStatus } from '../postrail/status'
import { PostRailPopup } from '../postrail/PostRailPopup'
import type { PostRailController } from '../postrail/usePostRail'
import './postrail-widget.css'

export type HomePostRail = Pick<PostRailController, 'library' | 'run' | 'error' | 'start' | 'available' | 'submitting'>

function RepeatFavorite({ request, environment, anchor, close, start }: {
  request: PrRequest; environment: PrEnv; anchor: HTMLElement; close: () => void; start: HomePostRail['start']
}) {
  const [count, setCount] = useState('1')
  const indexed = useMemo(() => usesPostRailIndex(request), [request])
  const valid = validPostRailCount(count)
  const summary = !valid ? '횟수는 양의 정수로 입력하세요.'
    : indexed ? '인덱스 ' + request.nextIndex + ' – ' + (BigInt(request.nextIndex) + BigInt(count) - 1n)
    : '같은 요청을 ' + count + '회 전송합니다.'
  return <PostRailPopup title="반복 보내기" anchor={anchor} onClose={close}>
    <form onSubmit={event => {
      event.preventDefault()
      if (!valid) return
      close()
      void start(request, environment.id, count)
    }}>
      <p className="quick-reminder-schedule">{environment.name} · {request.method} {request.name}</p>
      <label className="pr-field">횟수
        <input autoFocus inputMode="numeric" value={count} onFocus={e => e.target.select()} onChange={e => setCount(e.target.value)}
          aria-invalid={!valid} aria-describedby="postrail-home-repeat-range" />
      </label>
      <p id="postrail-home-repeat-range" className="workrail-muted" aria-live="polite">{summary}</p>
      <div className="editor-actions">
        <button type="button" onClick={close}>취소</button>
        <button type="submit" className="primary" disabled={!valid}>{valid ? count + '회 보내기' : '보내기'}</button>
      </div>
    </form>
  </PostRailPopup>
}

export function PostRailWidget({ postrail, onOpen }: { postrail: HomePostRail; onOpen?: () => void }) {
  const { library, run, available, submitting, error, start } = postrail
  const [repeat, setRepeat] = useState<{ id: string; environmentId: string; anchor: HTMLElement } | null>(null)
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
  const repeated = visible.find(request => request.id === repeat?.id && request.method === 'POST')
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
      {visible.map(request => <li key={request.id}>
        <b className="postrail-home-method" data-method={request.method}>{request.method}</b>
        <span className="postrail-home-name">{request.name}</span>
        <button type="button" className="workrail-control" disabled={disabled} aria-label={request.name + ' 즉시 실행'}
          onClick={() => environment && void start(request, environment.id, '1')}><Play aria-hidden="true" size={12} />실행</button>
        {request.method === 'POST' && <button type="button" className="workrail-link" disabled={disabled}
          aria-label={request.name + ' 반복 보내기'} aria-haspopup="dialog"
          onClick={e => environment && setRepeat({id: request.id, environmentId: environment.id, anchor: e.currentTarget})}>반복…</button>}
      </li>)}
    </ul>}
    {available && !favorites.length && <p className="workrail-muted">PostRail에서 저장한 요청 옆의 ☆를 누르면 여기에 표시됩니다.</p>}
    {run && run.phase !== 'idle' && <p className="postrail-home-result" role="status">
      최근 실행 · <strong>{run.requestName}</strong> · {run.environmentName} · {formatPostRailStatus(run)}
      {run.message && ' · ' + run.message}
    </p>}
    {error && <p className="workrail-note" role="alert">{error}</p>}
    <div className="workrail-widget-meta">
      <span>{available && '즐겨찾기 ' + favorites.length + '개'}</span>
      {onOpen && <button type="button" className="workrail-link" onClick={onOpen}>PostRail 열기</button>}
    </div>
    {!disabled && repeat && repeated && environment?.id === repeat.environmentId &&
      <RepeatFavorite request={repeated} environment={environment} anchor={repeat.anchor} close={() => setRepeat(null)} start={start} />}
  </section>
}
