export interface PrConsoleLine {
  id: number
  text: string
  ending?: string
  error: boolean
}

export interface PrSendError {
  requestId: string
  environmentId: string
  message: string
  preflight: boolean
}

// Only these fixed diagnoses can be submitted by the renderer.
export const draftProblems = {
  dispatch: 'PostRail 전송 요청을 시작할 수 없습니다.',
  url: '요청 URL과 환경 변수를 확인하세요.',
  headers: '요청 헤더의 이름, 값, 중복 여부를 확인하세요.',
  params: '요청 파라미터의 이름과 값을 확인하세요.',
  body: '요청 본문의 형식과 입력값을 확인하세요.',
  timeout: '응답 대기 시간을 확인하세요.',
  auth: '환경 관리에서 로그인 요청과 토큰 사용 설정을 확인하세요.',
  count: '반복 횟수를 양의 정수로 입력하세요.',
  environment: '대상 환경을 선택하세요.',
} as const
export type PrDraftProblem = keyof typeof draftProblems

// Editor diagnostics can contain an unregistered variable or a path parameter name.
// Rebuild the console message from approved phrases and numeric row positions.
const fixedIssues = new Set([
  '이름: 값 형식으로 입력하세요.', 'HTTP 헤더 이름을 확인하세요.', '사용할 수 없는 HTTP 헤더 이름입니다.',
  '같은 이름의 헤더가 두 번 있습니다.', '환경 인증에 사용할 헤더 이름과 겹칩니다.',
  '올바른 HTTP 또는 HTTPS URL을 입력하세요.', 'HTTP 또는 HTTPS URL을 입력하세요.',
  'URL에서 계정 정보와 조각 식별자를 제거하세요.', 'URL에는 보호 변수 password를 사용할 수 없습니다.',
  '환경 관리에서 비밀번호를 입력하세요.', 'index는 POST 본문의 문자열 값에서만 사용할 수 있습니다.',
  '본문에 JSON 객체를 입력하세요.', '올바른 JSON 객체를 입력하세요.', '파일을 다시 선택하세요.', '이름을 입력하세요.',
  'multipart의 Content-Type은 자동값으로 복원하거나 raw로 전환하세요.',
  '응답 대기 시간을 양수로 입력하세요(최대 2147483.647초).',
])

export function safeDraftMessage(category: PrDraftProblem, diagnosis: string) {
  const location = /^(?:(form-data )?([1-9]\d{0,6})행(?: · |: )|(binary): )/.exec(diagnosis)
  const issue = diagnosis.slice(location?.[0].length ?? 0)
  let text = draftProblems[category] as string
  if (fixedIssues.has(issue)) text = issue
  else if (issue.startsWith('환경 관리에서 ') && issue.endsWith('’를 등록하세요.')) text = '등록되지 않은 환경 변수가 있습니다.'
  else if (category === 'params' && issue.startsWith('경로 값 ')) text = '경로 파라미터 값을 입력하세요.'
  else if (category === 'auth' && issue.startsWith('환경 로그인에 필요한 항목 · ')) {
    const names = issue.slice('환경 로그인에 필요한 항목 · '.length).split(', ')
    const missing = ['로그인 URL','토큰 수신 API 주소','토큰 JSON 경로','토큰 헤더','보호 비밀번호','실행 환경'].filter(name => names.includes(name))
    if (missing.length) text = '환경 로그인에 필요한 항목 · ' + missing.join(', ')
  }
  return (location?.[0] ?? '') + text
}
