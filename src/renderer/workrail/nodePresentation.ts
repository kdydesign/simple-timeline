import type { NodeManagementState, NodeOperation } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'

export const supportedManager = 'nvm-windows 1.2.2'
export const platformScope = 'Node 관리는 Windows x64에서 사용할 수 있습니다.'

const phases: Record<NodeOperation['phase'], string> = {
  checking: '환경 검사 중',
  downloading: '공식 설치 파일 다운로드 및 검증 중',
  waiting: 'Windows 권한 확인 또는 작업 완료 대기 중',
  verifying: '변경 결과 검증 중',
}
export function nodeProgress({ state, mutation }: NodeManagement) {
  if (state?.error?.code === 'operation-unknown') return '작업 완료 여부 확인 필요'
  const operation = state?.busy ?? mutation
  if (!operation) return null
  const name = operation.kind === 'install-manager' ? supportedManager + ' 설치'
    : operation.kind === 'install' ? operation.version + ' 설치' : operation.version + ' 사용'
  return name + ' · ' + phases[state?.busy?.phase ?? 'checking']
}

export function nodeInspectionStale({ state, error }: NodeManagement) {
  return !!error || state?.error?.code === 'inspection-failed'
}

export function nodeManagerLabel(state: NodeManagementState) {
  if (state.manager.status === 'missing') return 'nvm-windows 설치 필요'
  if (state.manager.status === 'error') return state.manager.version
    ? 'nvm-windows ' + state.manager.version + ' 확인 필요' : 'nvm-windows 상태 확인 필요'
  if (state.manager.status === 'checking') return 'nvm-windows 검사 중…'
  return state.manager.version ? 'nvm-windows ' + state.manager.version : 'nvm-windows 확인됨'
}
