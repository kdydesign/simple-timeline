import type { SharingState } from '../../shared/sharing'
import { sharingDescription } from '../../shared/sharing-status'
import type { ApiError } from '../../shared/types'
import { connectedMembers, SharingMembers, sharingRoles } from './SharingMembers'

export function SharingWidget({ sharing, error, onSettings, version }: {
  sharing: (SharingState & { hostVersion?: string | null }) | null
  error: ApiError | null
  onSettings?: () => void
  version?: string
}) {
  const members = connectedMembers(error ? null : sharing)
  const connected = !error && sharing?.status === 'connected' && sharing.role !== 'personal'
  const address = sharing?.address && (sharing.address.includes(':') ? '[' + sharing.address + ']' : sharing.address) + ':' + sharing.port
  const lastChecked = sharing?.lastCheckedAt
  return <section className="workrail-surface workrail-widget workrail-sharing-widget" aria-labelledby="workrail-sharing-heading">
    <header className="workrail-widget-heading">
      <h3 id="workrail-sharing-heading">PlanRail 상태</h3>
      {sharing && <span className="workrail-widget-role">{sharingRoles[sharing.role]}</span>}
    </header>
    <div className="workrail-sharing-summary">
      <span className="workrail-connection" data-connected={!!connected}>
        {sharing && !error ? sharingDescription(sharing) : '공유 상태 확인 불가'}
      </span>
      {sharing?.role === 'host' && address && <span className="workrail-muted">{address}</span>}
    </div>
    {!error && sharing?.role === 'host' && <>
      <div className="workrail-sharing-summary">
        <span className="workrail-muted">연결 <strong>{members.length} / {sharing.devices.length}</strong></span>
        <span className="workrail-muted">승인 대기 <strong>{sharing.pendingPairs.length}명</strong></span>
      </div>
      <SharingMembers members={members} />
    </>}
    {sharing?.role === 'member' && <dl className="workrail-widget-data">
      <div><dt>호스트 주소</dt><dd>{address ?? '확인 불가'}</dd></div>
      <div><dt>호스트 앱 버전</dt><dd>{sharing.hostVersion ?? '확인 불가'}</dd></div>
      <div><dt>마지막 정상 확인</dt><dd>{lastChecked
        ? <time dateTime={lastChecked}>{new Date(lastChecked).toLocaleString('ko-KR')}</time> : '없음'}</dd></div>
    </dl>}
    {error && <p role="alert">{error.message}</p>}
    <div className="workrail-widget-meta">
      <span>내 WorkRail {version ?? '버전 확인 불가'}</span>
      {onSettings && <button type="button" className="workrail-link" onClick={onSettings}>공유 설정에서 관리</button>}
    </div>
  </section>
}
