import { ArrowRight, CalendarDays, FolderOpen } from 'lucide-react'
import { toOrdinal } from '../../domain/date'
import { useMemo } from 'react'
import type { ApiError, TimelineSnapshot } from '../../shared/types'
import type { SharingState } from '../../shared/sharing'
import type { TimelinePhase } from '../state/useTimeline'
import type { NodeManagement } from './useNodeManagement'
import { nodeActiveVersionLabel, nodeCanRecheck, nodeCapabilityReason, nodeDefaultVersion, nodeEnvironmentLabel, nodeEnvironmentReady, nodeInspectionStale,
  nodeInstalledVersions, nodeInventoryKnown, nodeOperationMessages, nodeProgress, platformScope, unknownInventory } from './nodePresentation'
import { EnvironmentActions, ManagerBadge, type OpenEnvironment } from './NodeEnvironment'
import { NodeOperationOverlay, NodeOperationStatus, NodeTooltip, NodeVersionAction } from './NodeVersionControls'
import { SharingWidget } from './SharingWidget'
import { PostRailWidget, type HomePostRail } from './PostRailWidget'
import './home.css'

const maxSchedules = 10
const maxNodeVersions = 5
type OpenNode = (target: 'overview' | 'installed') => void
const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const todayFormat = (date: string) => {
  // setFullYear preserves four-digit business dates earlier than 0100.
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date()
  value.setFullYear(year, month - 1, day)
  return dateFormat.format(value)
}

