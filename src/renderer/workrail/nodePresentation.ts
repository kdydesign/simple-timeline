import type { NodeCapabilities, NodeManagementState, NodeOperation, NodeRelease } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { compareVersion, type NodeCatalogRow } from './nodeCatalogSort'

export const supportedManager = 'nvm-windows 1.2.2'
export const platformScope = 'Node 관리는 Windows x64에서 사용할 수 있습니다.'
export const unknownInventory = '설치된 버전을 확인할 수 없습니다.'

const phases: Record<NodeOperation['phase'], string> = {
  checking: '환경 검사 중',
  downloading: '공식 설치 파일 다운로드 및 검증 중',
  waiting: 'Windows 권한 확인 또는 작업 완료 대기 중',
  compiling: '소스 컴파일 중',
  extracting: '압축 해제 및 설치 중',
  verifying: '변경 결과 검증 중',
}
export function nodeProgress({ state, mutation, environmentPending, environment, cancelPending }: NodeManagement) {
  if (environmentPending === 'start') return (environment?.label ?? 'WSL') + ' 시작 중'
  if (environmentPending === 'select') return '관리 환경 변경 중'
  if (state?.error?.code === 'operation-unknown') return '작업 완료 여부 확인 필요'
  const operation = state?.busy ?? mutation
  if (!operation) return cancelPending ? '작업 취소 확인 중' : null
  const name = operation.kind === 'remove-standalone' ? '기존 Node.js 제거' : operation.kind === 'install-manager' ? supportedManager + ' 설치'
    : operation.kind === 'install' ? operation.version + ' 설치' : operation.version + ' 사용'
  return name + ' · ' + phases[state?.busy?.phase ?? 'checking'] + (cancelPending ? ' · 작업 취소 확인 중' : '')
}

export function nodeEnvironmentReady({ state, environment }: NodeManagement) {
  return !!state?.supported && (!state.environments || (state.environments.status === 'ready' && !!environment?.running))
}

export function nodeEnvironmentLabel({ state, environment }: NodeManagement) {
  if (environment) return environment.kind === 'windows' ? environment.label
    : environment.label + ' · ' + (environment.user ?? '기본 사용자 확인 전')
  if (state?.supported && !state.environments) return 'Windows'
  const environments = state?.environments
  if (environments?.status === 'error') return '관리 환경 확인 불가'
  if (environments?.status === 'ready') return '관리 환경 선택 필요'
  return '관리 환경 확인 중'
}

export function nodeDefaultVersion({ state, environment }: NodeManagement) {
  return environment?.kind === 'wsl2' || state?.manager.version?.startsWith('2.') === true
}

export function nodeInspectionStale({ state, error }: NodeManagement) {
  return !!error || state?.error?.code === 'inspection-failed'
}

export function nodeInventoryKnown(node: NodeManagement) {
  const { state } = node
  return nodeEnvironmentReady(node) && !!state?.checkedAt && !nodeInspectionStale(node)
    && (!state.capabilities || state.capabilities.list.available)
    && (state.manager.status === 'ready' || state.manager.status === 'missing')
    && state.error?.code !== 'operation-unknown'
}

export function nodeActiveVersionLabel(node: NodeManagement) {
  const { state, environment } = node
  if (nodeInspectionStale(node) || state?.environments?.status === 'error') return '확인할 수 없음'
  if (environment?.kind === 'wsl2' && !environment.running) return '확인 전'
  if (!nodeEnvironmentReady(node)) return state?.environments?.status === 'ready' ? '환경 선택 필요' : '환경 확인 중…'
  if (state?.activeVersion) return state.activeVersion
  if (state?.activeSource || state?.conflicts.some(conflict => conflict.code === 'path-priority')) return '확인할 수 없음'
  return state?.checkedAt ? '사용 중인 버전 없음' : '환경 확인 중…'
}

export function nodeVersionStatus(node: NodeManagement, version: string): NodeCatalogRow['status'] {
  if (!nodeInventoryKnown(node)) return null
  const state = node.state!
  if (state.activeVersion === version && (state.activeSource === 'nvm' || state.activeSource === 'nodenv')) return 'active'
  return state.installedVersions.includes(version) ? 'installed' : 'missing'
}

export function nodeInstalledVersions(node: NodeManagement) {
  return [...(node.state?.installedVersions ?? [])].sort((a, b) =>
    Number(nodeVersionStatus(node, b) === 'active') - Number(nodeVersionStatus(node, a) === 'active') || compareVersion(b, a))
}

export function nodeCapabilityReason(state: NodeManagementState | null, capability: keyof NodeCapabilities) {
  const feature = state?.capabilities?.[capability]
  return feature && !feature.available ? feature.reason ?? { list: unknownInventory, install: '설치 기능을 사용할 수 없습니다.', use: '버전 전환 기능을 사용할 수 없습니다.' }[capability] : null
}

export function nodeCanChange(node: NodeManagement) {
  return nodeInventoryKnown(node) && !node.busy && node.state?.manager.status === 'ready'
    && !node.state.removal?.rebootRequired && (!!node.state.capabilities || !node.state.conflicts.length)
    && node.state.error?.code !== 'shutdown'
}

export function nodeInstallReason(state: NodeManagementState | null, release?: NodeRelease) {
  return release?.installReason || nodeCapabilityReason(state, 'install')
}

export function nodeCanRecheck(node: NodeManagement) {
  // The selected WSL adapter can reconcile an unconfirmed operation on recheck.
  return node.available && !node.environmentPending && !node.cancelPending && !node.mutation
    && (!node.busy || node.state?.error?.code === 'operation-unknown')
}

export function nodeOperationMessages({ state, error, controlError, recoveryError, maintenanceError, openingMaintenance }: NodeManagement) {
  const primary = state?.error?.code === 'operation-unknown' ? state.error : error ?? state?.error
  const messages = new Set([primary?.message, controlError?.message].filter((message): message is string => !!message))
  if (recoveryError) messages.add('환경 재검사 실패 · ' + recoveryError.message)
  const handoffError = maintenanceError ?? state?.maintenance?.error
  if (!openingMaintenance && handoffError) messages.add(handoffError)
  return [...messages]
}

export function nodeManagerLabel(state: NodeManagementState, wsl: boolean) {
  const name = state.manager.kind ?? (wsl ? 'nodenv' : 'nvm-windows')
  const manager = name === 'nvm-windows' && state.manager.version ? 'NVM' : name
  const identity = state.manager.version ? manager + ' ' + state.manager.version : manager
  if (state.manager.status === 'ready') return state.manager.version ? identity + ' 설치' : identity + ' 확인됨'
  if (state.manager.status === 'missing') return name + ' 설치 필요'
  if (state.manager.status === 'error') return identity + ' 상태 확인 필요'
  return name + ' 검사 중…'
}
