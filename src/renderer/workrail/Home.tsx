import { CalendarDays } from 'lucide-react'
import { ToolIcon } from './ToolIcon'
import { useMemo } from 'react'
import type { ApiError, TimelineSnapshot } from '../../shared/types'
import type { SharingState } from '../../shared/sharing'
import type { TimelinePhase } from '../state/useTimeline'
import type { NodeManagement } from './useNodeManagement'
import { nodeActiveVersionLabel, nodeCapabilityReason, nodeDefaultVersion, nodeEnvironmentLabel, nodeEnvironmentReady, nodeInspectionStale,
  nodeInstalledVersions, nodeInventoryKnown, nodeOperationMessages, nodeProgress, platformScope, unknownInventory } from './nodePresentation'
import { EnvironmentActions, ManagerBadge, type OpenEnvironment } from './NodeEnvironment'
import { NodeOperationStatus, NodeVersionAction } from './NodeVersionControls'
import { SharingWidget } from './SharingWidget'

const maxSchedules = 10
const maxNodeVersions = 3
const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const todayFormat = (date: string) => {
  // setFullYear preserves four-digit business dates earlier than 0100.
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date()
  value.setFullYear(year, month - 1, day)
  return dateFormat.format(value)
}

export function Home({ date, snapshot, phase, timelineError, sharing, sharingError, node, onRefresh, onPlanrail, onNode, onEnvironment, onSettings, version }: {
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
  onEnvironment: OpenEnvironment
  onSettings?: () => void
  version?: string
}) {
  const revoked = sharing?.status === 'revoked'
  const projects = useMemo(() => new Map(snapshot?.projects.map(project => [project.id, project])), [snapshot])
  const today = useMemo(() => (snapshot?.schedules ?? [])
    .filter(schedule => schedule.startDate <= date && schedule.endDate >= date
      && (!revoked || (schedule.sharing !== 'member' && projects.get(schedule.projectId)?.sharing !== 'member')))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)
      || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)), [date, projects, revoked, snapshot])
  const { state } = node
  const progress = nodeProgress(node)
  const operationMessages = nodeOperationMessages(node)
  const sharingStale = sharing?.role === 'member' && sharing.status !== 'connected' && !revoked
  const scheduleStale = phase === 'stale' || phase === 'uncertain' || phase === 'blocked'
  const ready = nodeEnvironmentReady(node)
  const inventoryKnown = nodeInventoryKnown(node)
  const selected = nodeEnvironmentLabel(node)
  const versions = inventoryKnown ? nodeInstalledVersions(node) : []
  const listReason = nodeCapabilityReason(state, 'list')
  const useReason = nodeCapabilityReason(state, 'use')
  const envError = state?.environments?.error
  return (
    <main className="workrail-screen workrail-home" aria-label="Home">
      <div className="workrail-page-heading">
        <time dateTime={date}>{todayFormat(date)}</time>
      </div>
      <div className="workrail-home-grid">
        <section className="workrail-surface workrail-today" aria-labelledby="workrail-today-heading">
          <header className="workrail-card-heading">
            <h3 id="workrail-today-heading"><CalendarDays aria-hidden="true" size={18} />오늘의 일정</h3>
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
                    <div className="workrail-schedule-name">
                      <strong>{schedule.name}</strong>
                      <span>{project?.name}{project && ' · '}
                        <time dateTime={schedule.startDate}>{schedule.startDate.slice(5).replace('-', '.')}</time>{schedule.startDate !== schedule.endDate && <> – <time dateTime={schedule.endDate}>{schedule.endDate.slice(5).replace('-', '.')}</time></>}
                      </span>
                    </div>
                    {schedule.sharing || project?.sharing ? <span className="sharing-badge">공유</span> : <span className="workrail-tag">개인</span>}
                  </li>
                )
              })}
            </ul>
          )}
          {phase === 'ready' && today.length === 0 && <p className="workrail-muted">오늘의 일정이 없습니다.</p>}
          {today.length > maxSchedules && <p className="workrail-muted">오늘 일정 {today.length}개 중 처음 {maxSchedules}개를 표시합니다.</p>}
          <button type="button" className="workrail-control workrail-primary workrail-home-plan-link" onClick={onPlanrail}>PlanRail에서 전체 일정 보기</button>
        </section>
        <section className="workrail-surface workrail-home-node" aria-labelledby="workrail-home-node-heading">
          <header className="workrail-card-heading">
            <h3 id="workrail-home-node-heading">내 개발 환경</h3>
            <ToolIcon tool="node" size={18} />
          </header>
          {state?.supported === false ? <p className="workrail-muted">{platformScope}</p> : (
            <>
              <div className="workrail-active">
                <span>{ready ? selected + ' · ' + (nodeDefaultVersion(node) ? '기본 Node' : '현재 사용 중인 Node')
                  : node.environment && !node.environment.running ? selected + ' · 종료됨' : selected}</span>
                <strong>{nodeActiveVersionLabel(node)}</strong>
              </div>
              <div className="workrail-home-environment-actions">
                {ready && state?.manager.status !== 'checking' && state?.checkedAt && !nodeInspectionStale(node) &&
                  <div className="workrail-manager-line">
                    <ManagerBadge node={node} />
                    {state.activeSource === 'standalone' && <span className="workrail-tag">기존 Node 설치</span>}
                  </div>}
                <EnvironmentActions node={node} onEnvironment={onEnvironment} />
              </div>
              {envError && <p className="workrail-note">{envError.message}</p>}
              {ready && state?.checkedAt && <div className="workrail-summary-line">
                <span>설치된 버전</span>
                <strong>{inventoryKnown ? state.installedVersions.length + '개' : '확인할 수 없음'}</strong>
              </div>}
              {ready && !!state?.conflicts.length && <p className="workrail-note">Node 환경 충돌 {state.conflicts.length}건을 확인해 주세요.</p>}
            </>
          )}
          <button type="button" className="workrail-control workrail-primary workrail-home-node-link" onClick={onNode}>NodeRail 열기</button>
        </section>
        <div className="workrail-home-summaries">
          <SharingWidget sharing={sharing} error={sharingError} onSettings={onSettings} version={version} />
          <section className="workrail-surface workrail-widget workrail-node-widget" aria-labelledby="workrail-progress-heading">
            <header className="workrail-widget-heading">
              <h3 id="workrail-progress-heading">Node 작업</h3>
              {state?.supported && <span className="workrail-muted">{selected}</span>}
            </header>
            <NodeOperationStatus node={node} />
            {operationMessages.length > 0 && <button type="button" className="workrail-link" onClick={onNode}>NodeRail에서 자세히 보기</button>}
            {!progress && !operationMessages.length && <>
              {state?.supported === false ? <p className="workrail-muted">{platformScope}</p>
                : !ready ? <p className="workrail-muted">{node.environment && !node.environment.running
                  ? '환경을 시작하면 설치된 버전을 확인할 수 있습니다.' : '관리 환경을 확인하면 설치된 버전을 표시합니다.'}</p>
                : !inventoryKnown ? <p className="workrail-muted">{listReason ?? (state?.checkedAt ? unknownInventory : '설치된 버전을 확인하고 있습니다…')}</p>
                : !versions.length ? <p className="workrail-muted">설치된 버전이 없습니다.</p>
                : <>
                  <p className="workrail-muted">{node.environment?.kind === 'wsl2' ? '이 WSL 사용자의 설치된 버전' : '설치된 버전'}</p>
                  <ul className="workrail-widget-versions" aria-label="설치된 버전">
                    {versions.slice(0, maxNodeVersions).map(version => <li key={version}>
                      <strong>{version}</strong><NodeVersionAction node={node} version={version} />
                    </li>)}
                  </ul>
                  {useReason && <p className="workrail-muted">{useReason}</p>}
                  {versions.length > maxNodeVersions && <button type="button" className="workrail-link" onClick={onNode}>전체 {versions.length}개</button>}
                  {node.environment?.kind === 'wsl2' && <p className="workrail-widget-meta">프로젝트의 .node-version 설정은 유지됩니다.</p>}
                </>}
            </>}
          </section>
        </div>
      </div>
    </main>
  )
}
