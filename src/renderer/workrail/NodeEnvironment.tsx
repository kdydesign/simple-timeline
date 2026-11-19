import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Dialog } from 'radix-ui'
import type { NodeEnvironment as Environment } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { nodeCanRecheck, nodeEnvironmentLabel, nodeManagerLabel } from './nodePresentation'

export type OpenEnvironment = (event: MouseEvent<HTMLButtonElement>) => void

export function useEnvironmentPicker(node: NodeManagement) {
  const environments = node.state?.environments
  const needsSelection = environments?.status === 'ready' && !environments.selectedId && environments.items.length > 0
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (needsSelection) setOpen(true)
  }, [needsSelection])
  const openPicker: OpenEnvironment = event => {
    opener.current = event.currentTarget
    setOpen(true)
  }
  return {
    openPicker,
    dialog: <EnvironmentPicker node={node} open={open && environments?.status === 'ready'}
      onOpenChange={setOpen} onReturnFocus={() => {
        const target = opener.current ?? document.querySelector<HTMLButtonElement>('.workrail-dock [aria-current="page"]')
        target?.focus()
        opener.current = null
      }} />,
  }
}

function EnvironmentPicker({ node, open, onOpenChange, onReturnFocus }: {
  node: NodeManagement
  open: boolean
  onOpenChange: (open: boolean) => void
  onReturnFocus: () => void
}) {
  const environments = node.state?.environments
  async function select(environment: Environment) {
    if (environment.id === environments?.selectedId || await node.changeEnvironment({ kind: 'select', id: environment.id })) onOpenChange(false)
  }
  return <Dialog.Root open={open} onOpenChange={value => { if (!node.environmentPending) onOpenChange(value) }}>
    <Dialog.Portal>
      <Dialog.Overlay className="workrail-dialog-overlay" />
      <Dialog.Content className="workrail-dialog" onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus() }}>
        <Dialog.Title>관리 환경 선택</Dialog.Title>
        <Dialog.Description>Node 버전을 관리할 Windows 또는 WSL2 환경을 선택하세요.</Dialog.Description>
        {environments?.error && <p role="alert">{environments.error.message}</p>}
        {(node.controlError ?? node.state?.error) && <p role="alert">{(node.controlError ?? node.state?.error)?.message}</p>}
        <ul className="workrail-environment-list">
          {environments?.items.map(environment => <li key={environment.id}>
            <button type="button" className="workrail-control" disabled={node.busy || node.catalogPending}
              aria-current={environment.id === environments.selectedId ? 'true' : undefined}
              onClick={() => void select(environment)}>
              <strong>{environment.kind === 'wsl2' ? 'WSL2 · ' + environment.label : environment.label}</strong>
              <span>{environment.kind === 'wsl2'
                ? environment.running ? environment.user ?? '기본 사용자 확인 전' : '종료됨 · 기본 사용자 확인 전'
                : environment.id === environments.selectedId ? '현재 관리 환경' : '로컬 환경'}</span>
            </button>
          </li>)}
        </ul>
        <Dialog.Close type="button" className="workrail-control" disabled={!!node.environmentPending}>닫기</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function EnvironmentActions({ node, onEnvironment }: { node: NodeManagement; onEnvironment: OpenEnvironment }) {
  const { state, environment } = node
  const environments = state?.environments
  if (!environments) return null
  const canSelect = environments.status === 'ready' && environments.items.length > 0 && (!environment || environments.items.length > 1)
  const stopped = environment?.kind === 'wsl2' && !environment.running
  if (!canSelect && !stopped && environments.status !== 'error') return null
  return <div className="workrail-environment-actions">
    {canSelect && <button type="button" className="workrail-control" disabled={node.busy || node.catalogPending}
      onClick={onEnvironment}>{environment ? '환경 변경' : '환경 선택'}</button>}
    {stopped && <button type="button" className="workrail-control workrail-primary" disabled={node.busy}
      onClick={() => void node.changeEnvironment({ kind: 'start' })}>환경 시작</button>}
    {environments.status === 'error' && <button type="button" className="workrail-control" disabled={!nodeCanRecheck(node)}
      onClick={() => void node.refresh()}>다시 확인</button>}
  </div>
}

export function EnvironmentName({ node }: { node: NodeManagement }) {
  return <span>{nodeEnvironmentLabel(node)}{node.environment?.kind === 'wsl2' && !node.environment.running && ' · 종료됨'}</span>
}

export function ManagerBadge({ node }: { node: NodeManagement }) {
  const { state, environment } = node
  if (!state) return null
  return <span className="workrail-tag workrail-manager-badge" data-ready={state.manager.status === 'ready'}>
    {nodeManagerLabel(state, environment?.kind === 'wsl2')}
  </span>
}
