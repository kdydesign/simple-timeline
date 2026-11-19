import type { SharingState } from '../../shared/sharing'
import { sharingDescription } from '../../shared/sharing-status'
import { Icon } from '../components/Icon'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip'
import { connectedMembers, SharingMembers, sharingRoles } from './SharingMembers'

const policies = {
  on: { label: '일정 알림 켜짐', tip: '앱에서 일정 알림을 허용하고 있습니다.' },
  muted: { label: '전체 알림 무음', tip: '앱의 모든 일정 알림을 끈 상태입니다.' },
  unknown: { label: '알림 상태 확인 불가', tip: '알림 설정을 확인하지 못했습니다.' },
  loading: { label: '알림 상태 확인 중', tip: '알림 설정을 확인하고 있습니다.' },
}

export function PlanRailStatus({ sharing, muted, loading }: { sharing: SharingState | null; muted: boolean | null; loading: boolean }) {
  const connected = sharing?.status === 'connected' && (sharing.role === 'host' || sharing.role === 'member')
  const policy = loading ? 'loading' : muted === null ? 'unknown' : muted ? 'muted' : 'on'
  const { label, tip } = policies[policy]
  const connection = sharing ? sharingDescription(sharing) : '공유 상태 확인 불가'
  return <TooltipProvider><footer className="planrail-status" aria-label="PlanRail 상태">
    <span className="sharing-badge">{sharing ? sharingRoles[sharing.role] : '역할 확인 불가'}</span>
    <Tooltip><TooltipTrigger asChild>
      <span tabIndex={0} className="planrail-connection" data-connected={!!connected}
        aria-label={`공유 연결 상태: ${connection} · 마지막 정상 확인: ${sharing?.lastCheckedAt ?? '없음'}`}>
        {connected ? <Icon name="connection" /> : <span className="connection-unknown" aria-hidden="true">!</span>}
        <span>{connection}</span>
      </span>
    </TooltipTrigger><TooltipContent className="app-tooltip">{connection} · 마지막 정상 확인: {sharing?.lastCheckedAt ?? '없음'}</TooltipContent></Tooltip>
    {sharing?.role === 'host' && <SharingMembers members={connectedMembers(sharing)} footer />}
    <Tooltip><TooltipTrigger asChild>
      <span tabIndex={0} className="planrail-policy" data-testid="notification-policy" data-policy={policy} aria-label={label}>
        <span className="policy-icon"><Icon name="bell" />
          {policy === 'muted' && <svg data-muted-mark viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18" /></svg>}
        </span>{label}
      </span>
    </TooltipTrigger><TooltipContent className="app-tooltip">{tip}</TooltipContent></Tooltip>
  </footer></TooltipProvider>
}
