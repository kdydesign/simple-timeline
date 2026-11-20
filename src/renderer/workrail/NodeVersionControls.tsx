import { useId, useLayoutEffect, useRef, useState, type ReactElement, type Ref } from 'react'
import { Archive, ArrowRightLeft, Check, Circle, CircleCheck, Copy, Download, TriangleAlert } from 'lucide-react'
import { IconButton } from '../components/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import type { NodeRelease } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { nodeCanChange, nodeCanRecheck, nodeInstallReason, nodeMutationProgress, nodeOperationMessages, nodeProgress, nodeVersionStatus } from './nodePresentation'

import './node-operation.css'

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
  if (status === 'active') return <div className="workrail-version-action">
    <span className="workrail-current-version" data-version-state="active" aria-current="true">
      <Check aria-hidden="true" size={16} strokeWidth={3} />사용 중
    </span>
  </div>
  const reason = status === 'missing' ? release?.installReason : null
  const build = status === 'missing' && !reason && release?.sourceOnly
  const action = status === 'installed' ? '사용' : status === 'missing' ? '설치' : '다시 확인'
  const canChange = nodeCanChange(node)
  const disabled = status === null ? !nodeCanRecheck(node)
    : status === 'installed' ? !canChange || node.state?.capabilities?.use.available === false
    : !canChange || !!nodeInstallReason(node.state, release) || node.catalogPending || node.state?.catalog.status !== 'ready'
  return <div className="workrail-version-action">
    <button type="button" className="workrail-control" data-version-state={status ?? 'unknown'}
      aria-label={version + ' ' + action} aria-describedby={reason || build ? description : undefined}
      disabled={disabled} onClick={() => {
        if (status === 'installed' || status === 'missing') void node.mutate({ kind: status === 'installed' ? 'use' : 'install', version })
        else if (status === null) void node.refresh()
      }}>
      {status === 'installed' && <ArrowRightLeft aria-hidden="true" size={15} />}
      {status === 'missing' && <Download aria-hidden="true" size={15} />}
      {action}
    </button>
    {(reason || build) && <span id={description} className="workrail-action-reason">{reason ?? '소스 컴파일'}</span>}
  </div>
}

function OperationLog({ node, open, onToggle }: { node: NodeManagement; open: boolean; onToggle: (open: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const log = useRef<HTMLPreElement>(null)
  const [feedback, setFeedback] = useState('')
  const failure = node.state?.operationResult?.error
  const lines = node.state?.operationLog
  const path = node.state?.operationLogPath
  const content = lines?.length ? lines.join('\n') : path
  useLayoutEffect(() => {
    if (restoreFocus.current) panel.current?.querySelector<HTMLButtonElement>('[data-log-toggle]')?.focus()
    restoreFocus.current = false
  }, [open])
  function toggle() {
    restoreFocus.current = true
    setFeedback('')
    onToggle(!open)
  }
  function copy(button: HTMLButtonElement) {
    const selection = window.getSelection()
    if (!selection || !log.current) return
    log.current.focus()
    const range = document.createRange()
    range.selectNodeContents(log.current)
    selection.removeAllRanges()
    selection.addRange(range)
    let copied = false
    try { copied = document.execCommand?.('copy') } catch { /* Keep the selection for Ctrl+C. */ }
    if (copied) {
      selection.removeAllRanges()
      button.focus()
    }
    setFeedback(copied ? '진단 이력을 복사했습니다.' : '선택된 이력을 Ctrl+C로 복사해 주세요.')
  }
  return <div ref={panel} className="workrail-log">
    {open ? <section aria-label="작업 로그" className={'workrail-surface workrail-log-panel' + (failure ? ' plan-warning' : '')}>
      <header className="workrail-log-header">
        <h4>{failure && <TriangleAlert aria-hidden="true" size={16} />}작업 로그</h4>
        {content && <NodeTooltip trigger={<button type="button" className="workrail-control workrail-log-copy" aria-label="진단 복사"
          onClick={event => copy(event.currentTarget)}><Copy aria-hidden="true" size={15} /></button>}>진단 복사</NodeTooltip>}
        <IconButton tooltip icon="close" label="작업 로그 닫기" data-log-toggle onClick={toggle} />
      </header>
      {failure && <p role="alert">{failure.message}</p>}
      {path && !!lines?.length && <p className="workrail-muted">{path}</p>}
      {content && <pre ref={log} tabIndex={-1} onCopy={event => {
        // HTML clipboard formats may contain the source installation path.
        event.preventDefault()
        event.clipboardData.setData('text/plain', window.getSelection()?.toString() ?? '')
      }}>{content}</pre>}
      {feedback && <span role="status">{feedback}</span>}
    </section> : <button type="button" className="workrail-link" aria-expanded={false} data-log-toggle onClick={toggle}>작업 로그 보기</button>}
  </div>
}

export function NodeOperationStatus({ node, showLogs = false, stackedProgress = false }: { node: NodeManagement; showLogs?: boolean; stackedProgress?: boolean }) {
  const { state } = node
  const progress = nodeProgress(node)
  const stacked = stackedProgress ? nodeMutationProgress(node) : null
  const messages = nodeOperationMessages(node)
  const canCancel = !!state?.busy?.cancellable && state.error?.code !== 'operation-unknown'
  const result = state?.operationResult
  const hasLog = showLogs && !!(result || state?.operationLog?.length || state?.operationLogPath)
  const environmentId = state?.environments?.selectedId ?? 'windows'
  const logId = result?.id ?? (state?.busy?.id && 'live:' + state.busy.id)
  const preference = node.logVisibility[environmentId]
  const open = preference && preference.logId === logId ? preference.open : !!result?.error
  const alerts = hasLog && open ? messages.filter(message => message !== result?.error?.message) : messages
  if (!progress && !alerts.length && !hasLog) return null
  return <div className="workrail-operation">
    {progress && <div className="workrail-operation-progress">
      <p role="status">{stacked ? <>{stacked.name}<br />{stacked.description}</> : progress}</p>
      {canCancel && <button type="button" className="workrail-control" disabled={node.cancelPending}
        onClick={() => void node.cancelOperation()}>작업 취소</button>}
    </div>}
    {alerts.map(message => <p key={message} className="workrail-message" role="alert">{message}</p>)}
    {hasLog && <OperationLog key={environmentId + (logId ?? '')} node={node} open={open}
      onToggle={value => node.showOperationLog(environmentId, logId, value)} />}
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
