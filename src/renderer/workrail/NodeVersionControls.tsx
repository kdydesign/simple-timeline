import { useId, type ReactElement, type Ref } from 'react'
import { Archive, Circle, CircleCheck, TriangleAlert } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import type { NodeRelease } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { nodeCanChange, nodeCanRecheck, nodeInstallReason, nodeMutationProgress, nodeOperationMessages, nodeProgress, nodeVersionStatus } from './nodePresentation'

export function NodeTooltip({ trigger, children }: { trigger: ReactElement; children: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
    <TooltipContent className="app-tooltip" collisionPadding={8}>{children}</TooltipContent>
  </Tooltip>
}

export function NodeVersionStatus({ node, version }: { node: NodeManagement; version: string }) {
  const state = nodeVersionStatus(node, version)
  const { icon: Icon, label } = state === 'active' ? { icon: CircleCheck, label: '사용 중' }
    : state === 'installed' ? { icon: Archive, label: '설치됨' }
    : state === 'missing' ? { icon: Circle, label: '미설치' }
    : { icon: TriangleAlert, label: '확인 불가' }
  return <NodeTooltip trigger={
    <span className="workrail-version-status" data-state={state ?? 'unknown'} role="img" tabIndex={0} aria-label={label}>
      <Icon aria-hidden="true" size={16} />
    </span>
  }>{label}</NodeTooltip>
}

export function NodeVersionAction({ node, version, release }: { node: NodeManagement; version: string; release?: NodeRelease }) {
  const description = useId()
  const status = nodeVersionStatus(node, version)
  const reason = status === 'missing' ? release?.installReason : null
  const build = status === 'missing' && !reason && release?.sourceOnly
  const action = status === 'active' ? '사용 중' : status === 'installed' ? '사용' : status === 'missing' ? '설치' : '다시 확인'
  const canChange = nodeCanChange(node)
  const disabled = status === 'active' || (status === null ? !nodeCanRecheck(node)
    : status === 'installed' ? !canChange || node.state?.capabilities?.use.available === false
    : !canChange || !!nodeInstallReason(node.state, release) || node.catalogPending || node.state?.catalog.status !== 'ready')
  return <div className="workrail-version-action">
    <button type="button" className="workrail-control" data-active-version={status === 'active' || undefined}
      aria-label={version + ' ' + action} aria-describedby={reason || build ? description : undefined}
      disabled={disabled} onClick={() => {
        if (status === 'installed' || status === 'missing') void node.mutate({ kind: status === 'installed' ? 'use' : 'install', version })
        else if (status === null) void node.refresh()
      }}>{action}</button>
    {(reason || build) && <span id={description} className="workrail-action-reason">{reason ?? '소스 컴파일'}</span>}
  </div>
}

export function NodeOperationStatus({ node, showLogs = false, stackedProgress = false }: { node: NodeManagement; showLogs?: boolean; stackedProgress?: boolean }) {
  const { state } = node
  const progress = nodeProgress(node)
  const stacked = stackedProgress ? nodeMutationProgress(node) : null
  const messages = nodeOperationMessages(node)
  const canCancel = !!state?.busy?.cancellable && state.error?.code !== 'operation-unknown'
  const log = state?.operationLog
  const logPath = state?.operationLogPath
  if (!progress && !messages.length && !(showLogs && (log?.length || logPath))) return null
  return <div className="workrail-operation">
    {progress && <div className="workrail-operation-progress">
      <p role="status">{stacked ? <>{stacked.name}<br />{stacked.description}</> : progress}</p>
      {canCancel && <button type="button" className="workrail-control" disabled={node.cancelPending}
        onClick={() => void node.cancelOperation()}>작업 취소</button>}
    </div>}
    {messages.map(message => <p key={message} className="workrail-message" role="alert">{message}</p>)}
    {showLogs && (logPath || !!log?.length) && <details className="workrail-node-details">
      <summary>작업 로그</summary>
      {logPath && <p className="workrail-muted">{logPath}</p>}
      {!!log?.length && <pre>{log.join('\n')}</pre>}
    </details>}
  </div>
}

export function NodeOperationOverlay({ node, overlayRef }: { node: NodeManagement; overlayRef?: Ref<HTMLDivElement> }) {
  return <div className="workrail-node-overlay" ref={overlayRef} tabIndex={-1} role="group" aria-label="Node 작업 진행">
    <div className="workrail-node-overlay-content">
      <span className="workrail-node-spinner" aria-hidden="true" />
      <NodeOperationStatus node={node} stackedProgress showLogs />
    </div>
  </div>
}
