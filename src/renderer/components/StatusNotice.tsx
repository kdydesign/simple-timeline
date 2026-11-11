import type { ApiError } from '../../shared/types'
import type { TimelinePhase } from '../state/useTimeline'
export function StatusNotice({
  phase,
  error,
  notice,
  onRefresh,
}: {
  phase: TimelinePhase
  error: ApiError | null
  notice: string
  onRefresh: () => void
}) {
  return (
    <div className="status">
      <p aria-live="polite" className={phase === 'saving' ? 'sr-only' : undefined}>
        {phase === 'loading'
          ? '조회 중…'
          : phase === 'saving'
            ? '저장 중…'
            : notice}
      </p>
      {error && (
        <div role="alert" id="form-error">
          <p>{error.message}</p>
          {['stale', 'uncertain', 'blocked'].includes(phase) && (
            <>
              <p>
                {phase === 'blocked'
                  ? '원본 파일을 보존합니다. 종료 후 다시 실행해 주세요.'
                  : '마지막 정상 데이터입니다. 먼저 다시 조회해 주세요.'}
              </p>
              <button data-focus="refresh" onClick={onRefresh}>
                다시 조회
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
