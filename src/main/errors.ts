import type { ApiError, ErrorCode } from '../shared/types'
import { DomainValidationError } from '../domain/error'
const messages: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '입력값을 확인해 주세요.',
  NOT_FOUND: '항목을 찾을 수 없습니다.',
  FORBIDDEN: '허용되지 않은 요청입니다.',
  DB_NOT_READY: '저장소를 사용할 수 없습니다. 종료 후 다시 실행해 주세요.',
  DB_BUSY: '저장소가 사용 중입니다. 잠시 후 다시 시도해 주세요.',
  STORAGE_FULL: '저장 공간이 부족합니다.',
  STORAGE_IO: '파일을 읽거나 쓸 수 없습니다. 접근 권한을 확인해 주세요.',
  DB_CORRUPT: '저장소 오류가 발견됐습니다. 원본을 보존하고 편집을 중단합니다.',
  SCHEMA_TOO_NEW: '더 최신 앱에서 만든 데이터입니다. 최신 앱을 사용해 주세요.',
  IPC_UNAVAILABLE: '저장 결과를 확인할 수 없습니다. 먼저 다시 조회해 주세요.',
  INTERNAL_ERROR: '처리 중 오류가 발생했습니다.',
}
export function toPublicError(error: unknown): ApiError {
  if (error instanceof DomainValidationError)
    return {
      code: 'VALIDATION_ERROR',
      message: error.message,
      field: error.field,
    }
  const raw =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  let code: ErrorCode = 'INTERNAL_ERROR'
  if (Object.hasOwn(messages, raw)) code = raw as ErrorCode
  else if (/SQLITE_(BUSY|LOCKED)/.test(raw)) code = 'DB_BUSY'
  else if (raw === 'ENOSPC' || raw === 'SQLITE_FULL') code = 'STORAGE_FULL'
  else if (/SQLITE_(CORRUPT|NOTADB)/.test(raw)) code = 'DB_CORRUPT'
  else if (
    /SQLITE_(IOERR|CANTOPEN|READONLY)/.test(raw) ||
    ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EISDIR'].includes(raw)
  )
    code = 'STORAGE_IO'
  return { code, message: messages[code] }
}
export const failure = (code: ErrorCode): Error & { code: ErrorCode } =>
  Object.assign(new Error(messages[code]), { code })