export function Home({ date, snapshot, phase, timelineError, sharing, sharingError, node, onRefresh, onPlanrail, onNode, onEnvironment, onSettings, postrail, onPostRail, version }: {
  date: string
  snapshot: TimelineSnapshot | null
  phase: TimelinePhase
  timelineError: ApiError | null
  sharing: SharingState | null
  sharingError: ApiError | null
  node: NodeManagement
  onRefresh: () => void
  onPlanrail: () => void
  onNode: OpenNode
  onEnvironment: OpenEnvironment
  postrail?: HomePostRail
  onPostRail?: () => void
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
  // During a change Main may temporarily return an empty inventory. Keep the
  // last confirmed readings visible until it has verified the outcome.
  const working = !!(node.state?.busy || node.mutation) && node.state?.error?.code !== 'operation-unknown'
  const previous = working ? node.operationBaseline : null
  const inventory = previous ? { ...node, state: previous, error: null } : node
  const { state } = inventory
  const todayOrdinal = toOrdinal(date)
  const sharingStale = sharing?.role === 'member' && sharing.status !== 'connected' && !revoked
  const scheduleStale = phase === 'stale' || phase === 'uncertain' || phase === 'blocked'
  const ready = nodeEnvironmentReady(inventory)
  const inventoryKnown = nodeInventoryKnown(inventory)
  const selected = nodeEnvironmentLabel(node)
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
                const daysLeft = toOrdinal(schedule.endDate) - todayOrdinal
                return (
                  <li key={schedule.id}>
                    <div className="workrail-schedule-name">
                      <strong>{schedule.name}</strong>
                      <span>{project?.name}{project && ' · '}
                        <time dateTime={schedule.startDate}>{schedule.startDate.slice(5).replace('-', '.')}</time>{schedule.startDate !== schedule.endDate && <> – <time dateTime={schedule.endDate}>{schedule.endDate.slice(5).replace('-', '.')}</time></>}
                      </span>
                    </div>
                    <div className="workrail-schedule-badges">
                      {schedule.sharing || project?.sharing ? <span className="sharing-badge">공유</span> : <span className="workrail-tag">개인</span>}
                      <span className="workrail-tag workrail-schedule-due" data-due-today={daysLeft === 0 || undefined}>
                        {daysLeft === 0 ? '오늘 마감' : daysLeft + '일 남음'}
                      </span>
                    </div>
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
            <ManagerFolderButton node={node} />
          </header>
          {node.folderError && <p className="workrail-note" role="alert">{node.folderError}</p>}
          {state?.supported === false ? <p className="workrail-muted">{platformScope}</p> : (
            <>
              <div className="workrail-active">
                <span>{ready ? selected + ' · ' + (previous ? '작업 전 확인한 Node' : nodeDefaultVersion(node) ? '기본 Node' : '현재 사용 중인 Node')
                  : node.environment && !node.environment.running ? selected + ' · 종료됨' : selected}</span>
                <strong>{nodeActiveVersionLabel(inventory)}</strong>
              </div>
              <div className="workrail-home-environment-actions">
                {ready && state?.manager.status !== 'checking' && state?.checkedAt && !nodeInspectionStale(inventory) &&
                  <div className="workrail-manager-line">
                    <ManagerBadge node={inventory} />
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
          <button type="button" className="workrail-control workrail-primary workrail-home-node-link" onClick={() => onNode('overview')}>NodeRail 열기</button>
        </section>
        <div className="workrail-home-summaries">
          <SharingWidget sharing={sharing} error={sharingError} onSettings={onSettings} version={version} />
          <HomeNodeWidget node={node} inventory={inventory} working={working} onNode={onNode} />
          {postrail && <PostRailWidget postrail={postrail} onOpen={onPostRail} />}
        </div>
      </div>
    </main>
  )
}

function ManagerFolderButton({ node }: { node: NodeManagement }) {
  const { environment, state } = node
  const wsl = environment?.kind === 'wsl2'
  const name = (environment ? nodeEnvironmentLabel(node) + ' ' + (wsl ? 'nodenv' : 'nvm') + ' ' : '') + 'Node 버전 저장 폴더 열기'
  const reason = wsl && !environment.running ? '환경 시작 후 열 수 있습니다'
    : state?.supported === false ? platformScope
    : !environment ? '관리 환경을 먼저 선택해 주세요'
    : node.openingManager || node.recheckPending || node.catalogPending || node.busy ? '진행 중인 작업이 끝난 후 열 수 있습니다'
    : !nodeEnvironmentReady(node) || !state?.checkedAt || nodeInspectionStale(node) || (wsl && !environment.user)
      ? '환경을 확인한 후 열 수 있습니다'
    : state.manager.status !== 'ready' ? '설치된 관리자를 확인한 후 열 수 있습니다' : null
  return <NodeTooltip trigger={
    <span className="workrail-folder-target" role={reason ? 'group' : undefined} tabIndex={reason ? 0 : undefined}
      aria-label={reason ? name + ' · ' + reason : undefined}>
      <button type="button" className="workrail-control workrail-folder-button" disabled={!!reason}
        aria-label={name} aria-description={reason ?? undefined} onClick={() => void node.openManagerFolder()}>
        <FolderOpen aria-hidden="true" size={17} />
      </button>
    </span>
  }>{reason ? name + ' · ' + reason : name}</NodeTooltip>
}

function HomeNodeWidget({ node, inventory, working, onNode }: { node: NodeManagement; inventory: NodeManagement; working: boolean; onNode: OpenNode }) {
  const hasMessages = nodeOperationMessages(node).length > 0
  const showStatus = !!nodeProgress(node) || hasMessages
  return <section className="workrail-surface workrail-widget workrail-node-widget" aria-label="Node 작업">
    <div className="workrail-node-widget-body" inert={working} aria-busy={working || undefined}>
      <header className="workrail-widget-heading">
        <h3>Node 작업</h3>
        {inventory.state?.supported && <span className="workrail-muted">{nodeEnvironmentLabel(inventory)}</span>}
      </header>
      {(working || !showStatus) && <HomeVersionList node={inventory} onNode={onNode} />}
      {!working && <NodeOperationStatus node={node} showLogs />}
      {!working && hasMessages && <div className="workrail-widget-recovery">
        <button type="button" className="workrail-control" disabled={!nodeCanRecheck(node) || node.recheckPending}
          onClick={() => void node.refresh()}>다시 확인</button>
        <button type="button" className="workrail-link" onClick={() => onNode('overview')}>NodeRail에서 자세히 보기</button>
      </div>}
    </div>
    {working && <NodeOperationOverlay node={node} />}
  </section>
}

function HomeVersionList({ node, onNode }: { node: NodeManagement; onNode: OpenNode }) {
  const { state } = node
  if (!nodeEnvironmentReady(node)) {
    return <p className="workrail-muted">{state?.supported === false ? platformScope : node.environment && !node.environment.running
      ? '환경을 시작하면 설치된 버전을 확인할 수 있습니다.' : '관리 환경을 확인하면 설치된 버전을 표시합니다.'}</p>
  }
  if (!nodeInventoryKnown(node)) {
    return <p className="workrail-muted">{nodeCapabilityReason(state, 'list') ?? (state?.checkedAt ? unknownInventory : '설치된 버전을 확인하고 있습니다…')}</p>
  }
  const versions = nodeInstalledVersions(node)
  if (!versions.length) return <p className="workrail-muted">설치된 버전이 없습니다.</p>
  const wsl = node.environment?.kind === 'wsl2'
  const useReason = nodeCapabilityReason(state, 'use')
  return <>
    <p className="workrail-muted">{wsl ? '이 WSL 사용자의 설치된 버전' : '설치된 버전'} {versions.length}개</p>
    <ul className="workrail-widget-versions" aria-label="설치된 버전">
      {versions.slice(0, maxNodeVersions).map(version => <li key={version}>
        <strong>{version}</strong><NodeVersionAction node={node} version={version} />
      </li>)}
    </ul>
    {useReason && <p className="workrail-muted">{useReason}</p>}
    {versions.length > maxNodeVersions && <button type="button" className="workrail-link workrail-widget-more" onClick={() => onNode('installed')}>
      외 {versions.length - maxNodeVersions}개 <ArrowRight aria-hidden="true" size={14} />
    </button>}
    {wsl && <p className="workrail-widget-meta">프로젝트의 .node-version 설정은 유지됩니다.</p>}
  </>
}
