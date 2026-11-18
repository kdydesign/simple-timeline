import { CalendarDays } from 'lucide-react'
import { ToolIcon } from './ToolIcon'
import { useMemo } from 'react'
import type { ApiError, TimelineSnapshot } from '../../shared/types'
import type { SharingState } from '../../shared/sharing'
import { sharingDescription } from '../../shared/sharing-status'
import type { TimelinePhase } from '../state/useTimeline'
import type { NodeManagement } from './useNodeManagement'
import { nodeActiveVersionLabel, nodeInspectionStale, nodeInventoryKnown, nodeManagerLabel, nodeOperationMessages, nodeProgress, platformScope } from './nodePresentation'

const maxSchedules = 10
const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const todayFormat = (date: string) => {
  // setFullYear preserves four-digit business dates earlier than 0100.
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date()
  value.setFullYear(year, month - 1, day)
  return dateFormat.format(value)
}
const shareRole = { personal: '개인 전용', host: '호스트', member: '멤버' } as const

export function Home({ date, snapshot, phase, timelineError, sharing, sharingError, node, onRefresh, onPlanrail, onNode }: {
  date: string
  snapshot: TimelineSnapshot | null
  phase: TimelinePhase
  timelineError: ApiError | null
  sharing: SharingState | null
  sharingError: ApiError | null
  node: NodeManagement
  onRefresh: () => void
  onPlanrail: () => void
  onNode: () => void
}) {
  const revoked = sharing?.status === 'revoked'
  const projects = useMemo(() => new Map(snapshot?.projects.map(project => [project.id, project])), [snapshot])
  const today = useMemo(() => (snapshot?.schedules ?? [])
    .filter(schedule => schedule.startDate <= date && schedule.endDate >= date
      && (!revoked || (schedule.sharing !== 'member' && projects.get(schedule.projectId)?.sharing !== 'member')))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)
      || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)), [date, projects, revoked, snapshot])
  const { state, error } = node
  const progress = nodeProgress(node)
  const operationMessages = nodeOperationMessages(node)
  const sharingStale = sharing?.role === 'member' && sharing.status !== 'connected' && !revoked
  const scheduleStale = phase === 'stale' || phase === 'uncertain' || phase === 'blocked'
  const inventoryKnown = nodeInventoryKnown(node)
  return (
    <main className="workrail-screen workrail-home" aria-label="Home">
      <div className="workrail-page-heading">
        <time dateTime={date}>{todayFormat(date)}</time>
      </div>
      <div className="workrail-home-grid">
        <section className="workrail-surface workrail-today" aria-labelledby="workrail-today-heading">
          <header className="workrail-card-heading">
            <h3 id="workrail-today-heading"><CalendarDays aria-hidden="true" size={18} />오늘의 일정</h3>
            <button type="button" className="workrail-control" onClick={onPlanrail}>PlanRail에서 전체 일정 보기</button>
          </header>
          {phase === 'loading' && <p className="workrail-muted" aria-live="polite">일정을 조회하고 있습니다…</p>}
          {scheduleStale && (
            <div className="workrail-message">
              <p role="alert">{snapshot ? '마지막으로 조회한 일정입니다. ' : ''}{timelineError?.message ?? '일정을 확인하지 못했습니다.'}</p>
              <button type="button" className="workrail-control" onClick={onRefresh}>일정 다시 조회</button>
            </div>
          )}
          {sharingStale && <p className="workrail-note">마지막으로 동기화한 공유 일정을 표시합니다.</p>}
          {today.length > 0 && (
            <ul className="workrail-schedule-list" aria-labelledby="workrail-today-heading">
              {today.slice(0, maxSchedules).map(schedule => {
                const project = projects.get(schedule.projectId)
                return (
                  <li key={schedule.id}>
                    <span className="workrail-schedule-date"><time dateTime={schedule.startDate}>{schedule.startDate}</time>{schedule.startDate !== schedule.endDate && <> – <time dateTime={schedule.endDate}>{schedule.endDate}</time></>}</span>
                    <div className="workrail-schedule-name">
                      <strong>{schedule.name}</strong>
                      {project && <span>{project.name}</span>}
                    </div>
                    <span className="workrail-tag">{schedule.sharing || project?.sharing ? '공유' : '개인'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {phase === 'ready' && today.length === 0 && <p className="workrail-muted">오늘의 일정이 없습니다.</p>}
          {today.length > maxSchedules && <p className="workrail-muted">오늘 일정 {today.length}개 중 처음 {maxSchedules}개를 표시합니다.</p>}
        </section>
        <section className="workrail-surface workrail-home-node" aria-labelledby="workrail-home-node-heading">
          <header className="workrail-card-heading">
            <h3 id="workrail-home-node-heading">내 개발 환경</h3>
            <ToolIcon tool="node" size={27} />
          </header>
          {state?.supported === false ? <p className="workrail-muted">{platformScope}</p> : (
            <>
              <div className="workrail-active">
                <span>현재 사용 중인 Node</span>
                <strong>{nodeActiveVersionLabel(node)}</strong>
                {state?.activeSource && !nodeInspectionStale(node) && <span className="workrail-tag">{state.activeSource === 'nvm' ? 'nvm-windows 사용 중' : '기존 Node 설치'}</span>}
              </div>
              {state && state.manager.status !== 'ready' && <p className="workrail-muted">{nodeManagerLabel(state)}</p>}
              {state?.checkedAt && (
                <div className="workrail-summary-line">
                  <span>{!inventoryKnown && state.installedVersions.length > 0 ? '마지막으로 확인한 설치 버전' : '설치된 버전'}</span>
                  <strong>{!inventoryKnown && !state.installedVersions.length ? '확인할 수 없음' : state.installedVersions.length + '개'}</strong>
                </div>
              )}
              {!!state?.conflicts.length && <p className="workrail-note">Node 환경 충돌 {state.conflicts.length}건을 확인해 주세요.</p>}
            </>
          )}
          <button type="button" className="workrail-control workrail-home-node-link" onClick={onNode}>NodeRail 열기</button>
        </section>
        <div className="workrail-home-summaries">
          <section className="workrail-surface" aria-labelledby="workrail-sharing-heading">
            <h3 id="workrail-sharing-heading">PlanRail 상태</h3>
            <div className="workrail-sharing-badges">
              {sharing && <span className="workrail-tag">{shareRole[sharing.role]}</span>}
              <span className="workrail-tag workrail-connection" data-connected={!!sharing && !sharingError && sharing.status === 'connected' && sharing.role !== 'personal'}>
                {sharing && !sharingError ? sharingDescription(sharing) : '공유 상태 확인 불가'}
              </span>
            </div>
            {sharing?.lastCheckedAt && <p className="workrail-muted">마지막 정상 확인 <time dateTime={sharing.lastCheckedAt}>{new Date(sharing.lastCheckedAt).toLocaleString('ko-KR')}</time></p>}
            {sharingError && <p role="alert">{sharingError.message}</p>}
          </section>
          <section className="workrail-surface" aria-labelledby="workrail-progress-heading">
            <h3 id="workrail-progress-heading">Node 작업</h3>
            <p aria-live="polite">{progress ?? (state && !error ? '진행 중인 Node 작업이 없습니다.' : 'Node 작업 상태를 확인할 수 없습니다.')}</p>
            {operationMessages.map(message => <p key={message} role="alert">{message}</p>)}
          </section>
        </div>
      </div>
    </main>
  )
}
