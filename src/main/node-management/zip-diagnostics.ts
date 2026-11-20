import { constants } from 'node:os'

const stages = {
  'inspect-root': ['저장 경로 확인', 'nvm 저장 경로를 확인할 수 없습니다. 폴더가 존재하고 현재 계정으로 열 수 있는지 확인해 주세요.'],
  'create-root': ['저장 폴더 생성', 'nvm 저장 폴더를 만들 수 없습니다. 상위 폴더의 쓰기 권한을 확인해 주세요.'],
  'check-write': ['쓰기 권한 확인', 'nvm 저장 폴더에 쓸 수 없습니다. 현재 계정의 쓰기 권한을 확인해 주세요.'],
  'create-staging': ['임시 폴더 생성', '임시 설치 폴더를 만들 수 없습니다. nvm 저장 폴더의 쓰기 권한과 디스크 여유 공간을 확인해 주세요.'],
  'inspect-target': ['대상 설치 확인', '대상 설치 폴더를 확인할 수 없습니다. 현재 계정으로 해당 버전의 폴더를 열 수 있는지 확인해 주세요.'],
  'acl-read': ['권한 조회', '설치 폴더의 권한 정보를 확인할 수 없습니다. 폴더 속성의 보안 탭에서 현재 계정의 읽기 권한을 확인한 뒤 다시 검사해 주세요.'],
  'acl-policy': ['권한 규칙 확인', '설치 폴더가 nvm 2.x의 권한 규칙을 충족하지 않습니다. 일반 사용자 그룹에 쓰기를 허용하는지 관리자와 확인해 주세요.'],
  extract: ['압축 해제', '임시 설치 폴더에 ZIP을 풀 수 없습니다. 쓰기 권한과 디스크 여유 공간을 확인해 주세요.'],
  'verify-staging': ['설치 파일 확인', '임시 설치 파일을 확인할 수 없습니다. 파일 접근 권한과 보안 프로그램의 차단 기록을 확인해 주세요.'],
  'before-publish': ['이동 전 검증', '설치 파일을 이동하기 전에 환경을 확인할 수 없습니다. nvm 환경을 다시 검사해 주세요.'],
  publish: ['최종 이동', '임시 설치 폴더를 대상 버전 폴더로 옮길 수 없습니다. 폴더를 사용 중인 프로그램과 저장 폴더의 쓰기 권한을 확인한 뒤 다시 시도해 주세요.'],
  cleanup: ['정리', '임시 설치 폴더를 정리할 수 없습니다. 설치 폴더를 사용 중인 프로그램을 닫고 쓰기 권한을 확인해 주세요.'],
} as const
type Stage = keyof typeof stages
const folders = { root: '저장 루트', staging: '임시 폴더', target: '대상 폴더' } as const
export interface ZipIssue { stage: Stage; role: keyof typeof folders; osCode?: string }

// Only confirmed OS identifiers may enter renderer history. Child process
// exit codes, stderr, command lines, messages and paths stay in main.
function osCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return undefined
  const code = error.code
  return Object.hasOwn(constants.errno, code) || /^(?:WIN32_\d{1,5}|ERROR_VIRUS_INFECTED|ERROR_VIRUS_DELETED)$/.test(code) ? code : undefined
}

export class ZipStepError extends Error {
  readonly detail: ZipIssue
  readonly code?: string
  cleanup?: ZipIssue
  incompleteTarget?: true
  constructor(stage: Stage, role: ZipIssue['role'], cause?: unknown) {
    super(cause instanceof Error ? cause.message : stages[stage][1], { cause })
    this.code = osCode(cause)
    this.detail = { stage, role, ...(this.code ? { osCode: this.code } : {}) }
  }
}

export async function zipStep<T>(stage: Stage, role: ZipIssue['role'], work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) { throw error instanceof ZipStepError ? error : new ZipStepError(stage, role, error) }
}

export function zipIssueText({ stage, role, osCode }: ZipIssue) {
  return [folders[role], stages[stage][0], osCode].filter(Boolean).join(' · ')
}

export const zipIssueMessage = (issue: ZipIssue) => stages[issue.stage][1]
